'use client';

import { useMemo, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { inviteBannerSrc } from '@/lib/domain/invite-banner';
import type { Client, CustomField, PublicInviteOwner } from '@/lib/types';
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
  completionPercent,
  missingRequired,
  toSubmission,
  visibleFields,
} from '@/lib/validation/dynamic-form';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { ConfirmSubmissionModal } from './ConfirmSubmissionModal';
import { useDynamicForm } from '@/components/form-renderer/use-dynamic-form';
import { InviteConfirmValueModal } from './InviteConfirmValueModal';
import { InviteVerifyingModal } from './InviteVerifyingModal';
import { InviteExpired } from './PublicInviteView';
import { PublicFormBody } from './PublicFormBody';
import { PublicFormShell, PublicSuccessScreen, focusFirstInvalid } from './PublicFormShell';
import { buildInviteSections } from './invite-sections';
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
   * Campo fechado porque a consulta eleitoral ja respondeu por ele.
   *
   * Zona e secao sao o que a Justica Eleitoral devolveu para aquele titulo.
   * Deixar digitar por cima transformaria um dado conferido em um dado
   * digitado, e depois ninguem distinguiria os dois.
   */
  const daJusticaEleitoral = (field: CustomField): boolean =>
    (field.systemKey === 'zone' && daConsulta.zona) ||
    (field.systemKey === 'section' && daConsulta.secao);

  /**
   * Ajuda propria de zona e secao, conforme o que a consulta respondeu.
   *
   * Fora desses dois casos o campo mantem a ajuda que o ADMIN escreveu.
   */
  const ajuda = (field: CustomField): string | undefined => {
    if (daJusticaEleitoral(field)) return 'Preenchido pela consulta do seu título de eleitor.';

    const naoVeio =
      (field.systemKey === 'zone' && semResposta.zona) ||
      (field.systemKey === 'section' && semResposta.secao);

    return naoVeio ? 'Não localizamos no seu título. Digite o número, se souber.' : undefined;
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

      // A mensagem do servidor aparece como ela e. Ela ja e escrita para ser
      // lida por quem esta preenchendo — diz se algum dado nao foi aceito, se
      // e para tentar de novo, e traz o codigo da falha quando existe. Trocar
      // tudo por "não foi possível" apagava justamente a parte util: a pessoa
      // nao sabia o que corrigir, e quem fosse ajudar nao tinha o que
      // procurar no log.
      toast.error(
        error instanceof RepositoryError && error.message
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
      bannerSrc={inviteBannerSrc({ banner: client.banner, isDemo: client.isDemo })}
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
      <PublicFormBody
        config={client.form}
        form={form}
        sections={sections}
        formId="cadastro-publico"
        idPrefix="publico"
        submitting={submitting}
        onSubmit={handleSubmit}
        formRef={formRef}
        allowCamera
        lockedField={daJusticaEleitoral}
        fieldHelp={ajuda}
        onImageError={(message) => toast.error(message)}
        onFieldBlur={(field, value) => {
          // Confirmacao de CPF e de titulo: exclusiva do link publico, onde
          // existe o contexto do convite que autoriza a consulta.
          if (field.systemKey === 'cpf') {
            const digits = normalizeCpf(typeof value === 'string' ? value : '');
            if (isValidCpf(digits)) verification.requestCpfConfirmation(digits);
            return;
          }
          if (field.systemKey === 'voter_id') {
            const digits = normalizeVoterId(typeof value === 'string' ? value : '');
            if (isValidVoterId(digits)) verification.requestTituloConfirmation(digits);
          }
        }}
      />
    </PublicFormShell>
  );
}
