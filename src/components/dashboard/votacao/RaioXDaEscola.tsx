'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown, FileDown, Grid3x3, MapPin, Minus, ScanSearch, Users, X } from 'lucide-react';
import {
  chaveDaSecao,
  conversao,
  leitura,
  type EscolaNoComparativo,
  type EscolaNoConfronto,
  type LeituraDoConfronto,
  type LiderNoRaioX,
} from '@/lib/domain/confronto';
import { cn } from '@/lib/utils/cn';
import { formatNumber, initials } from '@/lib/utils/text';
import { Contador } from '@/components/ui/Contador';
import { FotoDoCandidato } from '@/components/apuracao/FotoDoCandidato';
import { Spinner } from '@/components/ui/Spinner';
import { SeloDaReferencia } from '@/components/members/TagDaReferencia';
import { baixarPdfDoRaioX } from '../pdf-do-mapa';
import { BotaoVoltar } from './EscolhaDoMunicipio';
import { MarcaDaBarra } from './MarcaDaBarra';

/**
 * Raio-X da escola: o que o time esperava ali (estimativa da campanha: uma
 * pessoa cadastrada que vota na escola, um voto), quem cadastrou essa gente
 * (Lider a Lider) e o que o candidato teve (votos apurados pelo TSE) —
 * escola, zona e secao.
 *
 * Duas cores fixas, com nome escrito do lado (nunca so a cor): azul-marinho
 * e a estimativa, ouro e a apuracao. Com varios candidatos, cada um tem a
 * propria cor (a mesma do placar e do PDF), sempre com o nome ao lado.
 *
 * Abre na TELA INTEIRA, com o voltar vermelho. Quantas pessoas cada Lider
 * cadastrou em cada secao aparece sozinho, sem clique: na grade "Lider x
 * Secao" e em cada secao da lista. Todo Lider leva a tag da referencia.
 * Tocar um Lider ainda acende a parte dele, na grade e nas barras.
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


/** Um candidato no raio-x: nome, rotulo, cor e foto (pelo numero de urna). */
export interface CandidatoNoRaioX {
  nome: string;
  /** "Fulano (15123) · Deputado Estadual". */
  rotulo: string;
  /** Cor do candidato (a mesma do placar e do PDF). */
  cor: string;
  cargo: number;
  foto?: string;
}

const pct = (estimativa: number, apurado: number) => conversao({ estimativa, apurado });

/** O placar de um candidato: estimativa contra apurado, em numeros grandes e em duas barras. */
function Placar({
  estimativa,
  apurado,
  candidato,
  foto,
  cargo,
}: {
  estimativa: number;
  apurado: number;
  candidato: string;
  /** A foto oficial do candidato (pelo numero de urna), ao lado dos votos dele. */
  foto?: string;
  cargo?: number;
}) {
  const c = pct(estimativa, apurado);
  const maior = Math.max(1, estimativa, apurado);
  const diferenca = apurado - estimativa;
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
            <Contador valor={estimativa} />
          </p>
          <p className="mt-1 text-xs text-white/60">pessoas cadastradas que votam aqui</p>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          {cargo !== undefined ? (
            <FotoDoCandidato
              cargo={cargo}
              sqcand={null}
              src={foto}
              nome={candidato}
              tamanho="lg"
              className="shrink-0 ring-[3px] ring-gold-400 ring-offset-2 ring-offset-navy-800"
            />
          ) : null}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wider text-white/60 uppercase">
              <span aria-hidden="true" className="size-2 rounded-sm bg-gold-400" /> Apurado (TSE)
            </p>
            <p className="mt-1 text-4xl leading-none font-bold text-gold-400 tabular-nums">
              <Contador valor={apurado} />
            </p>
            <p className="mt-1 wrap-break-word text-xs text-white/60">votos de {candidato}</p>
          </div>
        </div>
        <div className="col-span-2 flex flex-col items-center sm:col-span-1">
          <Medidor valor={c} />
          <p className="mt-1 text-[0.6875rem] font-semibold tracking-wider text-white/60 uppercase">conversão</p>
        </div>
      </div>

      {/* As duas barras na mesma escala: a distancia entre elas e a historia. */}
      <div className="mt-4 space-y-1.5">
        {[
          { rotulo: 'estimativa', valor: estimativa, cor: 'bg-white/85' },
          { rotulo: 'apurado', valor: apurado, cor: 'bg-gold-400' },
        ].map((b) => (
          <div key={b.rotulo} className="h-2.5 overflow-hidden rounded-pill bg-white/10" title={`${b.rotulo}: ${formatNumber(b.valor)}`}>
            <div
              className={cn('h-full rounded-pill transition-[width] duration-1000 ease-out', b.cor)}
              style={{ width: `${b.valor > 0 ? Math.max(2, (b.valor / maior) * 100) : 0}%` }}
            />
          </div>
        ))}
      </div>
      {estimativa > 0 ? <SeloDaDiferenca diferenca={diferenca} /> : null}
    </section>
  );
}

function SeloDaDiferenca({ diferenca, compacto = false }: { diferenca: number; compacto?: boolean }) {
  return (
    <p
      className={cn(
        'inline-flex items-center gap-1 rounded-pill font-semibold',
        compacto ? 'px-2 py-0.5 text-[0.6875rem]' : 'mt-3 px-2.5 py-1 text-xs',
        diferenca > 0 ? 'bg-success-400/15 text-success-400' : diferenca < 0 ? 'bg-danger-600/30 text-danger-200' : 'bg-white/10 text-white',
      )}
    >
      {diferenca > 0 ? <ArrowUpRight className="size-3.5" /> : diferenca < 0 ? <ArrowDownRight className="size-3.5" /> : <Minus className="size-3.5" />}
      {compacto
        ? diferenca > 0
          ? `+${formatNumber(diferenca)}`
          : formatNumber(diferenca)
        : diferenca > 0
          ? `${formatNumber(diferenca)} ${diferenca === 1 ? 'voto' : 'votos'} acima da estimativa`
          : diferenca < 0
            ? `${formatNumber(-diferenca)} ${diferenca === -1 ? 'voto' : 'votos'} abaixo da estimativa`
            : 'Exatamente a estimativa'}
    </p>
  );
}

/**
 * Varios candidatos: a estimativa do time de um lado e, do outro, cada
 * candidato com foto, votos, conversao e quanto ficou acima ou abaixo. As
 * barras embaixo, todas na mesma escala, contam a historia de uma vez.
 */
function PlacarComparado({ escola, candidatos }: { escola: EscolaNoComparativo; candidatos: CandidatoNoRaioX[] }) {
  const maior = Math.max(1, escola.estimativa, ...escola.apurado);
  return (
    <section
      aria-label="Estimativa e apuração de cada candidato"
      className="animate-fade-up overflow-hidden rounded-card bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700 p-4 text-white sm:p-5"
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <div className="md:border-r md:border-white/10 md:pr-4">
          <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wider text-white/60 uppercase">
            <span aria-hidden="true" className="size-2 rounded-sm bg-white/80" /> Estimativa do time
          </p>
          <p className="mt-1 text-5xl leading-none font-bold tabular-nums">
            <Contador valor={escola.estimativa} />
          </p>
          <p className="mt-1.5 text-xs text-white/60">pessoas cadastradas que votam aqui: a mesma conta para todos os candidatos</p>
        </div>
        <ul className={cn('grid gap-2', candidatos.length > 1 && 'sm:grid-cols-2')}>
          {candidatos.map((c, i) => {
            const votos = escola.apurado[i] ?? 0;
            const conv = pct(escola.estimativa, votos);
            return (
              <li
                key={c.rotulo}
                className="flex min-w-0 animate-fade-up items-center gap-3 rounded-control border border-white/10 bg-white/[0.06] p-2.5"
                style={{ animationDelay: `${80 + i * 70}ms`, borderLeft: `3px solid ${c.cor}` }}
              >
                <FotoDoCandidato cargo={c.cargo} sqcand={null} src={c.foto} nome={c.nome} tamanho="md" className="ring-2 ring-white/20" />
                <div className="min-w-0 flex-1">
                  <p className="wrap-break-word text-sm font-semibold">{c.nome}</p>
                  <p className="wrap-break-word text-[0.6875rem] text-white/55">{c.rotulo.split(' · ').slice(1).join(' · ') || c.rotulo}</p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-2xl leading-none font-bold tabular-nums">
                      <Contador valor={votos} />
                    </span>
                    <span className="text-[0.6875rem] text-white/60">votos</span>
                    {conv !== null ? (
                      <span className="text-xs font-bold tabular-nums" style={{ color: corDaConversao(conv) }}>
                        {Math.round(conv)}%
                      </span>
                    ) : null}
                    {escola.estimativa > 0 ? <SeloDaDiferenca diferenca={votos - escola.estimativa} compacto /> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 space-y-1.5">
        {[
          { rotulo: 'Estimativa', valor: escola.estimativa, cor: 'rgb(255 255 255 / 0.85)', candidato: undefined as CandidatoNoRaioX | undefined },
          ...candidatos.map((c, i) => ({ rotulo: c.nome, valor: escola.apurado[i] ?? 0, cor: c.cor, candidato: c })),
        ].map(
          (b) => (
            <div key={b.rotulo} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3rem] items-center gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <MarcaDaBarra candidato={b.candidato} className="ring-offset-navy-800" />
                <span className="wrap-break-word text-[0.6875rem] text-white/70">{b.rotulo}</span>
              </span>
              <span className="h-2.5 overflow-hidden rounded-pill bg-white/10">
                <span
                  className="block h-full rounded-pill transition-[width] duration-1000 ease-out"
                  style={{ width: `${b.valor > 0 ? Math.max(2, (b.valor / maior) * 100) : 0}%`, background: b.cor }}
                />
              </span>
              <span className="text-right text-xs font-semibold tabular-nums">{formatNumber(b.valor)}</span>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

/** A frase da escola com varios candidatos: quanto cada um teve da estimativa. */
function fraseComparada(e: EscolaNoComparativo, candidatos: CandidatoNoRaioX[]): string {
  const partes = candidatos.map((c, i) => {
    const conv = pct(e.estimativa, e.apurado[i] ?? 0);
    return `${c.nome} teve ${formatNumber(e.apurado[i] ?? 0)}${conv !== null ? ` (${Math.round(conv)}%)` : ''}`;
  });
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}` : partes[0];
  return e.estimativa > 0
    ? `${lista}, contra ${formatNumber(e.estimativa)} votos estimados pelo time nesta escola.`
    : `${lista}. O time não tinha estimativa aqui.`;
}

/** Os Lideres que cadastraram a estimativa da escola. Tocar um acende a parte dele nas secoes. */
function Lideres({
  escola,
  lideres,
  diretos,
  foco,
  onFoco,
  candidatos,
}: {
  escola: EscolaNoComparativo;
  lideres: LiderNoRaioX[];
  diretos: number;
  foco: string | null;
  onFoco: (id: string | null) => void;
  candidatos: CandidatoNoRaioX[];
}) {
  const maior = Math.max(1, ...lideres.map((l) => l.cadastrados));
  const escolhido = lideres.find((l) => l.id === foco) ?? null;
  // Votos de cada candidato nas secoes onde a gente do Lider escolhido vota.
  const secoesDoEscolhido = escolhido
    ? escola.secoes.filter((s) => (s.zona || s.secao) && (escolhido.porSecao[chaveDaSecao(s.zona, s.secao)] ?? 0) > 0)
    : [];
  const votosNasSecoesDele = candidatos.map((_, i) => secoesDoEscolhido.reduce((t, s) => t + (s.apurado[i] ?? 0), 0));
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
        <ol className="max-h-[32rem] divide-y divide-line overflow-y-auto">
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
                    <span className="block wrap-break-word text-sm font-semibold text-ink-900">{l.nome}</span>
                    {l.referencia !== undefined ? (
                      <span className="mt-0.5 block">
                        <SeloDaReferencia referencia={l.referencia} compacto />
                      </span>
                    ) : null}
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
            {secoesDele ? ` em ${formatNumber(secoesDele)} ${secoesDele === 1 ? 'seção' : 'seções'}` : ''}. Nessas seções,{' '}
            {candidatos.map((c, i) => (
              <span key={c.rotulo}>
                {i > 0 ? (i === candidatos.length - 1 ? ' e ' : ', ') : ''}
                {c.nome} teve <b style={{ color: candidatos.length > 1 ? c.cor : undefined }} className={candidatos.length > 1 ? undefined : 'text-gold-700'}>
                  {formatNumber(votosNasSecoesDele[i])}
                </b>
              </span>
            ))}{' '}
            {candidatos.length === 1 && votosNasSecoesDele[0] === 1 ? 'voto' : 'votos'}.
          </p>
        ) : lideres.length > 0 ? (
          <p>Toque em um líder para acender a gente dele na grade e nas seções.</p>
        ) : null}
      </footer>
    </section>
  );
}

/** Secao por secao: a estimativa (com a parte do Lider em foco) e o apurado de cada candidato. */
function Secoes({
  escola,
  candidatos,
  escolhido,
  lideres,
}: {
  escola: EscolaNoComparativo;
  candidatos: CandidatoNoRaioX[];
  escolhido: LiderNoRaioX | null;
  /** Os Lideres da escola: cada secao mostra, sozinha, quantos cada um cadastrou ali. */
  lideres: LiderNoRaioX[];
}) {
  const varios = candidatos.length > 1;
  const maior = Math.max(1, ...escola.secoes.map((s) => Math.max(s.estimativa, ...s.apurado)));
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
          {varios ? (
            candidatos.map((c) => (
              <span key={c.rotulo} className="flex items-center gap-1">
                <span aria-hidden="true" className="h-2 w-3 rounded-sm" style={{ background: c.cor }} /> {c.nome.split(' ')[0]}
              </span>
            ))
          ) : (
            <span className="flex items-center gap-1">
              <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-gold-400" /> apurado
            </span>
          )}
        </p>
      </header>

      <ol className="max-h-[32rem] divide-y divide-line overflow-y-auto">
        {escola.secoes.map((s, i) => {
          const comSecao = Boolean(s.zona || s.secao);
          const dele = escolhido ? (escolhido.porSecao[chaveDaSecao(s.zona, s.secao)] ?? 0) : 0;
          const apagada = escolhido !== null && dele === 0;
          // Ninguem do recorte (do time, do Lider, da referencia) vota aqui: a
          // secao fica cinza — so os votos dela, sem a gente da campanha.
          const semGente = comSecao && s.estimativa <= 0;
          const diferenca = (s.apurado[0] ?? 0) - s.estimativa;
          return (
            <li
              key={`${s.zona}/${s.secao}/${i}`}
              className={cn(
                'grid items-center gap-3 px-4 py-2.5 transition-[opacity,filter] duration-300',
                varios ? 'grid-cols-[5.5rem_minmax(0,1fr)]' : 'grid-cols-[5.5rem_minmax(0,1fr)_auto]',
                apagada && 'opacity-35',
                semGente && !apagada && 'bg-ink-50 opacity-60 grayscale hover:opacity-90',
              )}
              title={semGente ? 'Ninguém deste recorte vota nesta seção' : undefined}
            >
              <div className="min-w-0">
                {comSecao ? (
                  <>
                    <p className={cn('text-sm font-semibold tabular-nums', semGente ? 'text-ink-500' : 'text-ink-900')}>Seção {s.secao ?? '?'}</p>
                    <p className="text-[0.6875rem] text-ink-500">Zona {s.zona ?? '?'}</p>
                    {semGente ? (
                      <p className="mt-1 inline-flex rounded-pill bg-ink-200 px-1.5 py-0.5 text-[0.5625rem] font-semibold tracking-wide whitespace-nowrap text-ink-500 uppercase">
                        sem gente
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs leading-tight text-ink-500">Sem zona/seção no cadastro</p>
                )}
              </div>

              <div className="space-y-1">
                {/* Estimativa: com um Lider em foco, a parte dele em ouro escuro. */}
                <div className="flex items-center gap-2" title={`estimativa: ${formatNumber(s.estimativa)}`}>
                  <MarcaDaBarra />
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
                {candidatos.map((c, k) => (
                  <div key={c.rotulo} className="flex items-center gap-2" title={`${c.nome}: ${formatNumber(s.apurado[k] ?? 0)}`}>
                    <MarcaDaBarra candidato={{ ...c, cor: varios ? c.cor : '#e0a426' }} />
                    <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-ink-100">
                      <div
                        className={cn('h-full rounded-pill transition-[width] duration-700 ease-out', !varios && 'bg-gold-400')}
                        style={{ width: largura(s.apurado[k] ?? 0), background: varios ? c.cor : undefined }}
                      />
                    </div>
                    <span className={cn('w-12 text-right text-xs font-semibold tabular-nums', varios ? 'text-ink-900' : 'text-gold-700')}>
                      {formatNumber(s.apurado[k] ?? 0)}
                    </span>
                  </div>
                ))}
                {/* Quem cadastrou a gente desta secao, sem precisar tocar em nada. */}
                <LideresDaSecao lideres={lideres} chave={chaveDaSecao(s.zona, s.secao)} estimativa={s.estimativa} foco={escolhido?.id ?? null} />
              </div>

              {varios ? null : (
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
                        <SeloDaLeitura estimativa={s.estimativa} apurado={s.apurado[0] ?? 0} />
                      </span>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Os Lideres de uma secao, do que mais cadastrou ali para o que menos, cada um com a referencia. */
function LideresDaSecao({
  lideres,
  chave,
  estimativa,
  foco,
}: {
  lideres: LiderNoRaioX[];
  chave: string;
  estimativa: number;
  foco: string | null;
}) {
  const daSecao = lideres
    .map((l) => ({ l, n: l.porSecao[chave] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.l.nome.localeCompare(b.l.nome, 'pt-BR'));
  const semLider = Math.max(0, estimativa - daSecao.reduce((t, x) => t + x.n, 0));
  if (daSecao.length === 0 && semLider === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1 pt-1" aria-label="Quem cadastrou nesta seção">
      {daSecao.map(({ l, n }) => (
        <li
          key={l.id}
          className={cn(
            'inline-flex max-w-full items-center gap-1 rounded-pill border py-0.5 pr-1 pl-0.5 text-[0.6875rem] transition-colors',
            foco === l.id ? 'border-gold-500 bg-gold-50' : 'border-line bg-surface',
          )}
          title={`${l.nome}: ${n} ${n === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'} nesta seção`}
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[0.5625rem] font-bold text-gold-400">
            {initials(l.nome)}
          </span>
          <span className="min-w-0 font-semibold wrap-break-word text-ink-900">{l.nome}</span>
          <SeloDaReferencia referencia={l.referencia} compacto />
          <span className="rounded-pill bg-navy-900 px-1.5 text-[0.625rem] font-bold text-white tabular-nums">{n}</span>
        </li>
      ))}
      {semLider > 0 ? (
        <li className="inline-flex items-center gap-1 rounded-pill border border-dashed border-ink-200 px-2 py-0.5 text-[0.6875rem] text-ink-500">
          sem líder <b className="tabular-nums">{semLider}</b>
        </li>
      ) : null}
    </ul>
  );
}

/**
 * A grade "Lider x Secao": uma linha por Lider (com a referencia), uma
 * coluna por secao, e em cada celula quantas pessoas ele cadastrou ali —
 * quanto mais gente, mais escura. Embaixo, a estimativa e os votos de cada
 * candidato na mesma secao: bate o olho e ve de quem era a forca de cada
 * secao e quanto dela virou voto.
 */
function GradeLiderPorSecao({
  escola,
  lideres,
  diretos,
  candidatos,
  foco,
  onFoco,
}: {
  escola: EscolaNoComparativo;
  lideres: LiderNoRaioX[];
  diretos: number;
  candidatos: CandidatoNoRaioX[];
  foco: string | null;
  onFoco: (id: string | null) => void;
}) {
  const [aberta, setAberta] = useState(false);
  const secoes = escola.secoes.filter((s) => s.zona || s.secao);
  const semSecao = escola.secoes.find((s) => !s.zona && !s.secao) ?? null;
  const colunas = [...secoes, ...(semSecao ? [semSecao] : [])];
  if (colunas.length === 0 || lideres.length === 0) return null;

  const valor = (l: LiderNoRaioX, s: (typeof colunas)[number]) => l.porSecao[chaveDaSecao(s.zona, s.secao)] ?? 0;
  const maiorCelula = Math.max(1, ...lideres.flatMap((l) => colunas.map((s) => valor(l, s))));
  const semLiderNa = (s: (typeof colunas)[number]) => Math.max(0, s.estimativa - lideres.reduce((t, l) => t + valor(l, s), 0));
  const zonas = [...new Set(secoes.map((s) => s.zona).filter(Boolean))];

  /** A celula: a cor escurece com a quantidade (navy), e o ouro marca o Lider em foco. */
  const celula = (n: number, ativo: boolean): CSSProperties => {
    if (n <= 0) return {};
    const forca = 0.12 + 0.78 * (n / maiorCelula);
    return ativo
      ? { background: `rgba(224, 164, 38, ${forca})`, color: forca > 0.55 ? '#0f1e35' : '#7a5410' }
      : { background: `rgba(15, 30, 53, ${forca})`, color: forca > 0.5 ? '#ffffff' : '#0f1e35' };
  };

  return (
    <section aria-label="Pessoas de cada líder em cada seção" className="overflow-hidden rounded-card border border-line bg-surface">
      {/* Fechada por padrao: a barra inteira abre e fecha. */}
      <button
        type="button"
        onClick={() => setAberta((atual) => !atual)}
        aria-expanded={aberta}
        className={cn(
          'group flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3.5 text-left transition-colors hover:bg-accent-50/50',
          aberta && 'border-b border-line',
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-gold-400">
            <Grid3x3 aria-hidden="true" className="size-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink-900">Quem cadastrou em cada seção</span>
            <span className="block text-xs text-ink-500">
              {formatNumber(lideres.length)} {lideres.length === 1 ? 'líder' : 'líderes'} × {formatNumber(secoes.length)}{' '}
              {secoes.length === 1 ? 'seção' : 'seções'}
              {zonas.length ? ` · Zona ${zonas.join(', ')}` : ''}
              {aberta ? ' · quanto mais escuro, mais gente' : ''}
            </span>
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-accent-700 transition-colors group-hover:border-accent-600">
          {aberta ? 'Fechar' : 'Abrir a grade'}
          <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform duration-300', aberta && 'rotate-180')} />
        </span>
      </button>
      {aberta ? (
        <div className="animate-fade-in">
          <div className="scrollbar-slim overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 min-w-[15rem] border-b border-line bg-ink-50 px-4 py-2 text-left text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase">
                    Líder
                  </th>
                  {colunas.map((s) => (
                    <th
                      key={chaveDaSecao(s.zona, s.secao)}
                      scope="col"
                      className={cn('min-w-[4.5rem] border-b border-line bg-ink-50 px-2 py-2 text-center', s.estimativa <= 0 && 'opacity-45')}
                      title={s.estimativa <= 0 ? 'Ninguém deste recorte vota nesta seção' : undefined}
                    >
                      {s.zona || s.secao ? (
                        <>
                          <span className="block text-xs font-bold text-ink-900 tabular-nums">Seção {s.secao ?? '?'}</span>
                          <span className="block text-[0.625rem] text-ink-500">Zona {s.zona ?? '?'}</span>
                        </>
                      ) : (
                        <span className="block text-[0.625rem] leading-tight text-ink-500">sem seção</span>
                      )}
                    </th>
                  ))}
                  <th scope="col" className="min-w-[4.5rem] border-b border-line bg-ink-50 px-3 py-2 text-right text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {lideres.map((l) => {
                  const ativo = foco === l.id;
                  return (
                    <tr key={l.id} className={cn('group', foco && !ativo && 'opacity-45')}>
                      <th scope="row" className={cn('sticky left-0 z-10 border-b border-line px-4 py-2 text-left font-normal', ativo ? 'bg-gold-50' : 'bg-surface group-hover:bg-ink-50')}>
                        <button type="button" onClick={() => onFoco(ativo ? null : l.id)} aria-pressed={ativo} className="flex w-full min-w-0 items-center gap-2 text-left">
                          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold', ativo ? 'bg-gold-500 text-navy-900' : 'bg-navy-900 text-gold-400')}>
                            {initials(l.nome)}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold wrap-break-word text-ink-900">{l.nome}</span>
                            <SeloDaReferencia referencia={l.referencia} compacto />
                          </span>
                        </button>
                      </th>
                      {colunas.map((s) => {
                        const n = valor(l, s);
                        return (
                          <td key={chaveDaSecao(s.zona, s.secao)} className="border-b border-line p-1 text-center">
                            <span
                              className={cn(
                                'flex h-8 items-center justify-center rounded-md text-xs font-bold tabular-nums transition-colors',
                                n <= 0 && 'text-ink-200',
                              )}
                              style={celula(n, ativo)}
                              title={`${l.nome} · Seção ${s.secao ?? '?'}: ${n} ${n === 1 ? 'pessoa' : 'pessoas'}`}
                            >
                              {n > 0 ? formatNumber(n) : '·'}
                            </span>
                          </td>
                        );
                      })}
                      <td className="border-b border-line px-3 py-2 text-right text-sm font-bold text-navy-900 tabular-nums">{formatNumber(l.cadastrados)}</td>
                    </tr>
                  );
                })}
                {diretos > 0 ? (
                  <tr>
                    <th scope="row" className="sticky left-0 z-10 border-b border-line bg-surface px-4 py-2 text-left text-xs font-normal text-ink-500">
                      Sem líder registrado
                    </th>
                    {colunas.map((s) => (
                      <td key={chaveDaSecao(s.zona, s.secao)} className="border-b border-line p-1 text-center text-xs text-ink-500 tabular-nums">
                        {semLiderNa(s) || '·'}
                      </td>
                    ))}
                    <td className="border-b border-line px-3 py-2 text-right text-sm font-semibold text-ink-500 tabular-nums">{formatNumber(diretos)}</td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="sticky left-0 z-10 border-b border-line bg-ink-50 px-4 py-2 text-left text-xs font-semibold text-navy-900">
                    Estimativa do time
                  </th>
                  {colunas.map((s) => (
                    <td key={chaveDaSecao(s.zona, s.secao)} className="border-b border-line bg-ink-50 px-1 py-2 text-center text-sm font-bold text-navy-900 tabular-nums">
                      {formatNumber(s.estimativa)}
                    </td>
                  ))}
                  <td className="border-b border-line bg-ink-50 px-3 py-2 text-right text-sm font-bold text-navy-900 tabular-nums">{formatNumber(escola.estimativa)}</td>
                </tr>
                {candidatos.map((c, k) => (
                  <tr key={c.rotulo}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-line bg-surface px-4 py-2 text-left text-xs font-semibold text-ink-900">
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: candidatos.length > 1 ? c.cor : '#e0a426' }} />
                        <span className="wrap-break-word">Votos de {c.nome}</span>
                      </span>
                    </th>
                    {colunas.map((s) => {
                      const votos = s.apurado[k] ?? 0;
                      const abaixo = (s.zona || s.secao) && s.estimativa > 0 && votos < s.estimativa;
                      return (
                        <td
                          key={chaveDaSecao(s.zona, s.secao)}
                          className={cn(
                            'border-b border-line px-1 py-2 text-center text-sm font-bold tabular-nums',
                            abaixo ? 'text-danger-700' : s.estimativa <= 0 ? 'bg-ink-50 text-ink-400' : 'text-ink-900',
                          )}
                        >
                          {s.zona || s.secao ? formatNumber(votos) : '—'}
                        </td>
                      );
                    })}
                    <td className="border-b border-line px-3 py-2 text-right text-sm font-bold text-ink-900 tabular-nums">{formatNumber(escola.apurado[k] ?? 0)}</td>
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
          <p className="border-t border-line px-4 py-2 text-[0.6875rem] text-ink-500">
            Em vermelho, a seção onde o candidato teve menos votos do que o time estimava. Toque num líder para acender a gente dele.
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function RaioXDaEscola({
  escola,
  candidatos,
  lideres = [],
  diretos = 0,
  onClose,
  onVerPessoas,
  pdf,
}: {
  /** A escola com o apurado de cada candidato (um so: `comoComparativo`). */
  escola: EscolaNoComparativo;
  /** Um ou mais candidatos, na ordem do apurado. */
  candidatos: CandidatoNoRaioX[];
  /** Quem cadastrou a estimativa da escola, Lider a Lider. */
  lideres?: LiderNoRaioX[];
  /** O resto da estimativa: Lideres e cadastros sem Lider registrado. */
  diretos?: number;
  onClose: () => void;
  /** Abre a lista de quem vota aqui (pinos da campanha). */
  onVerPessoas?: () => void;
  /** O botao do relatorio do time (um candidato ou todos juntos). */
  pdf?: React.ReactNode;
}) {
  const [foco, setFoco] = useState<string | null>(null);
  const escolhido = lideres.find((l) => l.id === foco) ?? null;
  const onde = [escola.endereco, [escola.cidade, escola.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ');
  const varios = candidatos.length > 1;
  const um = candidatos[0];
  const baixar = () => baixarPdfDoRaioX({ escola, candidatos, lideres });

  // Tela inteira: a pagina de tras nao rola, e o Esc volta para o mapa.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', aoTeclar, true);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', aoTeclar, true);
    };
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Raio-X: ${escola.titulo}`} className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-canvas">
      {/* CABECALHO: voltar, a escola e o PDF. */}
      <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-[#1e3a8a] px-4 py-4 text-white sm:px-6">
        <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0" />
        <span aria-hidden="true" className="cmd-orbe pointer-events-none absolute -top-24 -right-10 size-72 rounded-full bg-gold-500/20 blur-3xl" />
        <div className="relative mx-auto flex max-w-[1600px] flex-wrap items-start gap-4">
          <BotaoVoltar onClick={onClose} rotulo="Mapa" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Os candidatos da escola, com a foto oficial, cada um na cor dele. */}
              <span className="flex -space-x-2">
                {candidatos.map((c) => (
                  <span
                    key={c.rotulo}
                    title={c.nome}
                    className="rounded-full ring-2 ring-offset-2 ring-offset-navy-900"
                    style={{ '--tw-ring-color': varios ? c.cor : '#f2c14e' } as CSSProperties}
                  >
                    <FotoDoCandidato cargo={c.cargo} sqcand={null} src={c.foto} nome={c.nome} tamanho="sm" />
                  </span>
                ))}
              </span>
              <p className="inline-flex max-w-full items-center gap-1.5 rounded-pill bg-white/10 px-2.5 py-1 text-[0.6875rem] font-semibold text-gold-400 ring-1 ring-white/15">
                <ScanSearch aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="wrap-break-word">Raio-X · {varios ? candidatos.map((c) => c.nome).join(' × ') : um?.rotulo}</span>
              </p>
            </div>
            <h2 className="mt-2 text-xl leading-tight font-bold wrap-break-word sm:text-2xl">{escola.titulo}</h2>
            {onde ? (
              <p className="mt-0.5 flex items-start gap-1.5 text-sm text-white/70">
                <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span className="wrap-break-word">{onde}</span>
              </p>
            ) : null}
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/70">
              <span>
                <b className="text-white tabular-nums">{formatNumber(lideres.length)}</b> {lideres.length === 1 ? 'líder' : 'líderes'}
              </span>
              <span>
                <b className="text-white tabular-nums">{formatNumber(escola.secoes.filter((x) => x.zona || x.secao).length)}</b> seções
              </span>
              <span>
                estimativa de <b className="text-white tabular-nums">{formatNumber(escola.estimativa)}</b>
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-center">
            <BotaoPdfDaEscola onBaixar={baixar} claro />
          </div>
        </div>
      </header>

      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1600px] space-y-4 px-4 py-5 sm:px-6">
          {varios ? (
            <PlacarComparado escola={escola} candidatos={candidatos} />
          ) : (
            <Placar estimativa={escola.estimativa} apurado={escola.apurado[0] ?? 0} candidato={um?.nome ?? ''} foto={um?.foto} cargo={um?.cargo} />
          )}

          <p className="rounded-control border-l-4 border-gold-500 bg-gold-50 px-3 py-2 text-sm text-ink-900">
            {varios
              ? fraseComparada(escola, candidatos)
              : fraseDaEscola({ estimativa: escola.estimativa, apurado: escola.apurado[0] ?? 0 }, um?.nome ?? '')}
          </p>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Lideres escola={escola} lideres={lideres} diretos={diretos} foco={foco} onFoco={setFoco} candidatos={candidatos} />
            <Secoes escola={escola} candidatos={candidatos} escolhido={escolhido} lideres={lideres} />
          </div>

          {/* Por ultimo, e fechada: abre no clique. */}
          <GradeLiderPorSecao escola={escola} lideres={lideres} diretos={diretos} candidatos={candidatos} foco={foco} onFoco={setFoco} />

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
            {pdf}
            <BotaoPdfDaEscola onBaixar={baixar} compacto />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * "Baixar PDF desta escola": o mesmo Raio-X que esta aberto, em PDF. Mostra
 * que esta gerando (fotos e paginas levam um instante) e confirma ao fim.
 */
function BotaoPdfDaEscola({ onBaixar, compacto = false, claro = false }: { onBaixar: () => Promise<void>; compacto?: boolean; claro?: boolean }) {
  const [estado, setEstado] = useState<'parado' | 'gerando' | 'pronto' | 'erro'>('parado');
  async function clicar() {
    if (estado === 'gerando') return;
    setEstado('gerando');
    try {
      await onBaixar();
      setEstado('pronto');
      window.setTimeout(() => setEstado('parado'), 2500);
    } catch {
      setEstado('erro');
      window.setTimeout(() => setEstado('parado'), 3500);
    }
  }
  return (
    <button
      type="button"
      onClick={clicar}
      disabled={estado === 'gerando'}
      aria-live="polite"
      className={cn(
        'group inline-flex items-center gap-2 rounded-pill font-semibold transition-all duration-200 disabled:cursor-wait',
        compacto ? 'min-h-9 px-3 text-xs' : 'min-h-10 px-4 text-sm shadow-[0_10px_22px_-12px_rgba(15,30,53,0.8)] hover:-translate-y-0.5',
        estado === 'pronto'
          ? 'bg-success-600 text-white'
          : estado === 'erro'
            ? 'bg-danger-600 text-white'
            : claro
              ? 'bg-gradient-to-r from-gold-400 to-gold-500 text-navy-900 hover:shadow-[0_14px_28px_-10px_rgba(242,193,78,0.9)]'
              : 'bg-navy-900 text-gold-400 hover:bg-navy-800',
      )}
    >
      {estado === 'gerando' ? (
        <Spinner className="size-4" />
      ) : estado === 'pronto' ? (
        <Check aria-hidden="true" className="cmd-chip-entra size-4" strokeWidth={3} />
      ) : (
        <FileDown aria-hidden="true" className="size-4 transition-transform group-hover:translate-y-0.5" />
      )}
      {estado === 'gerando'
        ? 'Gerando o PDF…'
        : estado === 'pronto'
          ? 'PDF baixado'
          : estado === 'erro'
            ? 'Não deu: tente de novo'
            : 'Baixar PDF desta escola'}
    </button>
  );
}
