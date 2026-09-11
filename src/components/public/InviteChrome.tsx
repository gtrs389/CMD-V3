/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { appConfig } from '@/config/app.config';
import type { PublicInviteOwner } from '@/lib/types';
import { cn } from '@/lib/utils/cn';
import { initials } from '@/lib/utils/text';
import type { InviteStep } from './invite-steps';

/**
 * Moldura da pagina publica de cadastro. Sem cabecalho de marca: a
 * identidade da tela vem so do cartao azul-marinho.
 *
 * Desktop: coluna azul-marinho fixa a esquerda (quem convidou e as etapas
 * verticais) e o formulario a direita, com rolagem propria.
 * Celular: cartao azul-marinho horizontal no topo, progresso em cartao
 * proprio e formulario em uma coluna, tudo rolando junto.
 */

function OwnerAvatar({
  owner,
  fallbackName,
  className,
}: {
  owner: PublicInviteOwner | null;
  fallbackName: string;
  className: string;
}) {
  const name = owner?.name ?? fallbackName;
  const photo = owner?.photoUrl ?? null;

  if (photo) {
    return (
      <img
        src={photo}
        alt={`Foto de ${name}`}
        className={cn('shrink-0 rounded-full border-2 border-navy-600 object-cover', className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border-2 border-navy-600 bg-navy-700 font-semibold text-white',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

interface OwnerProps {
  owner: PublicInviteOwner | null;
  /** Nome da operacao, usado quando o convite nao tem dono registrado. */
  fallbackName: string;
  className?: string;
}

/** Cartao azul-marinho horizontal do celular. */
export function InviteOwnerBanner({ owner, fallbackName, className }: OwnerProps) {
  const name = owner?.name ?? fallbackName;

  return (
    <section
      aria-label="Quem enviou o convite"
      className={cn('rounded-card bg-navy-900 p-3.5 shadow-overlay', className)}
    >
      <div className="flex items-center gap-3">
        <OwnerAvatar owner={owner} fallbackName={fallbackName} className="size-14" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.625rem] font-semibold tracking-[0.12em] text-navy-300 uppercase">
            Convite de {name}
          </p>
          <p className="mt-1 text-[0.9375rem] leading-snug font-bold text-white">
            Faça parte desta mobilização.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Cartao azul-marinho lateral do desktop, com as etapas verticais.
 *
 * Fixo em toda a altura da tela: quem preenche o formulario nunca perde de
 * vista quem convidou nem em que etapa esta. Apenas a coluna do formulario,
 * ao lado, tem rolagem propria.
 */
export function InviteOwnerAside({
  owner,
  fallbackName,
  className,
  steps,
  current,
}: OwnerProps & { steps: InviteStep[]; current: number }) {
  const name = owner?.name ?? fallbackName;

  return (
    <aside className={cn('flex-col gap-8 bg-navy-900 p-8 lg:p-10', className)}>
      <div>
        <p className="text-[0.625rem] font-semibold tracking-[0.14em] text-navy-300 uppercase">
          Convite de mobilização
        </p>
        <p className="mt-4 text-sm text-navy-200">Você foi convidado(a) por</p>

        <div className="mt-3">
          <OwnerAvatar owner={owner} fallbackName={fallbackName} className="size-20" />
        </div>

        <h2 className="mt-3 text-xl leading-tight font-bold tracking-tight break-words text-white">
          {name}
        </h2>

        <p className="mt-3 text-[0.8125rem] leading-relaxed text-navy-300">
          Faça parte desta mobilização e ajude a construir uma equipe mais próxima das pessoas.
        </p>
      </div>

      <InviteStepTrail steps={steps} current={current} />
    </aside>
  );
}

/** Etapas verticais do cartao lateral. */
function InviteStepTrail({ steps, current }: { steps: InviteStep[]; current: number }) {
  return (
    <nav aria-label="Etapas do cadastro">
      <ol className="space-y-1">
        {steps.map((step, index) => {
          const active = index === current;
          const done = index < current;

          return (
            <li key={step.id}>
              <div
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-control px-2.5 py-2',
                  active && 'bg-navy-700',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    active
                      ? 'bg-accent-600 text-white'
                      : done
                        ? 'bg-emerald-500 text-white'
                        : 'bg-navy-700 text-navy-300',
                  )}
                >
                  {done ? <Check className="size-3.5" /> : index + 1}
                </span>

                <span
                  className={cn(
                    'min-w-0 text-[0.8125rem] leading-tight',
                    active ? 'font-semibold text-white' : 'text-navy-300',
                  )}
                >
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** "ETAPA X DE N" + percentual + barra. */
export function InviteProgress({
  steps,
  current,
  className,
}: {
  steps: InviteStep[];
  current: number;
  className?: string;
}) {
  const total = steps.length;
  const percent = Math.round(((current + 1) / total) * 100);

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.625rem] font-bold tracking-[0.12em] text-ink-500 uppercase sm:text-[0.6875rem]">
          Etapa {current + 1} de {total}
        </p>
        <p className="text-[0.6875rem] font-medium text-ink-500 sm:text-xs">
          {percent}% concluído
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`Cadastro ${percent}% concluído`}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-ink-100"
      >
        <span
          className="block h-full rounded-pill bg-accent-600 transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** Pastilhas horizontais das etapas, no celular. */
export function InviteStepChips({ steps, current }: { steps: InviteStep[]; current: number }) {
  return (
    <nav aria-label="Etapas do cadastro" className="mt-3">
      <ol className="scrollbar-slim -mx-1 flex items-center justify-between gap-1 overflow-x-auto px-1 pb-0.5">
        {steps.map((step, index) => {
          const active = index === current;
          const done = index < current;

          return (
            <li key={step.id} className="min-w-0 shrink-0">
              <div
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-1 rounded-pill py-1',
                  active ? 'bg-accent-50 px-1.5' : 'bg-transparent',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-[1.125rem] shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold',
                    active
                      ? 'bg-accent-600 text-white'
                      : done
                        ? 'bg-success-600 text-white'
                        : 'bg-ink-100 text-ink-500',
                  )}
                >
                  {done ? <Check className="size-2.5" /> : index + 1}
                </span>
                <span
                  className={cn(
                    'text-[0.625rem] whitespace-nowrap',
                    active ? 'font-semibold text-accent-700' : 'text-ink-500',
                  )}
                >
                  {step.shortLabel}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Moldura das telas de estado (carregando, erro, convite indisponivel e
 * cadastro enviado): um cartao centralizado, sem cabecalho — mesmo
 * tratamento da tela do formulario, para nao piscar uma faixa que some
 * assim que o convite carrega.
 */
export function InviteStateShell({ children }: { children: ReactNode }) {
  return (
    <main className="safe-x safe-top flex min-h-dvh flex-col bg-surface-muted">
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md animate-rise rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
          {children}
        </div>
      </div>

      <p className="pb-6 text-center text-xs text-ink-400">{appConfig.shortName}</p>
    </main>
  );
}
