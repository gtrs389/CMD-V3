import type { CSSProperties } from 'react';
import { Crown, Users } from 'lucide-react';
import { FotoDoCandidato } from '@/components/apuracao/FotoDoCandidato';
import { cn } from '@/lib/utils/cn';

/**
 * O rosto de cada barra: a foto oficial do candidato, com o anel na cor
 * dele, no comeco da barra dos votos dele — e o icone do time na barra da
 * estimativa. Bate o olho e sabe de quem e cada barra, sem ler a legenda.
 */
export function MarcaDaBarra({
  candidato,
  className,
}: {
  /** Ausente: a barra da estimativa (o time). */
  candidato?: { nome: string; cor: string; cargo?: number; foto?: string };
  className?: string;
}) {
  if (!candidato) {
    return (
      <span
        title="Estimativa do time"
        className={cn('flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-900 text-gold-400 ring-2 ring-navy-900/15', className)}
      >
        <Users aria-hidden="true" className="size-3.5" />
      </span>
    );
  }
  return (
    <span
      title={candidato.nome}
      className={cn('shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-surface', className)}
      style={{ '--tw-ring-color': candidato.cor } as CSSProperties}
    >
      <FotoDoCandidato cargo={candidato.cargo ?? 0} sqcand={null} src={candidato.foto} nome={candidato.nome} tamanho="xs" className="ring-0" />
    </span>
  );
}

/** "NIVALDO (15123) · Deputado Estadual · 1º turno" -> numero e cargo. */
function partesDoRotulo(rotulo: string): { numero: string | null; cargo: string | null } {
  const [quem, cargo] = rotulo.split(' · ');
  return { numero: quem?.match(/\((\d+)\)/)?.[1] ?? null, cargo: cargo ?? null };
}

/**
 * O nome em cima da barra: quem e (nome e numero), o cargo numa etiqueta
 * com a bolinha da cor dele e, na ponta, a parte dele nos votos da secao.
 * O mais votado da secao leva a coroa. Alinha com a barra (depois da foto)
 * e termina antes da coluna do numero.
 */
export function RotuloDaBarra({
  candidato,
  votos,
  totalDaSecao,
  campeao = false,
  className,
}: {
  candidato: { nome: string; rotulo: string; cor: string };
  votos: number;
  /** Todos os votos da secao (de todos os candidatos na tela): a parte dele. */
  totalDaSecao: number;
  /** O mais votado da secao: a coroa. */
  campeao?: boolean;
  /** O recuo da direita, do tamanho da coluna do numero. */
  className?: string;
}) {
  const { numero, cargo } = partesDoRotulo(candidato.rotulo);
  const parte = totalDaSecao > 0 ? Math.round((votos / totalDaSecao) * 100) : 0;
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-9 text-[0.6875rem] leading-tight', className ?? 'sm:pr-16')}>
      {campeao ? (
        <span title="Mais votado nesta seção" className="flex size-4 shrink-0 items-center justify-center rounded-full bg-gold-400 text-navy-900">
          <Crown aria-hidden="true" className="size-2.5" strokeWidth={2.75} />
        </span>
      ) : null}
      <span className="min-w-0 font-bold wrap-break-word text-ink-900">{candidato.nome}</span>
      {numero ? <span className="shrink-0 font-semibold text-ink-400 tabular-nums">{numero}</span> : null}
      {cargo ? (
        <span
          className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-pill border px-1.5 py-px text-[0.625rem] font-semibold text-ink-700"
          style={{ borderColor: `${candidato.cor}66`, background: `${candidato.cor}14` }}
        >
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ background: candidato.cor }} />
          <span className="truncate">{cargo}</span>
        </span>
      ) : null}
      {totalDaSecao > 0 ? (
        <span className="ml-auto shrink-0 pl-2 text-[0.625rem] font-semibold text-ink-500 tabular-nums" title="Parte dele nos votos desta seção">
          {parte}% da seção
        </span>
      ) : null}
    </div>
  );
}

/** O rotulo da barra do time: "Gente do time" (e, com Lideres marcados, a parte deles). */
export function RotuloDaEstimativa({ dosLideres = 0, className }: { dosLideres?: number; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-9 text-[0.6875rem] leading-tight font-bold text-navy-900', className ?? 'sm:pr-16')}>
      Gente do time
      <span className="hidden font-normal text-ink-500 sm:inline">· cadastrados que votam aqui</span>
      {dosLideres > 0 ? (
        <span className="ml-auto shrink-0 rounded-pill bg-gold-400 px-1.5 text-[0.625rem] font-bold text-navy-900 tabular-nums">
          ★ {dosLideres} dos líderes marcados
        </span>
      ) : null}
    </div>
  );
}
