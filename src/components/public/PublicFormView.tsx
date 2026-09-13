'use client';

import { useMemo, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import type { Client, PublicInviteOwner } from '@/lib/types';
import { PHONE_IN_USE } from '@/lib/types';
import { submitInvite } from '@/lib/repositories';
import { GoneError, NetworkError } from '@/lib/repositories/http/api';
import { RepositoryError } from '@/lib/repositories/types';
import {
  formatCpf,
  formatVoterId,
  isValidCpf,
  isValidVoterId,
  normalizeCpf,
  normalizeVoterId,
} from '@/lib/utils/documents';
import { linkCode } from '@/lib/domain/link-code';
import {
  CONSENT_KEY,
  completionPercent,
  isFilled,
  missingRequired,
  toSubmission,
  unlockedUpTo,
  visibleFields,
} from '@/lib/validation/dynamic-form';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { ConfirmSubmissionModal } from './ConfirmSubmissionModal';
import { DynamicFieldInput } from '@/components/form-renderer/DynamicFieldInput';
import { LocationProvider } from '@/components/form-renderer/location-context';
import { useDynamicForm } from '@/components/form-renderer/use-dynamic-form';
import { FieldHint, type FieldHintKind } from './FieldHint';
import { InviteConfirmValueModal } from './InviteConfirmValueModal';
import { InvitePrivacyNotice } from './InvitePrivacyNotice';
import { InviteVerifyingModal } from './InviteVerifyingModal';
import { InviteExpired } from './PublicInviteView';
import {
  PublicFormSection,
  PublicFormShell,
  PublicSuccessScreen,
  focusFirstInvalid,
} from './PublicFormShell';
import { buildInviteSections, isWideField } from './invite-sections';
import { useInviteDeviceReport } from './use-invite-device-report';
import { useInviteVerification } from './use-invite-verification';

interface PublicFormViewProps {
  client: Client;
  /** Quem enviou o convite: apenas nome, foto e perfil. */
  owner: PublicInviteOwner | null;
}

/**
 * Pagina publica de cadastro, em UMA pagina so.
 *
 * Nao ha etapas: todos os campos ficam visiveis de uma vez, agrupados por
 * secao, e a pessoa rola a tela ate o fim. Ninguem se perde entre telas nem
 * descobre tarde que faltava preencher algo la atras.
 *
 * Os campos, a obrigatoriedade e as opcoes vem da configuracao real feita
 * pelo ADMIN: campo desativado nao aparece e nao e enviado. Nada do que e
 * digitado sai da memoria da aba — nem `localStorage`, nem `sessionStorage`,
 * nem cookie, nem URL — e o envio acontece so depois da confirmacao final,
 * no resumo do modal.
 */
export function PublicFormView({ client, owner }: PublicFormViewProps) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  /** Link encerrado durante o preenchimento: o envio nao acontece. */
  const [expired, setExpired] = useState<'taken' | 'expired' | null>(null);
  /**
   * Zona e secao vieram da consulta eleitoral e nao se editam mais.
   *
   * Elas sao o que a Justica Eleitoral respondeu para aquele titulo: deixar
   * a pessoa digitar por cima transformaria um dado conferido em um dado
   * digitado, sem ninguem perceber a diferenca depois.
   */
  const [daConsulta, setDaConsulta] = useState({ zona: false, secao: false });
  /**
   * A consulta do titulo aconteceu e NAO trouxe aquele dado.
   *
   * E diferente de "ainda nao consultou": aqui a Justica Eleitoral ja
   * respondeu e nao informou o numero, entao ele nunca vai chegar sozinho —
   * quem preenche precisa saber disso e digitar.
   */
  const [semResposta, setSemResposta] = useState({ zona: false, secao: false });
  /**
   * Campos em que a pessoa ja entrou.
   *
   * Existe por causa dos campos opcionais: eles nao se resolvem preenchendo
   * — podem ficar vazios de proposito —, entao o que libera o proximo e ter
   * passado por eles. Sem isso, um opcional vazio trancaria o formulario
   * para sempre.
   */
  const [visitados, setVisitados] = useState<ReadonlySet<string>>(() => new Set());
  const submittedRef = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Complementacao UNICA dos dados do aparelho daquele clique. O clique ja
  // foi registrado no servidor, com o horario do banco; aqui vai apenas o que
  // so o navegador conhece, e nada disso bloqueia o formulario.
  useInviteDeviceReport();

  const form = useDynamicForm(client.form);
  const sections = useMemo(() => buildInviteSections(client.form), [client.form]);
  const allFields = useMemo(() => visibleFields(client.form), [client.form]);
  const percent = completionPercent(client.form, form.values);
  // Quanto falta para poder enviar. Numero de leitura: quem aceita o envio
  // continua sendo a validacao.
  const faltam = missingRequired(client.form, form.values);

  /**
   * Preenchimento na ordem, um campo por vez.
   *
   * A lista segue exatamente a ordem em que a tela desenha — as secoes, uma
   * apos a outra. Um campo obrigatorio se resolve quando e preenchido; um
   * opcional, quando e preenchido OU quando a pessoa passa por ele e segue
   * em frente. So entao o proximo abre.
   */
  const ordemDaTela = useMemo(() => sections.flatMap((section) => section.fields), [sections]);
  const posicao = useMemo(
    () => new Map(ordemDaTela.map((field, index) => [field.id, index])),
    [ordemDaTela],
  );
  const liberadoAte = unlockedUpTo(
    ordemDaTela,
    (field) => isFilled(form.values[field.id]) || (!field.required && visitados.has(field.id)),
  );

  /** Marca que a pessoa entrou no campo. Repetir nao recria o conjunto. */
  function visitar(fieldId: string) {
    setVisitados((atual) => {
      if (atual.has(fieldId)) return atual;
      const proximo = new Set(atual);
      proximo.add(fieldId);
      return proximo;
    });
  }

  /**
   * Campo fechado porque a consulta eleitoral ja respondeu por ele.
   *
   * Zona e secao sao o que a Justica Eleitoral devolveu para aquele titulo.
   * Deixar digitar por cima transformaria um dado conferido em um dado
   * digitado, e depois ninguem distinguiria os dois.
   */
  const daJusticaEleitoral = (field: (typeof ordemDaTela)[number]): boolean =>
    (field.systemKey === 'zone' && daConsulta.zona) ||
    (field.systemKey === 'section' && daConsulta.secao);

  /**
   * Ajuda propria de zona e secao, conforme o que a consulta respondeu.
   *
   * Fora desses dois casos o campo mantem a ajuda que o ADMIN escreveu.
   */
  const comAjuda = (field: (typeof ordemDaTela)[number]) => {
    if (daJusticaEleitoral(field)) {
      return { ...field, helpText: 'Preenchido pela consulta do seu título de eleitor.' };
    }

    const naoVeio =
      (field.systemKey === 'zone' && semResposta.zona) ||
      (field.systemKey === 'section' && semResposta.secao);

    if (naoVeio) {
      return {
        ...field,
        helpText: 'Não localizamos no seu título. Digite o número, se souber.',
      };
    }

    return field;
  };

  /** Campo ainda trancado pela ordem, ou fechado pela consulta eleitoral. */
  const bloqueado = (field: (typeof ordemDaTela)[number]): boolean =>
    daJusticaEleitoral(field) || (posicao.get(field.id) ?? 0) > liberadoAte;

  /**
   * O que dizer ao lado do rotulo de cada campo.
   *
   * A ordem das perguntas importa: a consulta eleitoral manda sobre tudo,
   * depois o cadeado da vez, depois o que ja foi preenchido. Um campo, um
   * aviso — e so UM campo por vez carrega o pedido "preencha este campo".
   */
  const aviso = (field: (typeof ordemDaTela)[number]): FieldHintKind => {
    if (daJusticaEleitoral(field)) return 'conferido';

    const indice = posicao.get(field.id) ?? 0;
    if (indice > liberadoAte) return 'aguarde';
    if (isFilled(form.values[field.id])) return 'pronto';
    if (indice === liberadoAte) return 'agora';

    // Aberto, vazio e ja ultrapassado: e um opcional que a pessoa dispensou.
    return 'opcional';
  };

  const nameFieldId = allFields.find((field) => field.systemKey === 'name')?.id;
  const phoneFieldId = allFields.find((field) => field.systemKey === 'phone')?.id;
  const zoneFieldId = allFields.find((field) => field.systemKey === 'zone')?.id;
  const sectionFieldId = allFields.find((field) => field.systemKey === 'section')?.id;

  const { setValue } = form;
  const verification = useInviteVerification({
    onNameCorrection: (nome) => {
      if (nameFieldId) setValue(nameFieldId, nome);
    },
    onZonaSecaoFilled: (zona, secao, origem) => {
      if (zoneFieldId) setValue(zoneFieldId, zona ?? '');
      if (sectionFieldId) setValue(sectionFieldId, secao ?? '');

      // Cada um tranca por si: a consulta pode devolver a zona e nao a
      // secao, e trancar a secao vazia deixaria a pessoa sem saida.
      setDaConsulta({ zona: Boolean(zona), secao: Boolean(secao) });

      // O que a consulta nao trouxe volta a ser da pessoa, e o campo passa a
      // dizer isso. Em um 'reset' — a troca de CPF invalidando o titulo — nao
      // ha nada a anunciar: os campos so voltam a ficar abertos.
      setSemResposta({
        zona: origem === 'consulta' && !zona,
        secao: origem === 'consulta' && !secao,
      });
    },
  });

  /**
   * Envio: o formulario inteiro e conferido de uma vez.
   *
   * Com erro, a pessoa fica onde esta, ve as mensagens em todos os campos
   * destacados e o foco vai para o primeiro deles — que pode estar em
   * qualquer ponto da pagina, porque tudo e uma tela so.
   */
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submittedRef.current || submitting) return;

    if (!form.validate()) {
      toast.error('Revise os campos destacados antes de enviar.');
      window.requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }

    setConfirming(true);
  }

  /** Envio, apos a confirmacao explicita. */
  async function handleConfirm() {
    // Barra duplo clique e reenvio antes mesmo do estado do React atualizar.
    if (submittedRef.current || submitting) return;

    const values = form.validate();
    if (!values) {
      setConfirming(false);
      toast.error('Revise os campos destacados antes de enviar.');
      return;
    }

    submittedRef.current = true;
    setSubmitting(true);

    try {
      const payload = toSubmission(client.form, values);
      const { cpfToken, tseToken } = verification.getTokens();
      // O cliente de destino vem do contexto do link, guardado em cookie e
      // resolvido no servidor: o payload nao carrega token nenhum.
      await submitInvite({
        name: payload.name,
        phone: payload.phone,
        photo: payload.photo,
        gender: payload.gender,
        cpf: payload.cpf,
        voterId: payload.voterId,
        zone: payload.zone,
        section: payload.section,
        state: payload.state,
        city: payload.city,
        district: payload.district,
        street: payload.street,
        relationshipOptionId: payload.relationshipOptionId,
        relationshipLabel: payload.relationshipLabel,
        responses: payload.responses,
        consentAt: payload.consentAt,
        cpfToken,
        tseToken,
      });

      setConfirming(false);
      setDone(true);
    } catch (error) {
      // Prazo vencido no meio do caminho, link ja usado ou reservado por
      // outra pessoa: o servidor recusou e nada foi gravado.
      if (error instanceof GoneError) {
        setConfirming(false);
        setExpired(error.reason);
        return;
      }

      submittedRef.current = false;

      // Telefone ja cadastrado naquele time: o cadastro nao foi concluido e a
      // recusa aparece no proprio campo, que a pagina rola ate mostrar. So o
      // servidor sabe disso — a tela publica nunca consulta quem ja existe
      // no time.
      const duplicado =
        error instanceof RepositoryError &&
        !(error instanceof NetworkError) &&
        error.message === PHONE_IN_USE;

      if (duplicado && phoneFieldId) {
        setConfirming(false);
        form.setFieldError(phoneFieldId, PHONE_IN_USE);
        window.requestAnimationFrame(() => focusFirstInvalid(formRef.current));
        toast.error(PHONE_IN_USE);
        return;
      }

      toast.error(
        error instanceof NetworkError
          ? error.message
          : 'Não foi possível enviar o cadastro. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  // O servidor encerrou o link: nenhum campo do formulario continua na tela.
  if (expired) return <InviteExpired reason={expired} />;

  if (done) return <PublicSuccessScreen title="Obrigado por se cadastrar!" />;

  /** O mesmo botao nas duas larguras: muda so o tamanho e a largura total. */
  const submitButton = (fullWidth: boolean) => (
    <Button
      type="submit"
      form="cadastro-publico"
      variant="accent"
      size={fullWidth ? 'lg' : undefined}
      loading={submitting}
      fullWidth={fullWidth}
    >
      {!submitting ? <Send aria-hidden="true" className="size-4" /> : null}
      Enviar cadastro
    </Button>
  );

  return (
    <PublicFormShell
      owner={owner}
      teamName={client.name}
      bannerTag={client.bannerTag}
      linkCode={linkCode(client.invite.token)}
      title="Ficha de cadastro"
      subtitle="Leva menos de 2 minutos."
      introText={client.form.introText}
      percent={percent}
      missing={faltam}
      desktopAction={submitButton(false)}
      mobileAction={submitButton(true)}
      overlays={
        <>
          <ConfirmSubmissionModal
            open={confirming}
            config={client.form}
            values={form.values}
            submitting={submitting}
            onCancel={() => setConfirming(false)}
            onConfirm={handleConfirm}
          />

          <InviteConfirmValueModal
            open={verification.pending?.kind === 'cpf'}
            label="CPF"
            value={verification.pending ? formatCpf(verification.pending.value) : ''}
            onCancel={verification.cancel}
            onConfirm={verification.confirm}
          />

          <InviteConfirmValueModal
            open={verification.pending?.kind === 'titulo'}
            label="título de eleitor"
            value={verification.pending ? formatVoterId(verification.pending.value) : ''}
            onCancel={verification.cancel}
            onConfirm={verification.confirm}
          />

          <InviteVerifyingModal open={verification.loading} />
        </>
      }
    >
      <LocationProvider fields={allFields} values={form.values} setValue={form.setValue}>
        <form id="cadastro-publico" ref={formRef} onSubmit={handleSubmit} noValidate>
          {/* Celular: cada secao e um cartao proprio, numerado. A rolagem
              ganha ritmo e a pessoa enxerga o tamanho do que falta em vez de
              encarar uma folha unica e interminavel.
              Desktop: os mesmos blocos, sem cartao, como sempre foram. */}
          <p className="mt-4 text-[0.8125rem] text-ink-500">
            Preencha na ordem. O campo marcado com{' '}
            <span className="font-semibold text-accent-700">Preencha este campo</span> é a sua vez;
            os seguintes abrem quando você terminar.
          </p>

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
                      field={comAjuda(field)}
                      idPrefix="publico"
                      variant="invite"
                      aside={<FieldHint kind={aviso(field)} />}
                      allowCamera
                      disabled={submitting || bloqueado(field)}
                      value={form.values[field.id] ?? null}
                      error={form.errors[field.id]}
                      onChange={(value) => form.setValue(field.id, value)}
                      onBlur={
                        field.systemKey === 'cpf'
                          ? (value) => {
                              const digits = normalizeCpf(typeof value === 'string' ? value : '');
                              if (isValidCpf(digits)) {
                                verification.requestCpfConfirmation(digits);
                              }
                            }
                          : field.systemKey === 'voter_id'
                            ? (value) => {
                                const digits = normalizeVoterId(
                                  typeof value === 'string' ? value : '',
                                );
                                if (isValidVoterId(digits)) {
                                  verification.requestTituloConfirmation(digits);
                                }
                              }
                            : undefined
                      }
                      onImageError={(message) => toast.error(message)}
                    />
                  </div>
                ))}
              </PublicFormSection>
            ))}

            {/* Aviso e aceite ficam onde a pessoa termina de preencher.
                Sem aviso configurado pelo ADMIN, o cartao nem existe. */}
            {client.form.privacy.enabled ? (
              <div className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
                <InvitePrivacyNotice
                  config={client.form}
                  accepted={form.values[CONSENT_KEY] === true}
                  // O aceite e o ultimo passo: so abre com o formulario
                  // inteiro preenchido.
                  disabled={submitting || liberadoAte < ordemDaTela.length}
                  error={form.errors[CONSENT_KEY]}
                  onChange={(accepted) => form.setValue(CONSENT_KEY, accepted)}
                />
              </div>
            ) : null}
          </div>
        </form>
      </LocationProvider>
    </PublicFormShell>
  );
}
