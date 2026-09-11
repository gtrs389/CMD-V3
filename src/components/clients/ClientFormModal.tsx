'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { clientSchema, type ClientFormValues } from '@/lib/validation/client.schema';
import { clientRepository } from '@/lib/repositories';
import { NetworkError } from '@/lib/repositories';
import type { Client, GeneratedCredential } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Field, describedBy } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { CredentialsModal } from '@/components/settings/CredentialsModal';

interface ClientFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Ausente ao criar um novo candidato. */
  client?: Client | null;
  onSaved?: (client: Client) => void;
}

const EMPTY: ClientFormValues = { name: '', email: '', photo: null, notes: '' };

/** Criacao e edicao de candidato. Mesma validacao nos dois modos. */
export function ClientFormModal({ open, onClose, client, onSaved }: ClientFormModalProps) {
  const toast = useToast();
  const editing = Boolean(client);

  /**
   * Acesso recem-criado do candidato.
   *
   * A senha temporaria existe apenas neste estado e some ao fechar: nada e
   * gravado em banco, log, URL ou armazenamento do navegador.
   */
  const [access, setAccess] = useState<{
    credential: GeneratedCredential | null;
    message: string | null;
  } | null>(null);

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

  useEffect(() => {
    if (!open) return;
    reset(
      client
        ? { name: client.name, email: client.email, photo: client.photo, notes: client.notes }
        : EMPTY,
    );
  }, [open, client, reset]);

  async function onSubmit(values: ClientFormValues) {
    try {
      if (client) {
        const saved = await clientRepository.update(client.id, values);
        toast.success('Candidato atualizado.');
        onSaved?.(saved);
        onClose();
        return;
      }

      const created = await clientRepository.create(values);
      toast.success('Candidato cadastrado.');
      onSaved?.(created.client);
      onClose();
      setAccess({ credential: created.access, message: created.accessMessage });
    } catch (error) {
      if (error instanceof NetworkError) {
        toast.error(error.message);
        return;
      }
      toast.error('Não foi possível salvar o candidato. Tente novamente.');
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        busy={isSubmitting}
        title={editing ? 'Editar candidato' : 'Novo candidato'}
        description={
          editing
            ? 'Atualize os dados de identificação do candidato.'
            : 'Cadastre o candidato para gerar o formulário e o link de convite.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button form="form-cliente" type="submit" loading={isSubmitting}>
              {editing ? 'Salvar alterações' : 'Cadastrar candidato'}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="cliente-nome" label="Nome" required error={errors.name?.message}>
              <Input
                id="cliente-nome"
                placeholder="Nome do candidato"
                autoComplete="off"
                invalid={Boolean(errors.name)}
                aria-describedby={describedBy('cliente-nome', undefined, errors.name?.message)}
                {...register('name')}
              />
            </Field>

            <Field id="cliente-email" label="E-mail" required error={errors.email?.message}>
              <Input
                id="cliente-email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                placeholder="contato@exemplo.com"
                invalid={Boolean(errors.email)}
                aria-describedby={describedBy('cliente-email', undefined, errors.email?.message)}
                {...register('email')}
              />
            </Field>
          </div>

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
        </form>
      </Modal>

      <CredentialsModal
        open={access !== null}
        credentials={access?.credential ? [access.credential] : []}
        message={access && !access.credential ? access.message : null}
        onClose={() => setAccess(null)}
      />
    </>
  );
}
