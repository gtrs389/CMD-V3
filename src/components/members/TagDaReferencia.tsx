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
  return <SeloDaReferencia referencia={member.reference ?? null} className={className} onClick={onClick} />;
}

/**
 * A tag da referencia de um Lider, de qualquer lugar que tenha a referencia
 * dele: o raio-x da escola, o mapa, a lista de Lideres. `undefined` (nao se
 * sabe, como no mapa geral) nao mostra nada; `null` mostra "Sem referência".
 * `compacto`: menor, para caber num chip ao lado do nome.
 */
export function SeloDaReferencia({
  referencia,
  compacto = false,
  tom = 'claro',
  className,
  onClick,
}: {
  referencia: string | null | undefined;
  compacto?: boolean;
  /** `escuro`: sobre o azul-marinho. */
  tom?: 'claro' | 'escuro';
  className?: string;
  onClick?: () => void;
}) {
  if (referencia === undefined) return null;
  const texto = referencia?.replace(/\s+/g, ' ').trim() || null;

  const classes = cn(
    'inline-flex max-w-full shrink-0 items-center gap-1 rounded-pill align-middle font-semibold tracking-wide',
    compacto ? 'px-1.5 py-px text-[0.625rem]' : 'px-2 py-0.5 text-[0.6875rem]',
    texto
      ? tom === 'escuro'
        ? 'bg-gold-400/15 text-gold-400 ring-1 ring-gold-400/40 ring-inset'
        : 'bg-gold-50 text-gold-700 ring-1 ring-gold-500/40 ring-inset'
      : tom === 'escuro'
        ? 'border border-dashed border-white/30 text-white/60'
        : 'border border-dashed border-ink-300 bg-surface text-ink-500',
    onClick && (texto ? 'transition-colors hover:bg-gold-100' : 'transition-colors hover:border-danger-200 hover:text-danger-700'),
    className,
  );
  const icone = compacto ? 'size-2.5 shrink-0' : 'size-3 shrink-0';
  const conteudo = texto ? (
    <>
      <BookmarkCheck aria-hidden="true" className={icone} />
      <span className="sr-only">Referência: </span>
      <span className="wrap-break-word">{texto}</span>
    </>
  ) : (
    <>
      <BookmarkX aria-hidden="true" className={icone} />
      <span>Sem referência</span>
    </>
  );
  const titulo = texto ? `Referência do Líder: ${texto}` : 'Este Líder não tem referência';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`${titulo}. Clique para ver todos ${texto ? 'com esta referência' : 'sem referência'}.`}
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
