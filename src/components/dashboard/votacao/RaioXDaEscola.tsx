'use client';

import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus, Users, X } from 'lucide-react';
import {
  chaveDaSecao,
  conversao,
  leitura,
  type EscolaNoConfronto,
  type LeituraDoConfronto,
  type LiderNoRaioX,
} from '@/lib/domain/confronto';
import { cn } from '@/lib/utils/cn';
import { formatNumber, initials } from '@/lib/utils/text';
import { Modal } from '@/components/ui/Modal';
import { Contador } from '@/components/ui/Contador';
import { BotaoDePdf } from '../BotaoDePdf';

/**
 * Raio-X da escola: o que o time esperava ali (estimativa da campanha: uma
 * pessoa cadastrada que vota na escola, um voto), quem cadastrou essa gente
 * (Lider a Lider) e o que o candidato teve (votos apurados pelo TSE) —
 * escola, zona e secao.
 *
 * Duas cores fixas, com nome escrito do lado (nunca so a cor): azul-marinho
 * e a estimativa, ouro e a apuracao. Tocar um Lider acende, em cada secao, a
 * parte da estimativa que e dele.
 */

const LEITURA: Record<LeituraDoConfronto, { texto: string; classe: string; icone: React.ReactNode } | null> = {
  ACIMA: { texto: 'Acima da estimativa', classe: 'bg-success-50 text-success-700', icone: <ArrowUpRight className="size-3" /> },
  PERTO: { texto: 'Perto da estimativa', classe: 'bg-gold-50 text-gold-700', icone: <Minus className="size-3" /> },
  ABAIXO: { texto: 'Abaixo da estimativa', classe: 'bg-danger-50 text-danger-700', icone: <ArrowDownRight className="size-3" /> },
  ZERADA: { texto: 'Nenhum voto', classe: 'bg-danger-50 text-danger-700', icone: <ArrowDownRight className="size-3" /> },
  SEM_ESTIMATIVA: { texto: 'Sem estimativa', classe: 'bg-ink-100 text-ink-500', icone: null },
};

export function SeloDaLeitura({ estimativa, apurado }: { estimativa: number; apurado: number }) {
  const l = LEITURA[leitura({ estimativa, apurado })];
  if (!l) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap', l.classe)}>
      {l.icone}
      {l.texto}
    </span>
  );
}

/** Uma frase que diz o que a escola mostrou. */
export function fraseDaEscola(e: Pick<EscolaNoConfronto, 'estimativa' | 'apurado'>, candidato: string): string {
  const c = conversao(e);
  if (e.estimativa <= 0) return `${candidato} teve ${formatNumber(e.apurado)} votos aqui, onde o time não tinha estimativa.`;
  if (e.apurado <= 0) return `O time estimava ${formatNumber(e.estimativa)} votos aqui, e ${candidato} não teve nenhum até agora.`;
  if (c! >= 100) {
    return `${candidato} teve ${formatNumber(e.apurado)} votos onde o time estimava ${formatNumber(e.estimativa)}: ${Math.round(c!)}% da estimativa.`;
  }
  return `${candidato} teve ${formatNumber(e.apurado)} dos ${formatNumber(e.estimativa)} votos estimados: ${Math.round(c!)}% da estimativa.`;
}

const corDaConversao = (c: number | null) => (c === null ? '#94a3b8' : c >= 100 ? '#4ade80' : c >= 80 ? '#f2c14e' : '#f87171');

/** Medidor da conversao sobre o azul-marinho: meia-lua, cheia em 100%. */
function Medidor({ valor }: { valor: number | null }) {
  const pct = valor ?? 0;
  const cheio = Math.min(100, pct);
  const arco = Math.PI * 46;
  return (
    <div className="relative h-[4.75rem] w-36" role="img" aria-label={valor === null ? 'Sem estimativa' : `Conversão de ${Math.round(pct)}%`}>
      <svg viewBox="0 0 110 60" className="size-full">
        <path d="M9 55 A46 46 0 0 1 101 55" fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth="9" strokeLinecap="round" />
        <path
          d="M9 55 A46 46 0 0 1 101 55"
          fill="none"
          stroke={corDaConversao(valor)}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={arco}
          strokeDashoffset={arco * (1 - cheio / 100)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <p className="absolute inset-x-0 bottom-0 text-center text-2xl leading-none font-bold text-white tabular-nums">
        {valor === null ? '—' : <Contador valor={Math.round(pct)} formatar={(n) => `${n}%`} />}
      </p>
    </div>
  );
}

/** O placar: estimativa contra apurado, em numeros grandes e em duas barras. */
function Placar({ escola, candidato }: { escola: EscolaNoConfronto; candidato: string }) {
  const c = conversao(escola);
  const maior = Math.max(1, escola.estimativa, escola.apurado);
  const diferenca = escola.apurado - escola.estimativa;
  return (
    <section
      aria-label="Estimativa e apuração"
      className="animate-fade-up overflow-hidden rounded-card bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 p-4 text-white sm:p-5"
    >
      <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wider text-white/60 uppercase">
            <span aria-hidden="true" className="size-2 rounded-sm bg-white/80" /> Estimativa do time
          </p>
          <p className="mt-1 text-4xl leading-none font-bold tabular-nums">
            <Contador valor={escola.estimativa} />
          </p>
          <p className="mt-1 text-xs text-white/60">pessoas cadastradas que votam aqui</p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wider text-white/60 uppercase">
            <span aria-hidden="true" className="size-2 rounded-sm bg-gold-400" /> Apurado (TSE)
          </p>
          <p className="mt-1 text-4xl leading-none font-bold text-gold-400 tabular-nums">
            <Contador valor={escola.apurado} />
          </p>
          <p className="mt-1 truncate text-xs text-white/60">votos de {candidato}</p>
        </div>
        <div className="col-span-2 flex flex-col items-center sm:col-span-1">
          <Medidor valor={c} />
          <p className="mt-1 text-[0.6875rem] font-semibold tracking-wider text-white/60 uppercase">conversão</p>
        </div>
      </div>

      {/* As duas barras na mesma escala: a distancia entre elas e a historia. */}
      <div className="mt-4 space-y-1.5">
        {[
          { rotulo: 'estimativa', valor: escola.estimativa, cor: 'bg-white/85' },
          { rotulo: 'apurado', valor: escola.apurado, cor: 'bg-gold-400' },
        ].map((b) => (
          <div key={b.rotulo} className="h-2.5 overflow-hidden rounded-pill bg-white/10" title={`${b.rotulo}: ${formatNumber(b.valor)}`}>
            <div
              className={cn('h-full rounded-pill transition-[width] duration-1000 ease-out', b.cor)}
              style={{ width: `${b.valor > 0 ? Math.max(2, (b.valor / maior) * 100) : 0}%` }}
            />
          </div>
        ))}
      </div>
      {escola.estimativa > 0 ? (
        <p
          className={cn(
            'mt-3 inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-semibold',
            diferenca > 0 ? 'bg-success-400/15 text-success-400' : diferenca < 0 ? 'bg-danger-600/30 text-danger-200' : 'bg-white/10 text-white',
          )}
        >
          {diferenca > 0 ? <ArrowUpRight className="size-3.5" /> : diferenca < 0 ? <ArrowDownRight className="size-3.5" /> : <Minus className="size-3.5" />}
          {diferenca > 0
            ? `${formatNumber(diferenca)} ${diferenca === 1 ? 'voto' : 'votos'} acima da estimativa`
            : diferenca < 0
              ? `${formatNumber(-diferenca)} ${diferenca === -1 ? 'voto' : 'votos'} abaixo da estimativa`
              : 'Exatamente a estimativa'}
        </p>
      ) : null}
    </section>
  );
}

/** Os Lideres que cadastraram a estimativa da escola. Tocar um acende a parte dele nas secoes. */
function Lideres({
  escola,
  lideres,
  diretos,
  foco,
  onFoco,
  candidato,
}: {
  escola: EscolaNoConfronto;
  lideres: LiderNoRaioX[];
  diretos: number;
  foco: string | null;
  onFoco: (id: string | null) => void;
  candidato: string;
}) {
  const maior = Math.max(1, ...lideres.map((l) => l.cadastrados));
  const escolhido = lideres.find((l) => l.id === foco) ?? null;
  // Votos do candidato nas secoes onde a gente do Lider escolhido vota.
  const votosNasSecoesDele = escolhido
    ? escola.secoes
        .filter((s) => (escolhido.porSecao[chaveDaSecao(s.zona, s.secao)] ?? 0) > 0 && (s.zona || s.secao))
        .reduce((t, s) => t + s.apurado, 0)
    : 0;
  const secoesDele = escolhido ? Object.keys(escolhido.porSecao).filter((k) => k !== chaveDaSecao(null, null)).length : 0;

  return (
    <section aria-label="Líderes nesta escola" className="flex min-w-0 flex-col rounded-card border border-line bg-surface">
      <header className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink-900">Líderes nesta escola</h3>
        <p className="text-xs text-ink-500 tabular-nums">
          {formatNumber(lideres.length)} {lideres.length === 1 ? 'líder' : 'líderes'}
        </p>
      </header>

      {lideres.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-500">Nenhum líder registrado nos cadastros desta escola.</p>
      ) : (
        <ol className="max-h-[26rem] divide-y divide-line overflow-y-auto">
          {lideres.map((l, i) => {
            const ativo = l.id === foco;
            const parte = escola.estimativa > 0 ? Math.round((l.cadastrados / escola.estimativa) * 100) : 0;
            return (
              <li key={l.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                <button
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => onFoco(ativo ? null : l.id)}
                  className={cn(
                    'grid w-full grid-cols-[2.25rem_minmax(0,1fr)_5.75rem] items-center gap-x-3 px-4 py-2.5 text-left transition-colors',
                    ativo ? 'bg-gold-50' : 'hover:bg-ink-50',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-9 items-center justify-center rounded-full text-xs font-bold transition-colors',
                      ativo ? 'bg-gold-500 text-navy-900' : 'bg-navy-900 text-gold-400',
                    )}
                  >
                    {initials(l.nome)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink-900">{l.nome}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-pill bg-ink-100">
                      <span
                        className={cn('block h-full rounded-pill transition-[width] duration-700 ease-out', ativo ? 'bg-gold-500' : 'bg-navy-800')}
                        style={{ width: `${Math.max(4, (l.cadastrados / maior) * 100)}%` }}
                      />
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-lg leading-none font-bold text-navy-900 tabular-nums">{formatNumber(l.cadastrados)}</span>
                    <span className="block text-[0.6875rem] whitespace-nowrap text-ink-500 tabular-nums">{parte}% da escola</span>
                  </span>
                </button>
              </li>
            );
          })}
          {diretos > 0 ? (
            <li className="grid grid-cols-[2.25rem_minmax(0,1fr)_5.75rem] items-center gap-x-3 px-4 py-2.5">
              <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full border border-dashed border-ink-200 text-ink-400">
                <Users className="size-4" />
              </span>
              <span className="min-w-0 text-xs text-ink-500">Líderes e cadastros sem líder registrado</span>
              <span className="text-right text-lg leading-none font-bold text-ink-500 tabular-nums">{formatNumber(diretos)}</span>
            </li>
          ) : null}
        </ol>
      )}

      <footer className="mt-auto border-t border-line px-4 py-2.5 text-xs text-ink-500">
        {escolhido ? (
          <p>
            <b className="text-ink-900">{escolhido.nome}</b> cadastrou {formatNumber(escolhido.cadastrados)}{' '}
            {escolhido.cadastrados === 1 ? 'pessoa' : 'pessoas'}
            {secoesDele ? ` em ${formatNumber(secoesDele)} ${secoesDele === 1 ? 'seção' : 'seções'}` : ''}. Nessas seções, {candidato} teve{' '}
            <b className="text-gold-700">{formatNumber(votosNasSecoesDele)}</b> {votosNasSecoesDele === 1 ? 'voto' : 'votos'}.
          </p>
        ) : lideres.length > 0 ? (
          <p>Toque em um líder para ver, seção por seção, onde está a gente dele.</p>
        ) : null}
      </footer>
    </section>
  );
}

/** Secao por secao: a estimativa (com a parte do Lider em foco) e o apurado. */
function Secoes({ escola, escolhido }: { escola: EscolaNoConfronto; escolhido: LiderNoRaioX | null }) {
  const maior = Math.max(1, ...escola.secoes.map((s) => Math.max(s.estimativa, s.apurado)));
  const comNumero = escola.secoes.filter((s) => s.zona || s.secao);
  const zonas = [...new Set(comNumero.map((s) => s.zona).filter(Boolean))];
  const largura = (v: number) => `${v > 0 ? Math.max(2, (v / maior) * 100) : 0}%`;

  return (
    <section aria-label="Seções desta escola" className="flex min-w-0 flex-col rounded-card border border-line bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink-900">
          {zonas.length ? `Zona ${zonas.join(', ')} · ` : ''}
          {comNumero.length} {comNumero.length === 1 ? 'seção' : 'seções'}
        </h3>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-ink-500">
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-navy-800" /> estimativa
          </span>
          {escolhido ? (
            <span className="flex items-center gap-1">
              <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-gold-600" /> de {escolhido.nome.split(' ')[0]}
            </span>
          ) : null}
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-gold-400" /> apurado
          </span>
        </p>
      </header>

      <ol className="max-h-[26rem] divide-y divide-line overflow-y-auto">
        {escola.secoes.map((s, i) => {
          const comSecao = Boolean(s.zona || s.secao);
          const dele = escolhido ? (escolhido.porSecao[chaveDaSecao(s.zona, s.secao)] ?? 0) : 0;
          const apagada = escolhido !== null && dele === 0;
          const diferenca = s.apurado - s.estimativa;
          return (
            <li
              key={`${s.zona}/${s.secao}/${i}`}
              className={cn(
                'grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition-opacity duration-300',
                apagada && 'opacity-35',
              )}
            >
              <div className="min-w-0">
                {comSecao ? (
                  <>
                    <p className="text-sm font-semibold text-ink-900 tabular-nums">Seção {s.secao ?? '?'}</p>
                    <p className="text-[0.6875rem] text-ink-500">Zona {s.zona ?? '?'}</p>
                  </>
                ) : (
                  <p className="text-xs leading-tight text-ink-500">Sem zona/seção no cadastro</p>
                )}
              </div>

              <div className="space-y-1">
                {/* Estimativa: com um Lider em foco, a parte dele em ouro escuro. */}
                <div className="flex items-center gap-2" title={`estimativa: ${formatNumber(s.estimativa)}`}>
                  <div className="flex h-2.5 flex-1 overflow-hidden rounded-pill bg-ink-100">
                    <div className="flex h-full overflow-hidden rounded-pill transition-[width] duration-700 ease-out" style={{ width: largura(s.estimativa) }}>
                      {escolhido && dele > 0 ? (
                        <div className="h-full bg-gold-600 transition-[width] duration-500" style={{ width: `${(dele / Math.max(1, s.estimativa)) * 100}%` }} />
                      ) : null}
                      <div className={cn('h-full flex-1 transition-colors', escolhido ? 'bg-navy-300' : 'bg-navy-800')} />
                    </div>
                  </div>
                  <span className="w-12 text-right text-xs font-semibold text-ink-900 tabular-nums">
                    {escolhido && dele > 0 ? (
                      <>
                        <span className="text-gold-700">{formatNumber(dele)}</span>
                        <span className="font-normal text-ink-400">/{formatNumber(s.estimativa)}</span>
                      </>
                    ) : (
                      formatNumber(s.estimativa)
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2" title={`apurado: ${formatNumber(s.apurado)}`}>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-ink-100">
                    <div className="h-full rounded-pill bg-gold-400 transition-[width] duration-700 ease-out" style={{ width: largura(s.apurado) }} />
                  </div>
                  <span className="w-12 text-right text-xs font-semibold text-gold-700 tabular-nums">{formatNumber(s.apurado)}</span>
                </div>
              </div>

              <div className="flex w-14 justify-end sm:w-auto">
                {/* Sem secao no cadastro, nao ha apuracao para comparar. */}
                {!comSecao ? (
                  <span className="text-[0.6875rem] text-ink-400">—</span>
                ) : (
                  <>
                    <span
                      className={cn(
                        'text-sm font-bold tabular-nums sm:hidden',
                        diferenca > 0 ? 'text-success-700' : diferenca < 0 ? 'text-danger-700' : 'text-ink-500',
                      )}
                    >
                      {diferenca > 0 ? `+${formatNumber(diferenca)}` : formatNumber(diferenca)}
                    </span>
                    <span className="hidden sm:inline-flex">
                      <SeloDaLeitura estimativa={s.estimativa} apurado={s.apurado} />
                    </span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function RaioXDaEscola({
  escola,
  candidato,
  lideres = [],
  diretos = 0,
  onClose,
  onVerPessoas,
  onPdf,
}: {
  escola: EscolaNoConfronto;
  /** "Fulano (15123) · Deputado Estadual". */
  candidato: { nome: string; rotulo: string };
  /** Quem cadastrou a estimativa da escola, Lider a Lider. */
  lideres?: LiderNoRaioX[];
  /** O resto da estimativa: Lideres e cadastros sem Lider registrado. */
  diretos?: number;
  onClose: () => void;
  /** Abre a lista de quem vota aqui (pinos da campanha). */
  onVerPessoas?: () => void;
  /** Baixa o relatorio de estimativa x apuracao do time. */
  onPdf?: () => Promise<void>;
}) {
  const [foco, setFoco] = useState<string | null>(null);
  const escolhido = lideres.find((l) => l.id === foco) ?? null;
  const onde = [escola.endereco, [escola.cidade, escola.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ');

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Raio-X: ${escola.titulo}`}
      header={
        <div className="min-w-0">
          <p className="inline-flex max-w-full items-center gap-1.5 rounded-pill bg-navy-900 px-2.5 py-1 text-[0.6875rem] font-semibold text-gold-400">
            <span aria-hidden="true">★</span>
            <span className="truncate">Raio-X · {candidato.rotulo}</span>
          </p>
          <h2 className="mt-2 text-lg leading-tight font-bold text-ink-900 sm:text-xl">{escola.titulo}</h2>
          {onde ? <p className="mt-0.5 text-sm text-ink-500">{onde}</p> : null}
        </div>
      }
    >
      <div className="space-y-4">
        <Placar escola={escola} candidato={candidato.nome} />

        <p className="rounded-control border-l-4 border-gold-500 bg-gold-50 px-3 py-2 text-sm text-ink-900">
          {fraseDaEscola(escola, candidato.nome)}
        </p>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Lideres escola={escola} lideres={lideres} diretos={diretos} foco={foco} onFoco={setFoco} candidato={candidato.nome} />
          <Secoes escola={escola} escolhido={escolhido} />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
          {escolhido ? (
            <button
              type="button"
              onClick={() => setFoco(null)}
              className="mr-auto inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-line px-3 text-xs font-medium text-ink-700 hover:bg-ink-50"
            >
              <X aria-hidden="true" className="size-3.5" /> Ver todos os líderes
            </button>
          ) : null}
          {onVerPessoas ? (
            <button
              type="button"
              onClick={onVerPessoas}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-brand-200 px-3 text-xs font-semibold text-brand-800 hover:bg-brand-50"
            >
              <Users aria-hidden="true" className="size-3.5" /> Ver quem vota aqui
            </button>
          ) : null}
          {onPdf ? <BotaoDePdf onClick={onPdf} rotulo="Relatório do time (PDF)" titulo="Todas as escolas do time: estimativa x apuração" variante="cheio" /> : null}
        </div>
      </div>
    </Modal>
  );
}
