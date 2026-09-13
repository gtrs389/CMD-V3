'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Send } from 'lucide-react';
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

  const sections = useMemo(() => buildInviteSections(client.form), [client.form]);
  const percent = completionPercent(client.form, form.values);
  const faltam = missingRequired(client.form, form.values);

  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset(member ? valuesFromMember(client.form, member) : undefined);
  }, [open, member, client.form, reset]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void salvar();
  }

  async function salvar() {
    const values = form.validate();
    if (!values) {
      toast.error('Revise os campos destacados.');
      window.requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }

    const payload = toSubmission(client.form, values);

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
            {faltam === 0
              ? 'Tudo pronto para salvar.'
              : `Ainda ${faltam === 1 ? 'falta' : 'faltam'} ${faltam} ${
                  faltam === 1 ? 'campo obrigatório' : 'campos obrigatórios'
                }.`}
          </p>

          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="cadastro-painel" variant="accent">
            <Send aria-hidden="true" className="size-4" />
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
