'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowDownRight, ArrowUpRight, MapPin, Minus, ScanSearch, Search, Users, X } from 'lucide-react';
import { conversao, leitura, type EscolaNoComparativo, type LeituraDoConfronto, type LiderNoRaioX } from '@/lib/domain/confronto';
import { cn } from '@/lib/utils/cn';
import { formatNumber, initials } from '@/lib/utils/text';
import { Contador } from '@/components/ui/Contador';

/**
 * Expectativa x votos reais, ESCOLA POR ESCOLA.
 *
 * Para cada escola onde o time tem gente: quantas pessoas foram cadastradas
 * ali (a expectativa), QUEM cadastrou (os Lideres, cada um com a sua conta)
 * e quantos votos cada candidato teve de verdade (TSE), com a conversao e a
 * diferenca. No topo, o resumo: a expectativa somada, os votos somados e
 * quantas escolas ficaram acima, perto ou abaixo do esperado.
 *
 * Segue o recorte do mapa inteiro — municipio, zona, SECAO e LIDER —, entao
 * "o que a Jailma prometeu na secao 96 e o que o candidato teve la" e uma
 * pergunta de dois cliques.
 */

export interface CandidatoNoQuadro {
  nome: string;
  cor: string;
}

type Ordem = 'expectativa' | 'votos' | 'pior' | 'melhor' | 'nome';
type FiltroDeLeitura = 'TODAS' | Exclude<LeituraDoConfronto, 'SEM_ESTIMATIVA'>;

const ORDENS: { id: Ordem; label: string }[] = [
  { id: 'expectativa', label: 'Maior expectativa' },
  { id: 'votos', label: 'Mais votos' },
  { id: 'pior', label: 'Pior resultado' },
  { id: 'melhor', label: 'Melhor resultado' },
  { id: 'nome', label: 'Nome' },
];

const LEITURAS: {
  id: Exclude<FiltroDeLeitura, 'TODAS'>;
  texto: string;
  /** Na legenda e no selo da escola. */
  frase: string;
  cor: string;
  fundo: string;
  icone: React.ReactNode;
}[] = [
  { id: 'ACIMA', texto: 'Acima', frase: 'acima da expectativa', cor: '#16803c', fundo: '#e6f5ec', icone: <ArrowUpRight className="size-3" /> },
  { id: 'PERTO', texto: 'Perto', frase: 'perto da expectativa', cor: '#b7801a', fundo: '#fdf6e3', icone: <Minus className="size-3" /> },
  { id: 'ABAIXO', texto: 'Abaixo', frase: 'abaixo da expectativa', cor: '#d9362b', fundo: '#fdecea', icone: <ArrowDownRight className="size-3" /> },
  { id: 'ZERADA', texto: 'Nenhum voto', frase: 'sem nenhum voto', cor: '#8e1c13', fundo: '#fcedec', icone: <X className="size-3" /> },
];
const ESTILO_DA_LEITURA = Object.fromEntries(LEITURAS.map((l) => [l.id, l])) as Record<string, (typeof LEITURAS)[number]>;

const POR_VEZ = 30;
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v).toLocaleString('pt-BR')}%`);
const corDaConversao = (c: number | null) => (c === null ? '#94a3b8' : c >= 100 ? '#16803c' : c >= 80 ? '#b7801a' : '#d9362b');
const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function EscolaPorEscola({
  escolas,
  candidatos,
  lideresDe,
  liderEmFoco,
  recorte,
  onAbrir,
  onFocar,
}: {
  /** As escolas do time no recorte, com o apurado de cada candidato. */
  escolas: EscolaNoComparativo[];
  candidatos: CandidatoNoQuadro[];
  /** Quem cadastrou a expectativa de cada escola, Lider a Lider. */
  lideresDe: (escola: EscolaNoComparativo) => LiderNoRaioX[];
  /** O Lider do filtro, quando ha um: a expectativa e so dele. */
  liderEmFoco: string | null;
  /** O recorte em palavras ("Seção 96 · Zona 10"). */
  recorte: string | null;
  onAbrir: (escola: EscolaNoComparativo) => void;
  onFocar: (escola: EscolaNoComparativo) => void;
}) {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('expectativa');
  const [filtro, setFiltro] = useState<FiltroDeLeitura>('TODAS');
  const varios = candidatos.length > 1;

  // Os Lideres de cada escola, calculados uma vez.
  const linhas = useMemo(
    () =>
      escolas.map((e) => ({
        e,
        lideres: lideresDe(e),
        leitura: leitura({ estimativa: e.estimativa, apurado: e.apurado[0] ?? 0 }),
      })),
    [escolas, lideresDe],
  );

  const resumo = useMemo(() => {
    const expectativa = escolas.reduce((t, e) => t + e.estimativa, 0);
    const votos = candidatos.map((_, i) => escolas.reduce((t, e) => t + (e.apurado[i] ?? 0), 0));
    const porLeitura = Object.fromEntries(LEITURAS.map((l) => [l.id, 0])) as Record<string, number>;
    for (const l of linhas) if (l.leitura in porLeitura) porLeitura[l.leitura] += 1;
    return { expectativa, votos, porLeitura };
  }, [escolas, candidatos, linhas]);

  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim());
    const lista = linhas.filter(
      (l) =>
        (filtro === 'TODAS' || l.leitura === filtro) &&
        (!termo ||
          semAcento(l.e.titulo).includes(termo) ||
          semAcento(l.e.cidade ?? '').includes(termo) ||
          l.lideres.some((x) => semAcento(x.nome).includes(termo))),
    );
    const conv = (l: (typeof linhas)[number]) => conversao({ estimativa: l.e.estimativa, apurado: l.e.apurado[0] ?? 0 }) ?? 0;
    return [...lista].sort((a, b) =>
      ordem === 'expectativa'
        ? b.e.estimativa - a.e.estimativa
        : ordem === 'votos'
          ? (b.e.apurado[0] ?? 0) - (a.e.apurado[0] ?? 0)
          : ordem === 'pior'
            ? conv(a) - conv(b) || b.e.estimativa - a.e.estimativa
            : ordem === 'melhor'
              ? conv(b) - conv(a) || b.e.estimativa - a.e.estimativa
              : a.e.titulo.localeCompare(b.e.titulo, 'pt-BR'),
    );
  }, [linhas, busca, filtro, ordem]);

  // A leva volta ao comeco quando o filtro muda.
  const chave = `${busca}|${filtro}|${ordem}`;
  const [leva, setLeva] = useState({ chave, quantos: POR_VEZ });
  const mostrar = leva.chave === chave ? leva.quantos : POR_VEZ;

  const maiorDaLinha = (e: EscolaNoComparativo) => Math.max(1, e.estimativa, ...e.apurado);
  const totalLeituras = Math.max(1, LEITURAS.reduce((t, l) => t + resumo.porLeitura[l.id], 0));

  return (
    <section aria-label="Expectativa e votos reais, escola por escola" className="border-t border-line">
      {/* CABECALHO E RESUMO */}
      <div className="relative overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-[#1e3a8a] px-4 py-5 text-white sm:px-5">
        <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0" />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.16em] text-gold-400 uppercase">
              <ScanSearch aria-hidden="true" className="size-3.5" />
              Expectativa × votos reais
            </p>
            <h3 className="mt-1 text-xl font-bold sm:text-2xl">Escola por escola</h3>
            <p className="mt-0.5 text-sm text-white/70">
              {liderEmFoco ? (
                <>
                  Só as pessoas que <b className="text-white">{liderEmFoco}</b> cadastrou, contra os votos de verdade
                </>
              ) : (
                'Quem cadastrou, quantas pessoas e quantos votos o candidato teve de verdade'
              )}
              {recorte ? ` · ${recorte}` : ''}
            </p>
            <p className="mt-1 text-xs text-white/50">
              Votos reais: todos os votos do candidato na escola (ou na seção do filtro), pelo TSE. O voto é secreto — a
              comparação mostra onde a expectativa se confirmou.
            </p>
          </div>
        </div>

        <dl className="relative mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
          <div className="cmd-cascata rounded-control border border-white/10 bg-white/5 px-3 py-2.5">
            <dt className="text-[0.6875rem] font-semibold tracking-wide text-white/70 uppercase">Escolas</dt>
            <dd className="mt-1 text-2xl leading-none font-bold">
              <Contador valor={escolas.length} />
            </dd>
          </div>
          <div className="cmd-cascata rounded-control border border-white/20 bg-white/15 px-3 py-2.5" style={{ '--cmd-atraso': '70ms' } as CSSProperties}>
            <dt className="text-[0.6875rem] font-semibold tracking-wide text-white/70 uppercase">Expectativa</dt>
            <dd className="mt-1 text-2xl leading-none font-bold">
              <Contador valor={resumo.expectativa} />
            </dd>
            <dd className="mt-0.5 text-[0.6875rem] text-white/60">pessoas cadastradas</dd>
          </div>
          {candidatos.map((c, i) => {
            const conv = conversao({ estimativa: resumo.expectativa, apurado: resumo.votos[i] ?? 0 });
            return (
              <div
                key={c.nome}
                className="cmd-cascata flex items-center gap-3 rounded-control border border-white/10 bg-white/5 px-3 py-2.5"
                style={{ '--cmd-atraso': `${140 + i * 70}ms`, borderLeft: `3px solid ${c.cor}` } as CSSProperties}
              >
                <div className="min-w-0 flex-1">
                  <dt className="text-[0.6875rem] font-semibold tracking-wide wrap-break-word text-white/70 uppercase">Votos reais · {c.nome}</dt>
                  <dd className="mt-1 text-2xl leading-none font-bold">
                    <Contador valor={resumo.votos[i] ?? 0} />
                  </dd>
                </div>
                <Anel valor={conv} cor={c.cor} />
              </div>
            );
          })}
        </dl>

        {/* Quantas escolas em cada leitura (do primeiro candidato). */}
        {escolas.length > 0 ? (
          <div className="relative mt-4">
            <div className="flex h-3 overflow-hidden rounded-pill bg-white/10" role="img" aria-label="Escolas por resultado">
              {LEITURAS.map((l) =>
                resumo.porLeitura[l.id] > 0 ? (
                  <span
                    key={l.id}
                    className="cmd-barra-viva h-full first:rounded-l-pill last:rounded-r-pill"
                    style={{ width: `${(resumo.porLeitura[l.id] / totalLeituras) * 100}%`, background: l.cor }}
                    title={`${l.texto}: ${resumo.porLeitura[l.id]}`}
                  />
                ) : null,
              )}
            </div>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/75">
              {varios ? <span className="text-white/55">Resultado de {candidatos[0].nome}:</span> : null}
              {LEITURAS.map((l) => (
                <span key={l.id} className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ background: l.cor }} />
                  <b className="text-white tabular-nums">{formatNumber(resumo.porLeitura[l.id])}</b> {l.frase}
                </span>
              ))}
            </p>
          </div>
        ) : null}
      </div>

      {/* FERRAMENTAS */}
      <div className="flex flex-col gap-2 border-b border-line bg-ink-50/60 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex min-w-0 flex-1 items-center">
            <span className="sr-only">Buscar escola, cidade ou líder</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-ink-400" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar escola, cidade ou líder"
              className="min-h-10 w-full rounded-pill border border-line bg-surface pr-3 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:border-accent-600 focus:outline-none"
            />
          </label>
          <select
            aria-label="Ordenar escolas"
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as Ordem)}
            className="min-h-10 rounded-pill border border-line bg-surface px-3 text-sm font-medium text-ink-700"
          >
            {ORDENS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div role="group" aria-label="Filtrar pelo resultado" className="-mx-0.5 flex gap-1.5 overflow-x-auto px-0.5">
          {[{ id: 'TODAS' as const, texto: 'Todas', cor: '#2563eb' }, ...LEITURAS].map((l) => {
            const ligado = filtro === l.id;
            const n = l.id === 'TODAS' ? linhas.length : resumo.porLeitura[l.id];
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={ligado}
                onClick={() => setFiltro(l.id)}
                className={cn(
                  'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold transition-all',
                  ligado ? 'border-transparent text-white shadow-card' : 'border-line bg-surface text-ink-700 hover:bg-ink-50',
                )}
                style={ligado ? { background: l.cor } : undefined}
              >
                {l.texto}
                <span className={cn('rounded-pill px-1.5 text-[0.625rem] tabular-nums', ligado ? 'bg-white/25' : 'bg-ink-100 text-ink-500')}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* AS ESCOLAS */}
      {visiveis.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-ink-500">
          {escolas.length === 0
            ? liderEmFoco
              ? `${liderEmFoco} não tem pessoas cadastradas neste recorte.`
              : 'O time não tem pessoas cadastradas neste recorte.'
            : 'Nenhuma escola com esse filtro.'}
        </p>
      ) : (
        <ol className="divide-y divide-line">
          {visiveis.slice(0, mostrar).map(({ e, lideres, leitura: lido }, i) => {
            const maior = maiorDaLinha(e);
            const selo = ESTILO_DA_LEITURA[lido];
            const outros = Math.max(0, lideres.length - 3);
            return (
              <li
                key={e.chave}
                className="cmd-cascata grid gap-3 px-4 py-3.5 transition-colors hover:bg-accent-50/40 sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1.6fr)_auto] lg:items-center"
                style={{ '--cmd-atraso': `${Math.min(i, 12) * 30}ms` } as CSSProperties}
              >
                {/* Escola */}
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-gold-400 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm leading-snug font-semibold wrap-break-word text-ink-900">{e.titulo}</p>
                    <p className="mt-0.5 text-xs wrap-break-word text-ink-500">
                      {[e.cidade, [...new Set(e.secoes.map((s) => s.zona).filter(Boolean))].map((z) => `Zona ${z}`).join(', ')]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {!varios && selo ? (
                      <span
                        className="mt-1.5 inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[0.6875rem] font-semibold"
                        style={{ color: selo.cor, background: selo.fundo }}
                      >
                        {selo.icone}
                        {selo.id === 'ZERADA' ? 'Nenhum voto' : `${selo.texto} da expectativa`}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Lideres */}
                <div className="min-w-0">
                  <p className="mb-1 flex items-center gap-1 text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase">
                    <Users aria-hidden="true" className="size-3" />
                    {lideres.length === 1 ? 'Líder' : `${lideres.length} líderes`}
                  </p>
                  {lideres.length === 0 ? (
                    <p className="text-xs text-ink-400">Sem líder registrado</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {lideres.slice(0, 3).map((l) => (
                        <li
                          key={l.id}
                          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface py-0.5 pr-2 pl-0.5 text-xs"
                          title={`${l.nome}: ${l.cadastrados} ${l.cadastrados === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'} nesta escola`}
                        >
                          <span className="flex size-6 items-center justify-center rounded-full bg-navy-900 text-[0.625rem] font-bold text-gold-400">
                            {initials(l.nome)}
                          </span>
                          <span className="font-semibold wrap-break-word text-ink-900">{l.nome}</span>
                          <span className="rounded-pill bg-navy-900 px-1.5 text-[0.625rem] font-bold text-white tabular-nums">{l.cadastrados}</span>
                        </li>
                      ))}
                      {outros > 0 ? (
                        <li className="inline-flex items-center rounded-pill bg-ink-100 px-2 text-xs font-semibold text-ink-700">+{outros}</li>
                      ) : null}
                    </ul>
                  )}
                </div>

                {/* Expectativa x votos reais */}
                <div className="min-w-0 space-y-1.5">
                  <Barra rotulo="Expectativa" valor={e.estimativa} maior={maior} cor="#16263f" nota="pessoas cadastradas" />
                  {candidatos.map((c, k) => {
                    const votos = e.apurado[k] ?? 0;
                    const conv = conversao({ estimativa: e.estimativa, apurado: votos });
                    const diferenca = votos - e.estimativa;
                    return (
                      <Barra
                        key={c.nome}
                        rotulo={varios ? c.nome : 'Votos reais'}
                        valor={votos}
                        maior={maior}
                        cor={c.cor}
                        extra={
                          <span className="flex items-center gap-1.5">
                            <span className="text-[0.6875rem] font-bold tabular-nums" style={{ color: corDaConversao(conv) }}>
                              {pct(conv)}
                            </span>
                            {e.estimativa > 0 ? (
                              <span
                                className={cn(
                                  'rounded-pill px-1.5 text-[0.625rem] font-bold tabular-nums',
                                  diferenca > 0 ? 'bg-success-50 text-success-700' : diferenca < 0 ? 'bg-danger-50 text-danger-700' : 'bg-ink-100 text-ink-700',
                                )}
                              >
                                {diferenca > 0 ? `+${formatNumber(diferenca)}` : formatNumber(diferenca)}
                              </span>
                            ) : null}
                          </span>
                        }
                      />
                    );
                  })}
                </div>

                {/* Acoes */}
                <div className="flex gap-1.5 lg:flex-col">
                  <button
                    type="button"
                    onClick={() => onAbrir(e)}
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-pill bg-navy-900 px-3 text-xs font-bold text-gold-400 transition-colors hover:bg-navy-800"
                  >
                    <ScanSearch aria-hidden="true" className="size-3.5" /> Raio-X
                  </button>
                  {e.noMapa ? (
                    <button
                      type="button"
                      onClick={() => onFocar(e)}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-pill border border-line bg-surface px-3 text-xs font-semibold text-accent-700 transition-colors hover:bg-accent-50"
                    >
                      <MapPin aria-hidden="true" className="size-3.5" /> No mapa
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {visiveis.length > mostrar ? (
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={() => setLeva({ chave, quantos: mostrar + POR_VEZ })}
            className="w-full rounded-pill border border-line bg-surface py-2.5 text-sm font-semibold text-accent-700 hover:bg-accent-50"
          >
            Mostrar mais {formatNumber(Math.min(POR_VEZ, visiveis.length - mostrar))} de {formatNumber(visiveis.length - mostrar)} escolas
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Barra({
  rotulo,
  valor,
  maior,
  cor,
  nota,
  extra,
}: {
  rotulo: string;
  valor: number;
  maior: number;
  cor: string;
  nota?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_auto] items-center gap-2">
      <span className="text-[0.6875rem] font-medium wrap-break-word text-ink-500">{rotulo}</span>
      <span className="h-2.5 overflow-hidden rounded-pill bg-ink-100" title={`${rotulo}: ${formatNumber(valor)}${nota ? ` ${nota}` : ''}`}>
        <span
          className="cmd-barra-viva block h-full rounded-pill"
          style={{ width: `${valor > 0 ? Math.max(3, (valor / maior) * 100) : 0}%`, background: cor }}
        />
      </span>
      <span className="flex items-center gap-1.5">
        <span className="min-w-8 text-right text-sm font-bold text-ink-900 tabular-nums">{formatNumber(valor)}</span>
        {extra}
      </span>
    </div>
  );
}

function Anel({ valor, cor }: { valor: number | null; cor: string }) {
  const raio = 15;
  const volta = 2 * Math.PI * raio;
  const cheio = Math.min(100, valor ?? 0);
  return (
    <span className="relative flex size-14 shrink-0 items-center justify-center" aria-label={valor === null ? 'Sem expectativa' : `${Math.round(valor)}% da expectativa`}>
      <svg viewBox="0 0 38 38" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="19" cy="19" r={raio} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
        <circle
          cx="19"
          cy="19"
          r={raio}
          fill="none"
          stroke={cor}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={volta}
          strokeDashoffset={volta * (1 - cheio / 100)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <span className={cn('absolute font-bold tabular-nums', (valor ?? 0) >= 100 ? 'text-[0.625rem]' : 'text-xs')}>{pct(valor)}</span>
    </span>
  );
}
