'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * A noite da apuracao: a porcentagem dos validos de cada lider (eixo Y)
 * conforme as secoes sao totalizadas (eixo X).
 *
 * Um eixo so. Linhas de 2 px, ponto final de 8 px com anel da superficie,
 * rotulo direto na ponta de cada linha (nome e porcentagem) e legenda acima;
 * passar o mouse mostra a mira com os valores daquele momento. A cor segue o
 * candidato (paleta categorica validada), nunca a posicao.
 */

/** Paleta categorica (slots 1-4), validada contra a superficie branca. */
export const CORES_DA_NOITE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'] as const;

export interface SerieDaNoite {
  numero: string;
  nome: string;
  pontos: { x: number; y: number; hora: string | null }[];
}

const ALTURA = 280;
const MARGEM_LARGA = { topo: 16, direita: 168, baixo: 40, esquerda: 40 };
/** No celular, os rotulos ocupam menos: o grafico precisa do espaco. */
const MARGEM_ESTREITA = { topo: 16, direita: 60, baixo: 40, esquerda: 32 };

const pct = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const curto = (nome: string) => {
  const partes = nome.split(/\s+/);
  return partes.length > 2 ? `${partes[0]} ${partes[partes.length - 1]}` : nome;
};

export function GraficoDaNoite({ series, className }: { series: SerieDaNoite[]; className?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(640);
  const [mira, setMira] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const observador = new ResizeObserver(([entrada]) => setLargura(Math.max(240, entrada.contentRect.width)));
    observador.observe(el);
    return () => observador.disconnect();
    // Volta a medir quando o grafico reaparece (saindo do modo tabela).
  }, [tabela]);

  const MARGEM = largura < 560 ? MARGEM_ESTREITA : MARGEM_LARGA;
  // No celular a ponta da linha mostra so a porcentagem: o nome esta na
  // legenda, logo acima, com a mesma cor.
  const estreito = largura < 560;
  const pontosTodos = series.flatMap((s) => s.pontos);
  const temLinha = series.some((s) => s.pontos.length >= 2);
  const maxY = Math.max(10, Math.ceil((Math.max(0, ...pontosTodos.map((p) => p.y)) * 1.12) / 10) * 10);
  const areaX = largura - MARGEM.esquerda - MARGEM.direita;
  const areaY = ALTURA - MARGEM.topo - MARGEM.baixo;
  const px = (x: number) => MARGEM.esquerda + (x / 100) * areaX;
  const py = (y: number) => MARGEM.topo + areaY - (y / maxY) * areaY;

  // Rotulos na ponta das linhas, afastados para nao se sobreporem.
  const rotulos = useMemo(() => {
    const finais = series
      .map((s, i) => {
        const ultimo = s.pontos[s.pontos.length - 1];
        return ultimo ? { i, nome: curto(s.nome), y: ultimo.y, alvo: py(ultimo.y), x: ultimo.x } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.alvo - b.alvo);
    for (let k = 1; k < finais.length; k += 1) {
      if (finais[k].alvo - finais[k - 1].alvo < 18) finais[k].alvo = finais[k - 1].alvo + 18;
    }
    return finais;
    // py depende de largura, margem e maxY, que ja entram por `series`/estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, largura, maxY]);

  // Os momentos (x) onde houve leitura, para a mira encaixar.
  const momentos = useMemo(() => [...new Set(pontosTodos.map((p) => p.x))].sort((a, b) => a - b), [pontosTodos]);
  const naMira = (x: number) =>
    series.map((s) => {
      const antes = s.pontos.filter((p) => p.x <= x);
      return antes[antes.length - 1] ?? null;
    });

  function mover(evento: React.PointerEvent<SVGSVGElement>) {
    const caixaSvg = evento.currentTarget.getBoundingClientRect();
    const x = ((evento.clientX - caixaSvg.left - MARGEM.esquerda) / areaX) * 100;
    if (momentos.length === 0) return;
    const maisPerto = momentos.reduce((m, v) => (Math.abs(v - x) < Math.abs(m - x) ? v : m), momentos[0]);
    setMira(maisPerto);
  }

  // Marcas redondas: de 5 em 5, 10 em 10 ou 20 em 20, conforme o teto.
  const passo = maxY <= 20 ? 5 : maxY <= 60 ? 10 : 20;
  const ticksY = Array.from({ length: Math.floor(maxY / passo) + 1 }, (_, i) => i * passo);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Legenda: sempre presente com duas series ou mais. */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700">
          {series.map((s, i) => (
            <li key={s.numero} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-[3px] w-4 rounded-full" style={{ background: CORES_DA_NOITE[i] }} />
              {curto(s.nome)}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setTabela((t) => !t)}
          className="rounded-pill border border-line px-2.5 py-1 text-[0.6875rem] font-medium text-ink-700 hover:bg-ink-50"
        >
          {tabela ? 'Ver gráfico' : 'Ver em tabela'}
        </button>
      </div>

      {tabela ? (
        <div className="max-h-64 overflow-auto rounded-control border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-ink-50 text-ink-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">Hora (TSE)</th>
                <th className="px-2 py-1.5 font-medium">Seções</th>
                {series.map((s) => (
                  <th key={s.numero} className="px-2 py-1.5 font-medium">
                    {curto(s.nome)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-ink-900 tabular-nums">
              {momentos.map((x) => (
                <tr key={x}>
                  <td className="px-2 py-1">{series.flatMap((s) => s.pontos).find((p) => p.x === x)?.hora ?? '—'}</td>
                  <td className="px-2 py-1">{pct(x)}</td>
                  {naMira(x).map((p, i) => (
                    <td key={series[i].numero} className="px-2 py-1">
                      {p ? pct(p.y) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={caixa} className="relative w-full">
          {!temLinha ? (
            <p className="flex h-40 items-center justify-center rounded-control border border-dashed border-line px-4 text-center text-xs text-ink-500">
              A linha da noite aparece a partir da segunda atualização do TSE.
            </p>
          ) : (
            <svg
              width={largura}
              height={ALTURA}
              role="img"
              aria-label="Porcentagem dos votos válidos de cada líder conforme as seções são totalizadas"
              onPointerMove={mover}
              onPointerLeave={() => setMira(null)}
              className="block touch-none select-none"
            >
              {/* Grade recessiva e eixo Y unico. */}
              {ticksY.map((t) => (
                <g key={t}>
                  <line x1={MARGEM.esquerda} x2={MARGEM.esquerda + areaX} y1={py(t)} y2={py(t)} stroke="#e7ecf1" strokeWidth={1} />
                  <text x={MARGEM.esquerda - 6} y={py(t) + 3} textAnchor="end" className="fill-ink-500 text-[10px]">
                    {Math.round(t)}%
                  </text>
                </g>
              ))}
              {[0, 25, 50, 75, 100].map((t) => (
                <text key={t} x={px(t)} y={ALTURA - 20} textAnchor="middle" className="fill-ink-500 text-[10px]">
                  {t}%
                </text>
              ))}
              <text x={MARGEM.esquerda + areaX / 2} y={ALTURA - 0} textAnchor="middle" className="fill-ink-400 text-[10px]">
                seções totalizadas →
              </text>

              {series.map((s, i) => (
                <g key={s.numero}>
                  <polyline
                    points={s.pontos.map((p) => `${px(p.x)},${py(p.y)}`).join(' ')}
                    fill="none"
                    stroke={CORES_DA_NOITE[i]}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {s.pontos.length > 0 ? (
                    <circle
                      cx={px(s.pontos[s.pontos.length - 1].x)}
                      cy={py(s.pontos[s.pontos.length - 1].y)}
                      r={4}
                      fill={CORES_DA_NOITE[i]}
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  ) : null}
                </g>
              ))}

              {/* Rotulo direto na ponta: nome e porcentagem, em tinta de texto. */}
              {rotulos.map((r) => (
                <g key={r.i}>
                  <line
                    x1={px(r.x) + 6}
                    x2={px(100) + 8}
                    y1={py(r.y)}
                    y2={r.alvo}
                    stroke={CORES_DA_NOITE[r.i]}
                    strokeWidth={1}
                    opacity={0.5}
                  />
                  <text x={px(100) + 12} y={r.alvo + 4} className="fill-ink-900 text-[11px] font-semibold">
                    {estreito ? (
                      pct(r.y)
                    ) : (
                      <>
                        {r.nome.length > 16 ? `${r.nome.slice(0, 15)}…` : r.nome}{' '}
                        <tspan className="fill-ink-500 font-normal">{pct(r.y)}</tspan>
                      </>
                    )}
                  </text>
                </g>
              ))}

              {mira !== null ? (
                <line x1={px(mira)} x2={px(mira)} y1={MARGEM.topo} y2={MARGEM.topo + areaY} stroke="#94a3b8" strokeDasharray="3 3" />
              ) : null}
            </svg>
          )}

          {mira !== null && temLinha ? (
            <div
              className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-control border border-line bg-surface/95 px-2.5 py-2 text-xs shadow-overlay backdrop-blur"
              style={{ left: Math.min(px(mira) + 10, largura - 190) }}
            >
              <p className="mb-1 font-semibold text-ink-900">
                {pct(mira)} das seções
                {series.flatMap((s) => s.pontos).find((p) => p.x === mira)?.hora
                  ? ` · ${series.flatMap((s) => s.pontos).find((p) => p.x === mira)?.hora}`
                  : ''}
              </p>
              {naMira(mira).map((p, i) => (
                <p key={series[i].numero} className="flex items-center justify-between gap-3 text-ink-700">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="size-2 rounded-full" style={{ background: CORES_DA_NOITE[i] }} />
                    {curto(series[i].nome)}
                  </span>
                  <span className="font-semibold text-ink-900 tabular-nums">{p ? pct(p.y) : '—'}</span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
