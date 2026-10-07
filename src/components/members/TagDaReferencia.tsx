import { BookmarkCheck, BookmarkX } from 'lucide-react';
import type { Member } from '@/lib/types';
import { cn } from '@/lib/utils/cn';

/**
 * A referencia do Lider, sempre a vista ao lado do nome: quem indicou ou a
 * quem ele responde (a coluna "Referência" da planilha). Lider sem
 * referencia tambem ganha a sua tag — tracejada, "Sem referência" —, para a
 * falta saltar aos olhos em vez de passar por um espaco vazio.
 *
 * So Lideres: na Equipe a referencia continua na coluna dela.
 */
export function TagDaReferencia({
  member,
  className,
  onClick,
}: {
  member: Pick<Member, 'tier' | 'reference'>;
  className?: string;
  /** Com clique, a tag vira atalho: na lista do time, filtra pela referencia. */
  onClick?: () => void;
}) {
  if (member.tier !== 'LIDER') return null;
  const referencia = member.reference?.replace(/\s+/g, ' ').trim() || null;

  const classes = cn(
    'inline-flex max-w-full shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 align-middle text-[0.6875rem] font-semibold tracking-wide',
    referencia
      ? 'bg-gold-50 text-gold-700 ring-1 ring-gold-500/40 ring-inset'
      : 'border border-dashed border-ink-300 bg-surface text-ink-500',
    onClick && (referencia ? 'transition-colors hover:bg-gold-100' : 'transition-colors hover:border-danger-200 hover:text-danger-700'),
    className,
  );
  const conteudo = referencia ? (
    <>
      <BookmarkCheck aria-hidden="true" className="size-3 shrink-0" />
      <span className="sr-only">Referência: </span>
      <span className="wrap-break-word">{referencia}</span>
    </>
  ) : (
    <>
      <BookmarkX aria-hidden="true" className="size-3 shrink-0" />
      <span>Sem referência</span>
    </>
  );
  const titulo = referencia ? `Referência do Líder: ${referencia}` : 'Este Líder não tem referência';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`${titulo}. Clique para ver todos ${referencia ? 'com esta referência' : 'sem referência'}.`}
        className={classes}
      >
        {conteudo}
      </button>
    );
  }
  return (
    <span title={titulo} className={classes}>
      {conteudo}
    </span>
  );
}
