'use client';

import { ArrowDownRight, ArrowUpRight, Minus, Users } from 'lucide-react';
import { conversao, leitura, type EscolaNoConfronto, type LeituraDoConfronto } from '@/lib/domain/confronto';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';
import { Modal } from '@/components/ui/Modal';
import { Contador } from '@/components/ui/Contador';
import { BotaoDePdf } from '../BotaoDePdf';

/**
 * Raio-X da escola: o que o time esperava ali (estimativa da campanha: uma
 * pessoa cadastrada que vota na escola, um voto) e o que o candidato teve
 * (votos apurados pelo TSE) — escola, zona e secao.
 *
 * Duas cores fixas, com nome escrito do lado (nunca so a cor): azul-marinho
 * e a estimativa, ouro e a apuracao.
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

/** Medidor da conversao: meia-lua, cheia em 100%, com o excesso em verde. */
function Medidor({ valor }: { valor: number | null }) {
  const pct = valor ?? 0;
  const cheio = Math.min(100, pct);
  const raio = 46;
  const arco = Math.PI * raio;
  const cor = valor === null ? '#94a3b8' : pct >= 100 ? '#166534' : pct >= 80 ? '#b7801a' : '#b42318';
  return (
    <div className="relative mx-auto h-[4.75rem] w-40" role="img" aria-label={valor === null ? 'Sem estimativa' : `Conversão de ${Math.round(pct)}%`}>
      <svg viewBox="0 0 110 60" className="size-full">
        <path d="M9 55 A46 46 0 0 1 101 55" fill="none" stroke="#e7ecf1" strokeWidth="10" strokeLinecap="round" />
        <path
          d="M9 55 A46 46 0 0 1 101 55"
          fill="none"
          stroke={cor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={arco}
          strokeDashoffset={arco * (1 - cheio / 100)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="text-2xl leading-none font-bold text-ink-900 tabular-nums">
          {valor === null ? '—' : <Contador valor={Math.round(pct)} formatar={(n) => `${n}%`} />}
        </p>
      </div>
    </div>
  );
}

export function RaioXDaEscola({
  escola,
  candidato,
  onClose,
  onVerPessoas,
  onPdf,
}: {
  escola: EscolaNoConfronto;
  /** "Fulano (15123) · Deputado Estadual". */
  candidato: { nome: string; rotulo: string };
  onClose: () => void;
  /** Abre a lista de quem vota aqui (pinos da campanha). */
  onVerPessoas?: () => void;
  /** Baixa o relatorio de estimativa x apuracao do time. */
  onPdf?: () => Promise<void>;
}) {
  const c = conversao(escola);
  const maior = Math.max(1, ...escola.secoes.map((s) => Math.max(s.estimativa, s.apurado)));
  const secoesComNumero = escola.secoes.filter((s) => s.zona || s.secao);
  const zonas = [...new Set(secoesComNumero.map((s) => s.zona).filter(Boolean))];

  return (
    <Modal open onClose={onClose} size="lg" title={escola.titulo} description={[escola.endereco, [escola.cidade, escola.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ') || undefined}>
      <div className="space-y-4">
        {/* Quem e o candidato da comparacao. */}
        <p className="inline-flex items-center gap-2 rounded-pill bg-navy-900 px-3 py-1 text-xs font-semibold text-gold-400">
          ★ Raio-X · {candidato.rotulo}
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="rounded-card border border-navy-200 bg-gradient-to-br from-surface to-brand-50 p-4">
            <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-navy-800" /> Estimativa do time
            </p>
            <p className="mt-1 text-3xl font-bold text-navy-900 tabular-nums">
              <Contador valor={escola.estimativa} />
            </p>
            <p className="text-xs text-ink-500">cadastrados que votam aqui</p>
          </div>
          <div className="rounded-card border border-gold-500/40 bg-gradient-to-br from-surface to-gold-50 p-4">
            <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-gold-500" /> Apurado
            </p>
            <p className="mt-1 text-3xl font-bold text-ink-900 tabular-nums">
              <Contador valor={escola.apurado} />
            </p>
            <p className="truncate text-xs text-ink-500">votos de {candidato.nome} (TSE)</p>
          </div>
          <div className="col-span-2 flex flex-col items-center justify-center rounded-card border border-line bg-surface px-4 py-3 sm:col-span-1">
            <Medidor valor={c} />
            <p className="mt-1 text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase">conversão</p>
          </div>
        </div>

        <p className="rounded-control border-l-4 border-gold-500 bg-gold-50 px-3 py-2 text-sm text-ink-900">
          {fraseDaEscola(escola, candidato.nome)}
        </p>

        <section aria-label="Seções desta escola">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink-900">
              {zonas.length ? `Zona ${zonas.join(', ')} · ` : ''}
              {secoesComNumero.length} {secoesComNumero.length === 1 ? 'seção' : 'seções'}
            </h3>
            <p className="flex items-center gap-3 text-[0.6875rem] text-ink-500">
              <span className="flex items-center gap-1">
                <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-navy-800" /> estimativa
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-gold-500" /> apurado
              </span>
            </p>
          </div>

          <ol className="max-h-[42vh] divide-y divide-line overflow-y-auto rounded-card border border-line">
            {escola.secoes.map((s, i) => (
              <li key={`${s.zona}/${s.secao}/${i}`} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 sm:grid-cols-[7.5rem_minmax(0,1fr)_9.5rem]">
                <div>
                  {s.zona || s.secao ? (
                    <>
                      <p className="text-sm font-semibold text-ink-900 tabular-nums">Seção {s.secao ?? '?'}</p>
                      <p className="text-[0.6875rem] text-ink-500">Zona {s.zona ?? '?'}</p>
                    </>
                  ) : (
                    <p className="text-xs text-ink-500">Sem zona/seção no cadastro</p>
                  )}
                </div>
                <div className="space-y-1">
                  {[
                    { valor: s.estimativa, cor: 'bg-navy-800', rotulo: 'estimativa' },
                    { valor: s.apurado, cor: 'bg-gold-500', rotulo: 'apurado' },
                  ].map((b) => (
                    <div key={b.rotulo} className="flex items-center gap-2" title={`${b.rotulo}: ${formatNumber(b.valor)}`}>
                      <div className="h-2 flex-1 overflow-hidden rounded-pill bg-ink-100">
                        <div
                          className={cn('h-full rounded-pill transition-[width] duration-700 ease-out', b.cor)}
                          style={{ width: `${b.valor > 0 ? Math.max(3, (b.valor / maior) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-xs font-semibold text-ink-900 tabular-nums">{formatNumber(b.valor)}</span>
                    </div>
                  ))}
                </div>
                <div className="hidden justify-end sm:flex">
                  {/* Sem secao no cadastro, nao ha apuracao para comparar. */}
                  {s.zona || s.secao ? (
                    <SeloDaLeitura estimativa={s.estimativa} apurado={s.apurado} />
                  ) : (
                    <span className="text-[0.6875rem] text-ink-500">sem seção para comparar</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
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
