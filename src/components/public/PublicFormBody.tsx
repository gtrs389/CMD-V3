'use client';

import { useMemo, useState, type ReactNode, type RefObject } from 'react';
import type { ClientFormConfig, CustomField } from '@/lib/types';
import {
  CONSENT_KEY,
  isFilled,
  unlockedUpTo,
  type DynamicValue,
} from '@/lib/validation/dynamic-form';
import { DynamicFieldInput } from '@/components/form-renderer/DynamicFieldInput';
import { LocationProvider } from '@/components/form-renderer/location-context';
import type { DynamicFormState } from '@/components/form-renderer/use-dynamic-form';
import { FieldHint, type FieldHintKind } from './FieldHint';
import { InvitePrivacyNotice } from './InvitePrivacyNotice';
import { PublicFormSection } from './PublicFormShell';
import { isWideField } from './invite-sections';

/**
 * O corpo das telas de preenchimento: secoes, campos e regras.
 *
 * E UMA implementacao, usada pelo Formulario 1 (o link publico e o cadastro
 * manual do painel) e pelo Formulario 2. As tres telas pedem que a pessoa
 * preencha uma ficha, entao precisam do mesmo desenho e do mesmo
 * comportamento: cartoes numerados por secao, contagem do que ja foi
 * preenchido, aviso ao lado de cada campo, preenchimento na ordem — um campo
 * por vez — e o aviso de privacidade no fim. Corrigir qualquer uma dessas
 * coisas aqui corrige nas tres.
 *
 * O que e proprio de cada tela fica de fora e entra por propriedade: a
 * moldura (banner, coluna do convite, rodape fixo), o botao de envio e as
 * regras que so o link publico tem — a confirmacao de CPF e de titulo de
 * eleitor, que dependem do contexto do convite.
 */

export interface PublicFormBodySection {
  id: string;
  title: string;
  description: string;
  fields: CustomField[];
}

interface PublicFormBodyProps {
  config: ClientFormConfig;
  form: DynamicFormState;
  sections: readonly PublicFormBodySection[];
  /** `id` do `<form>`, para o botao de envio viver fora dele. */
  formId: string;
  /** Prefixo dos identificadores dos campos, unico por tela. */
  idPrefix: string;
  submitting: boolean;
  onSubmit: (event: React.FormEvent) => void;
  formRef?: RefObject<HTMLFormElement | null>;
  allowCamera?: boolean;
  /**
   * Preenchimento na ordem, um campo por vez.
   *
   * Ligado em todo CADASTRO NOVO, no link e no painel. Desligado na edicao:
   * quem corrige um campo de uma ficha ja existente nao pode ser obrigado a
   * percorrer a ficha inteira de novo.
   */
  sequential?: boolean;
  /** Campo fechado por uma regra de fora (ex.: a consulta eleitoral). */
  lockedField?: (field: CustomField) => boolean;
  /** Ajuda que substitui a escrita pelo ADMIN, em campos especificos. */
  fieldHelp?: (field: CustomField) => string | undefined;
  onFieldBlur?: (field: CustomField, value: DynamicValue) => void;
  onImageError?: (message: string) => void;
  /** Desenhado entre a frase de orientacao e a primeira secao. */
  children?: ReactNode;
}

export function PublicFormBody({
  config,
  form,
  sections,
  formId,
  idPrefix,
  submitting,
  onSubmit,
  formRef,
  allowCamera = false,
  sequential = true,
  lockedField,
  fieldHelp,
  onFieldBlur,
  onImageError,
  children,
}: PublicFormBodyProps) {
  /**
   * Campos em que a pessoa ja entrou.
   *
   * Existe por causa dos campos opcionais: eles nao se resolvem preenchendo
   * — podem ficar vazios de proposito —, entao o que libera o proximo e ter
   * passado por eles. Sem isso, um opcional vazio trancaria a ficha para
   * sempre.
   */
  const [visitados, setVisitados] = useState<ReadonlySet<string>>(() => new Set());

  const ordemDaTela = useMemo(
    () => sections.flatMap((section) => section.fields),
    [sections],
  );
  const posicao = useMemo(
    () => new Map(ordemDaTela.map((field, index) => [field.id, index])),
    [ordemDaTela],
  );

  const liberadoAte = sequential
    ? unlockedUpTo(
        ordemDaTela,
        (field) => isFilled(form.values[field.id]) || (!field.required && visitados.has(field.id)),
      )
    : ordemDaTela.length;

  function visitar(fieldId: string) {
    setVisitados((atual) => {
      if (atual.has(fieldId)) return atual;
      const proximo = new Set(atual);
      proximo.add(fieldId);
      return proximo;
    });
  }

  const fechado = (field: CustomField): boolean =>
    Boolean(lockedField?.(field)) || (posicao.get(field.id) ?? 0) > liberadoAte;

  /**
   * O que dizer ao lado do rotulo de cada campo.
   *
   * A ordem das perguntas importa: uma regra de fora manda sobre tudo,
   * depois o cadeado da vez, depois o que ja foi preenchido. Um campo, um
   * aviso — e so UM campo por vez carrega o pedido "preencha este campo".
   */
  const aviso = (field: CustomField): FieldHintKind => {
    if (lockedField?.(field)) return 'conferido';

    const indice = posicao.get(field.id) ?? 0;
    if (indice > liberadoAte) return 'aguarde';
    if (isFilled(form.values[field.id])) return 'pronto';
    if (indice === liberadoAte) return 'agora';

    // Aberto, vazio e ja ultrapassado: e um opcional que a pessoa dispensou.
    return 'opcional';
  };

  const tudoPreenchido = liberadoAte >= ordemDaTela.length;

  return (
    <>
      {sequential ? (
        <p className="mt-4 text-[0.8125rem] text-ink-500">
          Preencha na ordem. O campo marcado com{' '}
          <span className="font-semibold text-accent-700">Preencha este campo</span> é a sua vez;
          os seguintes abrem quando você terminar.
        </p>
      ) : null}

      {children}

      <LocationProvider fields={ordemDaTela} values={form.values} setValue={form.setValue}>
        <form id={formId} ref={formRef} onSubmit={onSubmit} noValidate>
          {/* Celular: cada secao e um cartao proprio, numerado. A rolagem
              ganha ritmo e a pessoa enxerga o tamanho do que falta em vez de
              encarar uma folha unica e interminavel.
              Desktop: os mesmos blocos, sem cartao. */}
          <div className="mt-4 animate-rise space-y-4 lg:mt-5 lg:space-y-7">
            {sections.map((section, index) => (
              <PublicFormSection
                key={section.id}
                id={section.id}
                index={index}
                title={section.title}
                description={section.description}
                fields={section.fields}
                values={form.values}
              >
                {section.fields.map((field) => (
                  <div
                    key={field.id}
                    // Captura no contorno do campo: vale para qualquer
                    // controle dentro dele — caixa de texto, lista, cartao de
                    // escolha ou envio de foto — sem cada um precisar avisar.
                    onFocusCapture={() => visitar(field.id)}
                    className={isWideField(field) ? 'sm:col-span-2' : undefined}
                  >
                    <DynamicFieldInput
                      field={
                        fieldHelp?.(field)
                          ? { ...field, helpText: fieldHelp(field) ?? '' }
                          : field
                      }
                      idPrefix={idPrefix}
                      variant="invite"
                      aside={<FieldHint kind={aviso(field)} />}
                      allowCamera={allowCamera}
                      disabled={submitting || fechado(field)}
                      value={form.values[field.id] ?? null}
                      error={form.errors[field.id]}
                      onChange={(value) => form.setValue(field.id, value)}
                      onBlur={onFieldBlur ? (value) => onFieldBlur(field, value) : undefined}
                      onImageError={onImageError}
                    />
                  </div>
                ))}
              </PublicFormSection>
            ))}

            {/* Aviso e aceite ficam onde a pessoa termina de preencher.
                Sem aviso configurado pelo ADMIN, o cartao nem existe. */}
            {config.privacy.enabled ? (
              <div className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
                <InvitePrivacyNotice
                  config={config}
                  accepted={form.values[CONSENT_KEY] === true}
                  // O aceite e o ultimo passo: so abre com tudo preenchido.
                  disabled={submitting || !tudoPreenchido}
                  error={form.errors[CONSENT_KEY]}
                  onChange={(accepted) => form.setValue(CONSENT_KEY, accepted)}
                />
              </div>
            ) : null}
          </div>
        </form>
      </LocationProvider>
    </>
  );
}
