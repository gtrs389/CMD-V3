'use client';

import { useState } from 'react';
import { Tag } from 'lucide-react';
import type { Member } from '@/lib/types';
import { TAG_MAX, normalizarTag, tagDaPessoa } from '@/lib/domain/tag-do-lider';
import { api } from '@/lib/repositories/http/api';
import { notifyDataChanged } from '@/lib/repositories';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

/**
 * A tag do Lider ao lado do nome: no proprio Lider e em cada pessoa da
 * Equipe dele. Sem tag, nao ocupa espaco nenhum.
 *
 * Fica na linha do nome, e nao no meio das etiquetas de situacao: ela diz a
 * que grupo a pessoa pertence, e nao o estado do cadastro.
 */
export function TagDoLider({
  member,
  className,
  onClick,
}: {
  member: Pick<Member, 'tier' | 'tag' | 'recruitedBy'>;
  className?: string;
  /** Com clique, a tag vira atalho: na lista do time, filtra por ela. */
  onClick?: () => void;
}) {
  const tag = tagDaPessoa(member);
  if (!tag) return null;
  const origem =
    member.tier === 'LIDER' ? 'Tag do Líder' : `Tag do Líder ${member.recruitedBy?.name ?? ''}`.trim();
  const classes = cn(
    'inline-flex max-w-full shrink-0 items-center gap-1 rounded-pill bg-accent-50 px-2 py-0.5 align-middle text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap text-accent-700',
    onClick && 'transition-colors hover:bg-accent-100',
    className,
  );
  const conteudo = (
    <>
      <Tag aria-hidden="true" className="size-3 shrink-0" />
      <span className="sr-only">Tag: </span>
      <span className="truncate">{tag}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`${origem}. Clique para ver todos com esta tag.`}
        className={classes}
      >
        {conteudo}
      </button>
    );
  }
  return (
    <span title={origem} className={classes}>
      {conteudo}
    </span>
  );
}

/**
 * Nome com a tag ao lado, na mesma linha. O nome encolhe primeiro: a tag e
 * curta e fica sempre inteira.
 */
export function NomeComTag({
  member,
  className,
  nomeClassName,
}: {
  member: Pick<Member, 'name' | 'tier' | 'tag' | 'recruitedBy'>;
  className?: string;
  nomeClassName?: string;
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <span className={cn('min-w-0 truncate', nomeClassName)}>{member.name}</span>
      <TagDoLider member={member} />
    </span>
  );
}

/**
 * Coloca, troca ou tira a tag de um Lider.
 *
 * Exclusivo do ADMIN geral: a rota exige `member.update`. A tag vale na hora
 * para a Equipe inteira, porque a Equipe le a tag do Lider — nao guarda
 * copia.
 */
export function EditarTagModal({
  open,
  lider,
  tamanhoDaEquipe,
  onClose,
}: {
  open: boolean;
  lider: Member;
  /**
   * Quantas pessoas passam a mostrar a tag junto com o Lider. Ausente onde a
   * lista do time nao esta carregada (a ficha aberta pelo mapa).
   */
  tamanhoDaEquipe?: number;
  onClose: () => void;
}) {
  const toast = useToast();
  const [valor, setValor] = useState(lider.tag ?? '');
  const [saving, setSaving] = useState(false);

  // Cada abertura comeca da tag gravada, e nao do que ficou digitado antes.
  const [estavaAberto, setEstavaAberto] = useState(open);
  if (open !== estavaAberto) {
    setEstavaAberto(open);
    if (open) setValor(lider.tag ?? '');
  }

  const nova = normalizarTag(valor);
  const mudou = nova !== (lider.tag ?? null);

  async function salvar(tag: string | null) {
    if (saving) return;
    setSaving(true);
    try {
      await api<{ member: Member }>(`/api/members/${lider.id}/tag`, {
        method: 'PATCH',
        body: { tag },
      });
      // Lista, painel e fichas da Equipe mudam juntos: todos leem o Lider.
      notifyDataChanged();
      toast.success(tag ? 'Tag salva.' : 'Tag removida.');
      onClose();
    } catch (falha) {
      toast.error(
        falha instanceof Error && falha.message ? falha.message : 'Não foi possível salvar a tag.',
      );
    } finally {
      setSaving(false);
    }
  }

  const equipe =
    tamanhoDaEquipe === undefined
      ? 'A Equipe dele aparece com a mesma tag, ao lado do nome.'
      : tamanhoDaEquipe === 0
      ? 'Quem ele cadastrar vai aparecer com a mesma tag.'
      : tamanhoDaEquipe === 1
        ? 'A pessoa da Equipe dele aparece com a mesma tag, ao lado do nome.'
        : `As ${tamanhoDaEquipe} pessoas da Equipe dele aparecem com a mesma tag, ao lado do nome.`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      size="sm"
      title={lider.tag ? 'Trocar a tag do Líder' : 'Colocar tag no Líder'}
      description={`${lider.name}. ${equipe}`}
      footer={
        <>
          {lider.tag ? (
            <Button
              variant="ghost"
              className="mr-auto text-danger-600 hover:bg-danger-50"
              onClick={() => void salvar(null)}
              disabled={saving}
            >
              Tirar a tag
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar(nova)} loading={saving} disabled={!mudou || !nova}>
            <Tag aria-hidden="true" className="size-4" />
            Salvar tag
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (mudou && nova) void salvar(nova);
        }}
        className="space-y-3"
      >
        <Field id="tag-do-lider" label="Tag" help={`Até ${TAG_MAX} caracteres. Ex.: ZONA NORTE, IGREJA, CENTRO.`}>
          <Input
            id="tag-do-lider"
            value={valor}
            onChange={(event) => setValor(event.target.value)}
            maxLength={TAG_MAX + 8}
            autoComplete="off"
            autoFocus
            placeholder="ZONA NORTE"
          />
        </Field>
        {nova ? (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink-500">
            Vai aparecer assim:
            <span className="font-medium text-ink-900">{lider.name}</span>
            <TagDoLider member={{ tier: 'LIDER', tag: nova, recruitedBy: null }} />
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
