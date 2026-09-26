'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { clientSchema, type ClientFormValues, type TeamPersonFormValues } from '@/lib/validation/client.schema';
import { clientRepository } from '@/lib/repositories';
import { NetworkError } from '@/lib/repositories';
import type { Client, TeamAccessLinks } from '@/lib/types';
import { maskPhone } from '@/lib/utils/phone';
import { Button } from '@/components/ui/Button';
import { Field, describedBy } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { TeamAccessLinkField } from './TeamAccessLinkField';
import { TeamPlaceFields } from './TeamPlaceFields';

interface ClientFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Ausente ao criar um novo time. */
  client?: Client | null;
  onSaved?: (client: Client) => void;
}

const EMPTY: ClientFormValues = {
  name: '',
  photo: null,
  notes: '',
  stateUf: '',
  cities: [],
  people: [],
};

/** Criacao e edicao de time. Mesma validacao nos dois modos. */
export function ClientFormModal({ open, onClose, client, onSaved }: ClientFormModalProps) {
  const toast = useToast();
  const editing = Boolean(client);

  /**
   * Time recem-criado.
   *
   * O modal nao fecha na hora: primeiro o ADMIN copia o link de acesso dos
   * administradores daquele time. O link continua disponivel depois, no
   * cartao "Acesso dos administradores" da pagina do time.
   */
  const [created, setCreated] = useState<TeamAccessLinks | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: EMPTY,
  });

  // A foto vive no proprio formulario: nao ha estado duplicado para sincronizar.
  const photo = useWatch({ control, name: 'photo' });
  const stateUf = useWatch({ control, name: 'stateUf' });
  // `useFieldArray` nao serve aqui: municipio e uma lista de textos, sem
  // identidade propria — o proprio nome ja identifica cada item.
  const cities = useWatch({ control, name: 'cities' });

  const {
    fields: peopleFields,
    append: appendPerson,
    remove: removePerson,
  } = useFieldArray({ control, name: 'people', keyName: '_fieldKey' });

  /** Fechar sempre descarta a confirmacao: reabrir volta ao formulario. */
  function close() {
    setCreated(null);
    onClose();
  }

  /**
   * Qual time ja foi carregado nesta abertura.
   *
   * Sem esta marca, o efeito abaixo dispara de novo a cada objeto NOVO de
   * `client` — e ele chega assim sempre que o painel releva os dados, o que
   * acontece sozinho ao voltar para a aba. O `reset` entao apagava o que o
   * ADMIN estava digitando. Carrega-se UMA vez por abertura.
   */
  const timeCarregado = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      timeCarregado.current = null;
      return;
    }

    const alvo = client?.id ?? 'novo';
    if (timeCarregado.current === alvo) return;
    timeCarregado.current = alvo;

    reset(
      client
        ? {
            name: client.name,
            photo: client.photo,
            notes: client.notes,
            // Time criado antes da 038 vem sem estado: o campo abre vazio e
            // o ADMIN preenche aqui — e por isso que a edicao nao recusa
            // quem ainda nao tem.
            stateUf: client.stateUf ?? '',
            cities: client.cities,
            people: client.people.map((person) => ({
              id: person.id,
              name: person.name,
              phone: person.phone,
              photo: person.photo,
            })),
          }
        : EMPTY,
    );
  }, [open, client, reset]);

  // Duplo clique nao dispara um segundo envio: o proprio estado do
  // react-hook-form ja bloqueia isso enquanto `isSubmitting` for verdadeiro,
  // porque o botao de salvar fica desabilitado (ver `Button loading`).
  async function onSubmit(values: ClientFormValues) {
    try {
      if (client) {
        const saved = await clientRepository.update(client.id, values);
        toast.success('Time atualizado.');
        onSaved?.(saved);
        close();
        return;
      }

      const result = await clientRepository.create(values);
      onSaved?.(result.client);
      // O modal permanece aberto: os dois enderecos de acesso aparecem aqui,
      // para serem copiados antes de sair.
      setCreated(result.accessLinks);
    } catch (error) {
      if (error instanceof NetworkError) {
        toast.error(error.message);
        return;
      }
      toast.error('Não foi possível salvar o time. Tente novamente.');
    }
  }

  // Time recem-criado: o formulario da lugar a confirmacao com o link.
  if (created !== null) {
    return (
      <Modal
        open={open}
        onClose={close}
        title="Time criado com sucesso"
        size="lg"
        footer={<Button onClick={close}>Concluir</Button>}
      >
        <div className="space-y-5">
          {/* Dois enderecos, um por publico: cada um so aceita os telefones
              do seu grupo. Nenhum deles substitui o link de recrutamento. */}
          <div className="space-y-2">
            <TeamAccessLinkField
              token={created.TEAM_ADMIN.token}
              url={created.TEAM_ADMIN.url}
              label="Link de acesso — Administradores do time"
            />
            <p className="text-sm text-ink-500">Envie este link aos administradores do time.</p>
          </div>

          <div className="space-y-2">
            <TeamAccessLinkField
              token={created.EQUIPE.token}
              url={created.EQUIPE.url}
              label="Link de acesso — Equipe"
            />
            <p className="text-sm text-ink-500">Envie este link aos membros da equipe.</p>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        busy={isSubmitting}
        title={editing ? 'Editar time' : 'Novo time'}
        description={
          editing
            ? 'Atualize os dados de identificação do time.'
            : 'Cadastre o time para gerar o formulário e o link de convite.'
        }
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button form="form-cliente" type="submit" loading={isSubmitting}>
              {editing ? 'Salvar alterações' : 'Cadastrar time'}
            </Button>
          </>
        }
      >
        <form id="form-cliente" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div>
            <span className="mb-2 block text-sm font-medium text-ink-700">Foto</span>
            <PhotoUpload
              value={photo}
              onChange={(next) => setValue('photo', next, { shouldDirty: true })}
              name={client?.name ?? ''}
              onError={(message) => toast.error(message)}
            />
          </div>

          <Field id="cliente-nome" label="Nome do time" required error={errors.name?.message}>
            <Input
              id="cliente-nome"
              placeholder="Nome do time"
              autoComplete="off"
              invalid={Boolean(errors.name)}
              aria-describedby={describedBy('cliente-nome', undefined, errors.name?.message)}
              {...register('name')}
            />
          </Field>

          {/* De onde o time e. Logo abaixo do nome, porque e identidade do
              time — nao configuracao. */}
          <TeamPlaceFields
            stateUf={stateUf}
            cities={cities}
            onStateChange={(uf) => setValue('stateUf', uf, { shouldDirty: true, shouldValidate: true })}
            onCitiesChange={(lista) => setValue('cities', lista, { shouldDirty: true })}
            stateError={errors.stateUf?.message}
          />

          <Field
            id="cliente-notas"
            label="Observações"
            help="Anotação interna. Não aparece no formulário público."
            error={errors.notes?.message}
          >
            <Textarea
              id="cliente-notas"
              rows={3}
              placeholder="Informações úteis para a operação"
              invalid={Boolean(errors.notes)}
              aria-describedby={describedBy(
                'cliente-notas',
                'Anotação interna.',
                errors.notes?.message,
              )}
              {...register('notes')}
            />
          </Field>

          <div className="space-y-3 border-t border-line pt-5">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Administradores do time</h3>
              <p className="mt-0.5 text-xs text-ink-500">
                Eles entram no painel com o link de acesso do time e o próprio telefone.
              </p>
            </div>

            {peopleFields.length === 0 ? (
              <p className="rounded-control border border-dashed border-line-strong bg-ink-50 p-4 text-center text-sm text-ink-500">
                {errors.people?.message ?? 'Nenhuma pessoa adicionada.'}
              </p>
            ) : (
              <div className="space-y-3">
                {peopleFields.map((field, index) => (
                  <TeamPersonCard
                    key={field._fieldKey}
                    control={control}
                    register={register}
                    setValue={setValue}
                    index={index}
                    errors={errors.people?.[index]}
                    onRemove={() => removePerson(index)}
                    onImageError={(message) => toast.error(message)}
                  />
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="secondary"
              onClick={() => appendPerson({ name: '', phone: '', photo: null })}
            >
              <Plus aria-hidden="true" className="size-4" />
              {peopleFields.length === 0 ? 'Adicionar pessoa' : 'Adicionar outra pessoa'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

interface TeamPersonCardProps {
  control: Control<ClientFormValues>;
  register: UseFormRegister<ClientFormValues>;
  setValue: UseFormSetValue<ClientFormValues>;
  index: number;
  errors?: FieldErrors<TeamPersonFormValues>;
  onRemove: () => void;
  onImageError: (message: string) => void;
}

/** Um card por pessoa: foto, nome, telefone e a acao de remover. */
function TeamPersonCard({
  control,
  register,
  setValue,
  index,
  errors,
  onRemove,
  onImageError,
}: TeamPersonCardProps) {
  const photo = useWatch({ control, name: `people.${index}.photo` });
  const name = useWatch({ control, name: `people.${index}.name` });

  const nomeId = `pessoa-${index}-nome`;
  const telefoneId = `pessoa-${index}-telefone`;

  return (
    <div className="rounded-control border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PhotoUpload
          value={photo}
          onChange={(next) => setValue(`people.${index}.photo`, next, { shouldDirty: true })}
          name={name}
          onError={onImageError}
        />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="shrink-0 self-start text-danger-600 hover:bg-danger-50"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Remover pessoa
        </Button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field id={nomeId} label="Nome completo" required error={errors?.name?.message}>
          <Input
            id={nomeId}
            placeholder="Nome completo"
            autoComplete="off"
            invalid={Boolean(errors?.name)}
            aria-describedby={describedBy(nomeId, undefined, errors?.name?.message)}
            {...register(`people.${index}.name`)}
          />
        </Field>

        <Field id={telefoneId} label="Telefone" required error={errors?.phone?.message}>
          <Controller
            control={control}
            name={`people.${index}.phone`}
            render={({ field }) => (
              <Input
                id={telefoneId}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="(00) 00000-0000"
                invalid={Boolean(errors?.phone)}
                aria-describedby={describedBy(telefoneId, undefined, errors?.phone?.message)}
                value={maskPhone(field.value ?? '')}
                onChange={(event) => field.onChange(maskPhone(event.target.value))}
                onBlur={field.onBlur}
              />
            )}
          />
        </Field>
      </div>
    </div>
  );
}
