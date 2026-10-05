'use client';

import { useState } from 'react';
import { ArrowRight, Vote, X } from 'lucide-react';
import { fotoDoCandidatoUrl, type CandidatoDaVotacao } from '@/lib/domain/votacao-tse';
import { FotoDoCandidato } from '@/components/apuracao/FotoDoCandidato';
import { CORES_DOS_CANDIDATOS, MAXIMO_DE_CANDIDATOS } from './cores';
import { cn } from '@/lib/utils/cn';
import { CentralDeCandidatos } from './CentralDeCandidatos';

/**
 * "Votacao 2026": escolher QUALQUER candidato e ver, no mapa, onde ele teve
 * voto — escola, zona e secao —, pelo resultado oficial do TSE.
 *
 * O botao abre a Central de candidatos (`CentralDeCandidatos`), onde a lista
 * inteira e filtrada no navegador e o ADMIN geral envia a planilha do TSE.
 */

export function BotaoDaVotacao({
  selecionados,
  onChange,
  onClear,
  podeEnviar,
  className,
}: {
  /** Ate quatro candidatos de uma vez (a dobradinha, por exemplo). */
  selecionados: CandidatoDaVotacao[];
  onChange: (candidatos: CandidatoDaVotacao[]) => void;
  onClear: () => void;
  podeEnviar: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      {selecionados.length === 0 ? (
        /*
         * Sem candidato: um BANNER-BOTAO, e nao uma pilula perdida entre os
         * filtros. A borda gira em azul e ouro, um brilho atravessa de tempos
         * em tempos e a urna pulsa: bate o olho e ve que e botao. O texto diz
         * para que serve antes de clicar.
         */
        <button
          type="button"
          onClick={() => setAberto(true)}
          className={cn('cmd-cta group @container relative block w-full overflow-hidden rounded-card p-[2.5px] text-left', className)}
        >
          <span aria-hidden="true" className="cmd-cta__borda" />
          <span className="relative flex items-center gap-3 overflow-hidden rounded-[calc(var(--radius-card)-2.5px)] bg-gradient-to-r from-navy-900 via-navy-800 to-[#1e3a8a] px-3.5 py-3 text-white sm:gap-4 sm:px-4 sm:py-3.5">
            <span aria-hidden="true" className="cmd-cta__brilho" />
            <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0 opacity-60" />

            {/* A urna: ouro, com a onda que sai dela. */}
            <span className="relative flex size-11 shrink-0 items-center justify-center sm:size-12">
              <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-2xl bg-gold-400/40 [animation-duration:2.2s]" />
              <span className="relative flex size-full items-center justify-center rounded-2xl bg-gradient-to-br from-gold-400 to-gold-500 text-navy-900 shadow-[0_8px_20px_-6px_rgba(242,193,78,0.7)] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                <Vote aria-hidden="true" className="size-6" />
              </span>
            </span>

            <span className="relative min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-[0.625rem] font-bold tracking-[0.16em] text-gold-400 uppercase">
                Votação 2026 · TSE
                <span className="inline-flex items-center gap-1 rounded-pill bg-success-400/15 px-1.5 py-0.5 tracking-wider text-success-400">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-success-400" />
                  </span>
                  ao vivo
                </span>
              </span>
              <span className="mt-0.5 block text-[0.9375rem] leading-snug font-bold sm:text-lg">
                Ver no mapa onde cada candidato teve voto
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-white/70">
                Escolha até {MAXIMO_DE_CANDIDATOS} candidatos e compare com a estimativa do time — escola, zona e seção.
              </span>
            </span>

            <span className="relative hidden shrink-0 items-center gap-1.5 rounded-pill bg-gold-400 px-4 py-2.5 text-sm font-bold text-navy-900 shadow-[0_10px_24px_-10px_rgba(242,193,78,0.9)] transition-all duration-300 group-hover:bg-gold-500 group-hover:shadow-[0_14px_28px_-10px_rgba(242,193,78,1)] @lg:inline-flex">
              Escolher candidatos
              <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </span>
            <ArrowRight
              aria-hidden="true"
              className="relative size-5 shrink-0 text-gold-400 transition-transform duration-300 group-hover:translate-x-1 @lg:hidden"
            />
          </span>
        </button>
      ) : (
        /* Com candidatos: a barra diz quem esta no mapa, cada um na sua cor. */
        <div
          className={cn(
            'cmd-chip-entra @container flex w-full flex-wrap items-center gap-3 rounded-card border-2 border-accent-500/60 bg-gradient-to-r from-accent-50 via-surface to-gold-50 p-2.5',
            className,
          )}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gold-400 to-gold-500 text-navy-900 shadow-card">
            <Vote aria-hidden="true" className="size-5" />
          </span>
          <ul className="flex -space-x-2" aria-label="Candidatos no mapa">
            {selecionados.map((c, i) => (
              <li
                key={c.id}
                title={c.nome}
                className="rounded-full ring-[2.5px] ring-offset-2 ring-offset-surface"
                style={{ '--tw-ring-color': selecionados.length > 1 ? CORES_DOS_CANDIDATOS[i] : '#e0a426' } as React.CSSProperties}
              >
                <FotoDoCandidato cargo={c.cargoCodigo} sqcand={c.sqcand ?? null} src={fotoDoCandidatoUrl(c)} nome={c.nome} tamanho="sm" />
              </li>
            ))}
          </ul>
          <div className="min-w-0 flex-1">
            <p className="text-[0.625rem] font-bold tracking-[0.14em] text-accent-700 uppercase">Votação 2026 no mapa</p>
            <p className="wrap-break-word text-sm font-semibold text-ink-900">
              {selecionados.length > 1 ? `${selecionados.length} candidatos: ${selecionados.map((c) => c.nome.split(' ')[0]).join(', ')}` : selecionados[0].nome}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAberto(true)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-pill bg-navy-900 px-3.5 text-xs font-bold text-gold-400 transition-colors hover:bg-navy-800"
            >
              <Vote aria-hidden="true" className="size-3.5" />
              Trocar candidatos
            </button>
            <button
              type="button"
              onClick={onClear}
              aria-label="Voltar ao mapa da campanha"
              title="Voltar ao mapa da campanha"
              className="inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface text-ink-500 transition-colors hover:border-danger-200 hover:bg-danger-50 hover:text-danger-600"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>
      )}

      {aberto ? (
        <CentralDeCandidatos
          podeEnviar={podeEnviar}
          selecionados={selecionados}
          onClose={() => setAberto(false)}
          onConfirm={(lista) => {
            onChange(lista);
            setAberto(false);
          }}
        />
      ) : null}
    </>
  );
}

/** "● Ao vivo · 1.234 de 7.000 seções com boletim (18%) · atualizado às 19:42". */
export function AndamentoAoVivo({
  texto,
  coletando,
  pausadoAte,
  erro,
  className,
}: {
  texto: string | null;
  coletando: boolean;
  pausadoAte: string | null;
  /** Por que a busca falhou. Nunca fica escondido atras de "buscando...". */
  erro?: string | null;
  className?: string;
}) {
  if (erro && !pausadoAte) {
    return (
      <p
        className={cn('mb-3 rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700', className)}
        role="alert"
      >
        <b>A busca ao vivo falhou.</b> {erro}
        {texto ? ` (${texto})` : ''}
      </p>
    );
  }
  return (
    <p className={cn('mb-3 flex items-center gap-2 text-xs text-ink-700', className)} role="status">
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-success-600" />
      </span>
      <span>
        <b>Ao vivo</b> ·{' '}
        {pausadoAte
          ? `o TSE pediu uma pausa; a coleta volta às ${new Date(pausadoAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
          : (texto ?? 'buscando os boletins de urna no TSE…')}
        {coletando && texto ? ' · buscando novos boletins…' : ''}
      </span>
    </p>
  );
}
