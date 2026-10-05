'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Clock, FileSpreadsheet, Gauge, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';

/** Uma pessoa que acabou de passar: gravada ou recusada. */
export interface ResultadoRecente {
  id: string;
  nome: string;
  ok: boolean;
}

interface ImportLaunchStageProps {
  total: number;
  /** Quantas ja passaram (gravadas + com falha). */
  feitas: number;
  gravadas: number;
  falhas: number;
  /** Quem esta sendo gravado agora. Nulo entre uma e outra, e no fim. */
  atual: { id: string; nome: string } | null;
  /** As ultimas que passaram, a mais nova primeiro. */
  recentes: ResultadoRecente[];
  /** Instante (ms) em que o lote comecou. */
  inicio: number;
  /** Instante (ms) em que o lote terminou. Nulo enquanto grava. */
  fim: number | null;
  /** Volta para a lista, para ver as linhas (e as que falharam). */
  onVerLista: () => void;
}

/** "42 s", "3 min 05 s", "1 h 02 min". */
export function formatarDuracao(ms: number): string {
  const segundos = Math.max(0, Math.round(ms / 1000));
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos} min ${String(segundos % 60).padStart(2, '0')} s`;
  return `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, '0')} min`;
}

/**
 * Tempo que falta, pela media do que ja passou. Antes de a terceira pessoa
 * passar a media ainda nao diz nada, e a tela mostra "calculando".
 */
export function tempoRestante(decorrido: number, feitas: number, total: number): number | null {
  if (feitas < 3 || feitas >= total) return null;
  return (decorrido / feitas) * (total - feitas);
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}

/** Confete deterministico: mesma explosao em toda renderizacao, sem `Math.random`. */
const CONFETE = Array.from({ length: 30 }, (_, i) => {
  const cores = [
    'var(--color-accent-400)',
    'var(--color-success-400)',
    'var(--color-navy-200)',
    'var(--color-warning-50)',
    'var(--color-accent-100)',
  ];
  return {
    angulo: `${(i * 360) / 30 + ((i * 37) % 11)}deg`,
    distancia: `${90 + ((i * 53) % 70)}px`,
    giro: `${(i % 2 === 0 ? 1 : -1) * (180 + ((i * 97) % 360))}deg`,
    atraso: `${(i * 23) % 160}ms`,
    cor: cores[i % cores.length],
    largura: i % 3 === 0 ? 10 : 6,
    altura: i % 3 === 0 ? 4 : 8,
  };
});

const RAIO = 62;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

/**
 * A tela da planilha subindo.
 *
 * O que ela conta, de relance: quantas ja entraram, quem esta entrando
 * AGORA, quanto falta, e se alguma deu errado. O movimento mostra o que
 * esta acontecendo de verdade — cada pessoa sai da planilha e cai no anel
 * no instante em que o servidor a grava; nao e um enfeite girando sozinho.
 *
 * No fim o anel fecha, o confete explode e fica o resumo, com o caminho de
 * volta para a lista (onde as linhas que falharam continuam, com o motivo).
 */
export function ImportLaunchStage({
  total,
  feitas,
  gravadas,
  falhas,
  atual,
  recentes,
  inicio,
  fim,
  onVerLista,
}: ImportLaunchStageProps) {
  const terminou = fim !== null;

  // Relogio da tela: so anda enquanto grava. Parado, vale o instante do fim.
  const [agora, setAgora] = useState(inicio);
  useEffect(() => {
    if (terminou) return;
    const relogio = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(relogio);
  }, [terminou]);

  const decorrido = (fim ?? agora) - inicio;
  const falta = tempoRestante(decorrido, feitas, total);
  const porMinuto = decorrido > 5000 && feitas > 0 ? Math.round((feitas / decorrido) * 60_000) : null;

  const fracao = total > 0 ? Math.min(1, feitas / total) : 0;
  const porcento = Math.round(fracao * 100);
  const deslocamento = CIRCUNFERENCIA * (1 - fracao);

  const tudoCerto = terminou && falhas === 0;

  return (
    <section
      aria-label="Cadastro da planilha"
      className="relative isolate overflow-hidden rounded-card bg-navy-900 px-4 pt-6 pb-5 text-white shadow-overlay sm:px-6"
    >
      {/* Fundo: grade fina e um brilho que respira atras do anel. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-navy-200) 1px, transparent 1px), linear-gradient(90deg, var(--color-navy-200) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />
      <div
        aria-hidden="true"
        className={cn(
          'planilha-respiro pointer-events-none absolute top-[38%] left-1/2 -z-10 size-72 rounded-full blur-3xl',
          tudoCerto ? 'bg-success-400/25' : 'bg-accent-500/30',
        )}
      />

      {/* Palco: a planilha a esquerda, o anel a direita, e a pessoa voando
          de um para o outro. Largura fixa para o voo cair sempre no anel. */}
      <div className="relative mx-auto flex h-40 w-[264px] items-center justify-between">
        {/* A planilha */}
        <div
          aria-hidden="true"
          className={cn(
            'relative h-28 w-[76px] shrink-0 overflow-hidden rounded-lg border border-navy-300/40 bg-navy-800 shadow-raised transition-opacity duration-500',
            terminou && 'opacity-40',
          )}
        >
          <div className="flex h-5 items-center gap-1 bg-accent-600/80 px-1.5">
            <FileSpreadsheet className="size-3 text-white" />
            <span className="h-1 flex-1 rounded-full bg-white/60" />
          </div>
          <div className="space-y-[7px] px-1.5 pt-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex gap-1">
                <span className="h-1 w-3 rounded-full bg-navy-300/60" />
                <span className="h-1 flex-1 rounded-full bg-navy-300/35" />
              </div>
            ))}
          </div>
          {!terminou ? (
            <span
              className="planilha-leitura absolute inset-x-0 top-6 h-3 bg-gradient-to-b from-transparent via-accent-400/50 to-transparent"
              style={{ '--leitura-curso': '76px' } as CSSProperties}
            />
          ) : null}
        </div>

        {/* A pessoa que esta sendo gravada, voando para o anel. A `key` faz
            o voo recomecar a cada pessoa. */}
        {atual ? (
          <span
            key={atual.id}
            aria-hidden="true"
            className="planilha-voo absolute top-1/2 left-5 -mt-4 flex size-8 items-center justify-center rounded-full bg-white text-[0.625rem] font-bold text-navy-900 shadow-overlay ring-2 ring-accent-400"
            // Do centro da bolinha (20px + 16px) ao centro do anel (264px - 80px).
            style={{ '--voo-distancia': '148px' } as CSSProperties}
          >
            {iniciais(atual.nome)}
          </span>
        ) : null}

        {/* O anel */}
        <div className="relative size-40 shrink-0">
          {/* Pontos em orbita, cada um no proprio compasso. */}
          {!terminou
            ? [
                { duracao: '5s', tamanho: 'size-1.5', cor: 'bg-accent-400' },
                { duracao: '8s', tamanho: 'size-1', cor: 'bg-navy-200' },
                { duracao: '11s', tamanho: 'size-2', cor: 'bg-success-400/80' },
              ].map((ponto, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="planilha-orbita absolute inset-0"
                  style={
                    {
                      '--orbita-duracao': ponto.duracao,
                      animationDirection: i === 1 ? 'reverse' : 'normal',
                    } as CSSProperties
                  }
                >
                  <span
                    className={cn('absolute top-0 left-1/2 -translate-x-1/2 rounded-full', ponto.tamanho, ponto.cor)}
                  />
                </span>
              ))
            : null}

          {/* Onda de chegada: uma por pessoa gravada. */}
          {recentes[0] && !terminou ? (
            <span
              key={`onda-${recentes[0].id}`}
              aria-hidden="true"
              className={cn(
                'planilha-chegada absolute inset-3 rounded-full border-2',
                recentes[0].ok ? 'border-success-400' : 'border-danger-200',
              )}
            />
          ) : null}

          <svg viewBox="0 0 160 160" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <defs>
              <linearGradient id="planilha-anel" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--color-accent-400)' }} />
                <stop offset="100%" style={{ stopColor: 'var(--color-success-400)' }} />
              </linearGradient>
            </defs>
            <circle cx="80" cy="80" r={RAIO} fill="none" strokeWidth="10" className="stroke-navy-700" />
            <circle
              cx="80"
              cy="80"
              r={RAIO}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              stroke={tudoCerto ? 'var(--color-success-400)' : 'url(#planilha-anel)'}
              strokeDasharray={CIRCUNFERENCIA}
              strokeDashoffset={deslocamento}
              style={{ transition: 'stroke-dashoffset 500ms cubic-bezier(0.22, 1, 0.36, 1), stroke 400ms' }}
            />
          </svg>

          {/* Miolo do anel: o numero, ou o check do fim. */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            {terminou ? (
              <span
                className={cn(
                  'animate-pop flex size-16 items-center justify-center rounded-full shadow-overlay',
                  tudoCerto ? 'bg-success-400 text-navy-900' : 'bg-accent-400 text-navy-900',
                )}
              >
                <Check aria-hidden="true" className="size-9" strokeWidth={3} />
              </span>
            ) : (
              <>
                <span
                  key={feitas}
                  className="planilha-batida text-[2.125rem] leading-none font-bold tracking-tight tabular-nums"
                >
                  {feitas}
                </span>
                <span className="mt-1 text-[0.6875rem] font-medium text-navy-200 tabular-nums">
                  de {total} · {porcento}%
                </span>
              </>
            )}
          </div>

          {/* Confete: so no fim. */}
          {terminou ? (
            <div aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2">
              {CONFETE.map((pedaco, i) => (
                <span
                  key={i}
                  className="planilha-confete absolute rounded-[2px]"
                  style={
                    {
                      width: pedaco.largura,
                      height: pedaco.altura,
                      marginLeft: -pedaco.largura / 2,
                      marginTop: -pedaco.altura / 2,
                      background: pedaco.cor,
                      '--confete-angulo': pedaco.angulo,
                      '--confete-distancia': pedaco.distancia,
                      '--confete-giro': pedaco.giro,
                      '--confete-atraso': pedaco.atraso,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Manchete: quem esta entrando agora, ou o resultado. */}
      <div role="status" aria-live="polite" className="mt-4 min-h-14 text-center">
        {terminou ? (
          <div className="animate-fade-up">
            <p className="text-lg font-bold tracking-tight sm:text-xl">
              {gravadas === 0
                ? 'Ninguém foi cadastrado'
                : `${gravadas} ${gravadas === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'}!`}
            </p>
            <p className="mt-1 text-[0.8125rem] text-navy-200">
              {falhas > 0
                ? `${falhas} ${falhas === 1 ? 'linha ficou' : 'linhas ficaram'} de fora — o motivo está na lista.`
                : 'Todas as linhas entraram.'}{' '}
              Em {formatarDuracao(decorrido)}.
            </p>
          </div>
        ) : (
          <>
            <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-navy-300 uppercase">
              Cadastrando agora
            </p>
            <p
              key={atual?.id ?? 'aguardando'}
              className="animate-fade-up mx-auto mt-1 flex max-w-full items-center justify-center gap-2 text-base font-semibold sm:text-lg"
            >
              <UserRound aria-hidden="true" className="size-4 shrink-0 text-accent-400" />
              <span className="wrap-break-word">{atual?.nome ?? 'Preparando…'}</span>
            </p>
          </>
        )}
      </div>

      {/* Numeros do lote. */}
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-control bg-white/5 px-2 py-2.5 ring-1 ring-white/10">
          <dt className="flex items-center justify-center gap-1 text-[0.6875rem] text-navy-200">
            <Check aria-hidden="true" className="size-3 text-success-400" />
            Cadastradas
          </dt>
          <dd className="mt-0.5 text-lg font-bold text-success-400 tabular-nums">{gravadas}</dd>
        </div>
        <div className="rounded-control bg-white/5 px-2 py-2.5 ring-1 ring-white/10">
          <dt className="flex items-center justify-center gap-1 text-[0.6875rem] text-navy-200">
            <X aria-hidden="true" className="size-3 text-danger-200" />
            Com falha
          </dt>
          <dd
            className={cn(
              'mt-0.5 text-lg font-bold tabular-nums',
              falhas > 0 ? 'text-danger-200' : 'text-navy-300',
            )}
          >
            {falhas}
          </dd>
        </div>
        <div className="rounded-control bg-white/5 px-2 py-2.5 ring-1 ring-white/10">
          <dt className="flex items-center justify-center gap-1 text-[0.6875rem] text-navy-200">
            {terminou ? (
              <Gauge aria-hidden="true" className="size-3 text-accent-400" />
            ) : (
              <Clock aria-hidden="true" className="size-3 text-accent-400" />
            )}
            {terminou ? 'Ritmo' : 'Falta'}
          </dt>
          <dd className="mt-0.5 wrap-break-word text-lg font-bold text-white tabular-nums">
            {terminou
              ? porMinuto !== null
                ? `${porMinuto}/min`
                : '—'
              : falta !== null
                ? `~${formatarDuracao(falta)}`
                : 'calculando'}
          </dd>
        </div>
      </dl>

      {/* As ultimas que passaram. */}
      {recentes.length > 0 ? (
        <ul className="mt-4 space-y-1.5" aria-label="Últimas pessoas processadas">
          {recentes.slice(0, 4).map((item, i) => (
            <li
              key={item.id}
              className={cn(
                'animate-fade-up flex items-center gap-2 rounded-control px-3 py-1.5 text-[0.8125rem] transition-opacity',
                item.ok ? 'bg-success-400/10' : 'bg-danger-600/25',
              )}
              style={{ opacity: 1 - i * 0.2 }}
            >
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full',
                  item.ok ? 'bg-success-400 text-navy-900' : 'bg-danger-200 text-danger-700',
                )}
              >
                {item.ok ? (
                  <Check aria-hidden="true" className="size-3" strokeWidth={3} />
                ) : (
                  <X aria-hidden="true" className="size-3" strokeWidth={3} />
                )}
              </span>
              <span className="min-w-0 flex-1 wrap-break-word">{item.nome}</span>
              <span className={cn('shrink-0 text-[0.6875rem]', item.ok ? 'text-success-400' : 'text-danger-200')}>
                {item.ok ? 'cadastrada' : 'falhou'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {terminou ? (
        <div className="animate-fade-up mt-5 flex justify-center">
          <Button variant="secondary" onClick={onVerLista}>
            {falhas > 0 ? 'Ver as que falharam' : 'Ver a lista'}
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-center text-[0.75rem] text-navy-300">
          Deixe esta tela aberta até terminar. Quem já entrou fica salvo.
        </p>
      )}
    </section>
  );
}
