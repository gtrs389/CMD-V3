'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, UserPlus } from 'lucide-react';
import type { Client, Member } from '@/lib/types';
import { memberRepository } from '@/lib/repositories';
import { NetworkError } from '@/lib/repositories';
import {
  completionPercent,
  missingRequired,
  toSubmission,
  valuesFromMember,
} from '@/lib/validation/dynamic-form';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useDynamicForm } from '@/components/form-renderer/use-dynamic-form';
import { PublicFormBody } from '@/components/public/PublicFormBody';
import { focusFirstInvalid } from '@/components/public/PublicFormShell';
import { buildInviteSections } from '@/components/public/invite-sections';
import { ChatFillBox } from './ChatFillBox';

interface MemberFormModalProps {
  open: boolean;
  client: Client;
  member: Member | null;
  onClose: () => void;
}

/**
 * Cadastro manual e edicao de integrante, pelo painel.
 *
 * E a MESMA ficha do link publico, desenhada pelos mesmos componentes:
 * secoes em cartoes numerados, contagem do que ja foi preenchido, aviso em
 * cada campo, preenchimento na ordem, barra de avanco no topo e, no rodape,
 * quanto ainda falta. Quem cadastra a mao e quem se cadastra pelo link veem
 * a mesma coisa — antes esta tela era uma lista corrida de campos dentro de
 * um dialogo apertado, e nao se parecia em nada com o formulario de
 * verdade.
 *
 * O que nao vem junto e o que pertence ao link: banner do time, quem
 * convidou e a confirmacao de CPF e de titulo de eleitor, que dependem do
 * contexto do convite para autorizar a consulta.
 *
 * Na EDICAO o preenchimento na ordem fica desligado: quem corrige um campo
 * de uma ficha ja existente nao pode ser obrigado a percorrer tudo de novo.
 */
export function MemberFormModal({ open, client, member, onClose }: MemberFormModalProps) {
  const toast = useToast();
  const form = useDynamicForm(client.form);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [salvando, setSalvando] = useState(false);
  /**
   * Quantos ja foram cadastrados sem fechar esta tela.
   *
   * Cadastrar uma pessoa por vez — abrir, preencher, salvar, abrir de novo —
   * e o que torna cansativo registrar a lista inteira de um mutirao. Aqui a
   * ficha volta em branco e a contagem diz o que ja entrou, para quem esta
   * digitando nao perder a conta.
   */
  const [cadastrados, setCadastrados] = useState(0);

  const sections = useMemo(() => buildInviteSections(client.form), [client.form]);
  const percent = completionPercent(client.form, form.values);
  const faltam = missingRequired(client.form, form.values);

  const { reset } = form;

  /**
   * Qual ficha ja foi carregada nesta abertura.
   *
   * NAO E DETALHE: sem esta marca, o efeito abaixo dispara de novo toda vez
   * que `client.form` chega como um objeto NOVO — e ele chega assim a cada
   * releitura do time, que acontece sozinha quando a aba volta a ficar
   * visivel (`use-repository-query`) ou quando qualquer escrita avisa o
   * painel. O efeito entao chamava `reset`, e o que a pessoa estava
   * digitando SUMIA no meio do cadastro.
   *
   * Era exatamente o caminho de quem cadastra a mao: ler o dado no WhatsApp,
   * voltar para a aba do sistema, digitar, e encontrar o campo em branco.
   *
   * A ficha e carregada UMA vez por abertura, entao: ao abrir, e ao trocar
   * de pessoa. Depois disso o que manda e o que esta na tela — dado que
   * chega do servidor nunca sobrescreve o que esta sendo digitado.
   */
  const fichaCarregada = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      // Fechou: a proxima abertura carrega de novo.
      fichaCarregada.current = null;
      return;
    }

    const alvo = member?.id ?? 'nova';
    if (fichaCarregada.current === alvo) return;

    fichaCarregada.current = alvo;
    reset(member ? valuesFromMember(client.form, member) : undefined);
  }, [open, member, client.form, reset]);

  /**
   * Abriu a tela: a contagem recomeca.
   *
   * Durante a renderizacao, comparando com o ultimo valor visto — e nao em
   * um efeito: assim a primeira pintura ja sai com a contagem certa, sem um
   * quadro intermediario mostrando o total da vez anterior.
   */
  const [estavaAberto, setEstavaAberto] = useState(open);
  if (open !== estavaAberto) {
    setEstavaAberto(open);
    if (open) setCadastrados(0);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void salvar(false);
  }

  /**
   * `continuar` decide o que acontece DEPOIS de gravar: fechar a tela, ou
   * deixa-la aberta com a ficha em branco para a proxima pessoa. Gravar e
   * exatamente a mesma coisa nos dois casos.
   */
  async function salvar(continuar: boolean) {
    if (salvando) return;

    const values = form.validate();
    if (!values) {
      toast.error('Revise os campos destacados.');
      window.requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }

    const payload = toSubmission(client.form, values);
    setSalvando(true);

    try {
      if (member) {
        await memberRepository.update(member.id, {
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
          relationshipOptionId: payload.relationshipOptionId,
          relationshipLabel: payload.relationshipLabel,
          responses: payload.responses,
          consentAt: payload.consentAt ?? member.consentAt,
        });
        toast.success('Integrante atualizado.');
      } else {
        await memberRepository.create({
          clientId: client.id,
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
          relationshipOptionId: payload.relationshipOptionId,
          relationshipLabel: payload.relationshipLabel,
          responses: payload.responses,
          consentAt: payload.consentAt,
          source: 'admin',
        });

        if (continuar) {
          const total = cadastrados + 1;
          setCadastrados(total);
          // Ficha em branco para a proxima pessoa. Nada do cadastro anterior
          // fica para tras: repetir um telefone seria recusado no servidor,
          // e repetir um nome passaria despercebido.
          reset(undefined);
          toast.success(
            total === 1
              ? 'Integrante cadastrado. Pode preencher o próximo.'
              : `${total} integrantes cadastrados. Pode preencher o próximo.`,
          );
          // De volta ao topo: a proxima ficha comeca do primeiro campo.
          window.requestAnimationFrame(() =>
            formRef.current?.scrollIntoView({ block: 'start' }),
          );
          return;
        }

        toast.success('Integrante cadastrado.');
      }
      onClose();
    } catch (error) {
      if (error instanceof NetworkError) {
        toast.error(error.message);
        return;
      }
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível salvar o integrante.',
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={member ? 'Editar integrante' : 'Novo integrante'}
      description={
        member
          ? 'Atualize os dados cadastrados pela pessoa.'
          : 'A mesma ficha do link de cadastro, preenchida por você.'
      }
      footer={
        <>
          {/* O rodape do dialogo empilha invertido no celular. `order-last`
              coloca este aviso no TOPO da pilha, acima dos botoes — e no
              desktop ele volta para a esquerda, como no formulario publico. */}
          <p
            aria-live="polite"
            className={cn(
              'order-last flex-1 text-center text-xs font-medium sm:order-first sm:text-left',
              faltam === 0 ? 'text-success-600' : 'text-ink-500',
            )}
          >
            {/* Enquanto se cadastra um atras do outro, o que importa saber e
                quantos ja entraram: a contagem toma a frente do aviso de
                campos, que volta assim que a ficha nova comeca a ser
                preenchida. */}
            {cadastrados > 0 && faltam > 0 && percent === 0
              ? `${cadastrados} ${cadastrados === 1 ? 'cadastrado' : 'cadastrados'} nesta tela. Preencha o próximo.`
              : faltam === 0
                ? 'Tudo pronto para salvar.'
                : `Ainda ${faltam === 1 ? 'falta' : 'faltam'} ${faltam} ${
                    faltam === 1 ? 'campo obrigatório' : 'campos obrigatórios'
                  }.`}
          </p>

          <Button variant="secondary" onClick={onClose} disabled={salvando}>
            {cadastrados > 0 ? 'Concluir' : 'Cancelar'}
          </Button>

          {/* So no cadastro: editar uma ficha existente nao tem "proximo". */}
          {!member ? (
            <Button
              variant="secondary"
              onClick={() => void salvar(true)}
              loading={salvando}
              disabled={salvando}
            >
              {!salvando ? <UserPlus aria-hidden="true" className="size-4" /> : null}
              Cadastrar e adicionar outro
            </Button>
          ) : null}

          <Button
            type="submit"
            form="cadastro-painel"
            variant="accent"
            loading={salvando}
            disabled={salvando}
          >
            {!salvando ? <Send aria-hidden="true" className="size-4" /> : null}
            {member ? 'Salvar alterações' : 'Cadastrar'}
          </Button>
        </>
      }
    >
      {/* Mesma faixa de avanco do formulario publico: gruda no topo da area
          que rola e diz, o tempo todo, quanto ja foi preenchido. */}
      <div className="sticky -top-4 z-10 -mx-4 border-b border-line bg-surface/95 px-4 pt-1 pb-2.5 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.625rem] font-bold tracking-[0.12em] text-ink-500 uppercase">
            Preenchimento
          </p>
          <p className="shrink-0 text-xs font-bold text-success-600 tabular-nums">{percent}%</p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`Ficha ${percent}% preenchida`}
          className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-ink-100"
        >
          <span
            className="block h-full rounded-pill bg-success-600 transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* So no cadastro novo: corrigir uma ficha existente e mexer em um
          campo, nao reescrever a pessoa inteira. */}
      {!member ? (
        <div className="mt-3">
          <ChatFillBox
            config={client.form}
            setValue={(fieldId, valor) => form.setValue(fieldId, valor)}
          />
        </div>
      ) : null}

      <PublicFormBody
        config={client.form}
        form={form}
        sections={sections}
        formId="cadastro-painel"
        idPrefix="integrante"
        submitting={false}
        onSubmit={handleSubmit}
        formRef={formRef}
        allowCamera
        // Ficha nova segue a mesma ordem do link. Correcao de ficha existente
        // abre tudo: nao se percorre o cadastro inteiro para mudar um campo.
        sequential={!member}
        onImageError={(message) => toast.error(message)}
      />
    </Modal>
  );
}
