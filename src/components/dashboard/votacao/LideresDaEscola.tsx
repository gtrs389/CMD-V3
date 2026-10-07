'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { Crown, Search, Users, X } from 'lucide-react';
import type { EscolaNoComparativo, LiderNoRaioX } from '@/lib/domain/confronto';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils/cn';
import { formatNumber, initials } from '@/lib/utils/text';

/**
 * Todos os Lideres que cadastraram gente numa escola, no lugar do "+32":
 * do que mais cadastrou para o que menos (ou de A a Z), cada um com a barra
 * contra o primeiro, a parte dele na expectativa da escola e em quantas
 * secoes ele tem gente. A busca acha um Lider no meio de dezenas.
 */
export function LideresDaEscola({
  escola,
  lideres,
  liderEmFoco,
  onClose,
}: {
  escola: EscolaNoComparativo;
  lideres: LiderNoRaioX[];
  /** O Lider do filtro do mapa: aparece marcado. */
  liderEmFoco?: string | null;
  onClose: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<'cadastros' | 'nome'>('cadastros');

  const semAcento = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  // A posicao e sempre a do ranking (por cadastros), mesmo em ordem de nome.
  const ranking = useMemo(
    () => [...lideres].sort((a, b) => b.cadastrados - a.cadastrados || a.nome.localeCompare(b.nome, 'pt-BR')),
    [lideres],
  );
  const posicao = useMemo(() => new Map(ranking.map((l, i) => [l.id, i + 1])), [ranking]);
  const termo = semAcento(busca);
  const visiveis = (ordem === 'nome' ? [...ranking].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) : ranking).filter(
    (l) => !termo || semAcento(l.nome).includes(termo),
  );
  const maior = Math.max(1, ranking[0]?.cadastrados ?? 1);
  const somaDosLideres = ranking.reduce((t, l) => t + l.cadastrados, 0);
  const base = Math.max(1, escola.estimativa);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Líderes da escola ${escola.titulo}`}
      size="lg"
      header={
        <div className="min-w-0 pr-8">
          <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-[0.14em] text-gold-700 uppercase">
            <Users aria-hidden="true" className="size-3.5" />
            {ranking.length === 1 ? '1 líder' : `${formatNumber(ranking.length)} líderes`} nesta escola
          </p>
          <h2 className="mt-0.5 text-lg leading-snug font-bold wrap-break-word text-ink-900">{escola.titulo}</h2>
          <p className="text-xs text-ink-500">
            Expectativa de <b className="text-ink-900 tabular-nums">{formatNumber(escola.estimativa)}</b> pessoas
            {somaDosLideres < escola.estimativa
              ? ` · ${formatNumber(escola.estimativa - somaDosLideres)} cadastradas direto pela administração`
              : ''}
          </p>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex min-w-0 flex-1 basis-56 items-center">
            <span className="sr-only">Buscar líder</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-ink-400" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar líder"
              autoFocus
              className="min-h-10 w-full rounded-pill border border-line bg-surface pr-9 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:border-accent-600 focus:ring-4 focus:ring-accent-100 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {busca ? (
              <button
                type="button"
                onClick={() => setBusca('')}
                aria-label="Limpar busca"
                className="absolute right-1.5 flex size-7 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-900"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            ) : null}
          </label>
          <div role="group" aria-label="Ordem" className="flex rounded-pill border border-line bg-ink-50 p-0.5">
            {(
              [
                ['cadastros', 'Mais cadastros'],
                ['nome', 'A–Z'],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={ordem === valor}
                onClick={() => setOrdem(valor)}
                className={cn(
                  'min-h-9 rounded-pill px-3 text-xs font-semibold transition-colors',
                  ordem === valor ? 'bg-navy-900 text-white shadow-card' : 'text-ink-700 hover:text-ink-900',
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        {visiveis.length === 0 ? (
          <p className="rounded-card border-2 border-dashed border-line px-4 py-8 text-center text-sm text-ink-500">
            Nenhum líder com esse nome nesta escola.
          </p>
        ) : (
          <ol className="divide-y divide-line overflow-hidden rounded-card border border-line">
            {visiveis.map((l, i) => {
              const lugar = posicao.get(l.id) ?? i + 1;
              const secoes = Object.values(l.porSecao).filter((n) => n > 0).length;
              const emFoco = Boolean(liderEmFoco) && semAcento(l.nome) === semAcento(liderEmFoco ?? '');
              return (
                <li
                  key={l.id}
                  className={cn(
                    'cmd-cascata grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5',
                    emFoco ? 'bg-gold-50' : 'bg-surface',
                  )}
                  style={{ '--cmd-atraso': `${Math.min(i, 14) * 22}ms` } as CSSProperties}
                >
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full text-[0.6875rem] font-bold tabular-nums',
                      lugar === 1
                        ? 'bg-gold-400 text-navy-900'
                        : lugar === 2
                          ? 'bg-[#8e9aa7] text-white'
                          : lugar === 3
                            ? 'bg-[#b8743c] text-white'
                            : 'bg-ink-100 text-ink-700',
                    )}
                  >
                    {lugar === 1 ? <Crown aria-hidden="true" className="size-3.5" /> : lugar}
                  </span>

                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[0.625rem] font-bold text-gold-400">
                        {initials(l.nome)}
                      </span>
                      <span className="min-w-0 text-sm font-semibold wrap-break-word text-ink-900">{l.nome}</span>
                      {emFoco ? (
                        <span className="shrink-0 rounded-pill bg-gold-400 px-1.5 py-0.5 text-[0.625rem] font-bold text-navy-900">no filtro</span>
                      ) : null}
                    </span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-ink-100">
                        <span
                          className="cmd-barra-viva block h-full rounded-pill bg-gradient-to-r from-navy-800 to-accent-600"
                          style={{ width: `${Math.max(3, (l.cadastrados / maior) * 100)}%`, '--cmd-atraso': `${80 + Math.min(i, 14) * 22}ms` } as CSSProperties}
                        />
                      </span>
                      <span className="shrink-0 text-[0.6875rem] text-ink-500 tabular-nums">
                        {secoes} {secoes === 1 ? 'seção' : 'seções'}
                      </span>
                    </span>
                  </span>

                  <span className="text-right tabular-nums">
                    <span className="block text-base leading-tight font-bold text-ink-900">{formatNumber(l.cadastrados)}</span>
                    <span className="block text-[0.6875rem] text-ink-500">
                      {((l.cadastrados / base) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da escola
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Modal>
  );
}
