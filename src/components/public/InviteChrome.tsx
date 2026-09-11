/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { appConfig } from '@/config/app.config';
import type { PublicInviteOwner } from '@/lib/types';
import { cn } from '@/lib/utils/cn';
import { initials } from '@/lib/utils/text';
import type { InviteStep } from './invite-steps';

/**
 * Moldura da pagina publica de cadastro.
 *
 * Desktop: cabecalho da marca, cartao azul-marinho a esquerda (quem convidou
 * e as etapas verticais) e o cartao branco do formulario a direita.
 * Celular: cabecalho compacto, cartao azul-marinho horizontal, progresso em
 * cartao proprio e formulario em uma coluna.
 */

const OWNER_ROLE_LABELS: Record<PublicInviteOwner['role'], string> = {
  CANDIDATE: 'Candidato(a)',
  EQUIPE: 'Equipe',
};

const PROTECTION_NOTICE = 'Seus dados são protegidos e usados somente nesta operação.';

/** Cabecalho: marca a esquerda, selo de ambiente seguro a direita. */
export function InviteBrandBar() {
  return (
    <header className="safe-top border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-[76rem] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:py-4">
        <span className="flex min-w-0 items-center gap-2.5">
          {appConfig.logo.kind === 'image' ? (
            <img
              src={appConfig.logo.src}
              alt=""
              aria-hidden="true"
              className="size-8 shrink-0 rounded-control object-contain lg:size-9"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-control bg-brand-700 text-xs font-semibold text-white lg:size-9"
            >
              {appConfig.logo.monogram}
            </span>
          )}

          <span className="min-w-0">
            <span className="block truncate text-sm font-bold tracking-tight text-ink-900">
              {appConfig.shortName}
            </span>
            {/* No celular o cabecalho fica compacto: so a marca. */}
            <span className="hidden truncate text-xs text-ink-500 sm:block">
              {appConfig.name}
            </span>
          </span>
        </span>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-success-50 px-2.5 py-1.5 text-[0.6875rem] font-semibold text-success-600 sm:text-xs">
          <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0 sm:size-4" />
          Ambiente seguro
        </span>
      </div>
    </header>
  );
}

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

function RoleBadge({ owner }: { owner: PublicInviteOwner | null }) {
  if (!owner) return null;
  return (
    <span className="mt-1.5 inline-flex items-center rounded-pill bg-navy-700 px-2.5 py-1 text-[0.6875rem] font-semibold text-navy-200">
      {OWNER_ROLE_LABELS[owner.role]}
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
          <RoleBadge owner={owner} />
        </div>
      </div>
    </section>
  );
}

/** Cartao azul-marinho lateral do desktop, com as etapas verticais. */
export function InviteOwnerAside({
  owner,
  fallbackName,
  className,
  steps,
  current,
}: OwnerProps & { steps: InviteStep[]; current: number }) {
  const name = owner?.name ?? fallbackName;

  return (
    <aside className={cn('flex-col gap-6 rounded-card bg-navy-900 p-6 shadow-overlay', className)}>
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
        <RoleBadge owner={owner} />

        <p className="mt-3 text-[0.8125rem] leading-relaxed text-navy-300">
          Faça parte desta mobilização e ajude a construir uma equipe mais próxima das pessoas.
        </p>
      </div>

      <InviteStepTrail steps={steps} current={current} />

      <p className="mt-auto flex items-start gap-2.5 rounded-control bg-navy-800 p-3 text-[0.6875rem] leading-relaxed text-navy-200">
        <ShieldCheck aria-hidden="true" className="mt-px size-4 shrink-0 text-emerald-400" />
        <span className="min-w-0">{PROTECTION_NOTICE}</span>
      </p>
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
 * cadastro enviado): o mesmo cabecalho e um cartao centralizado.
 */
export function InviteStateShell({ children }: { children: ReactNode }) {
  return (
    <main className="safe-x flex min-h-dvh flex-col bg-surface-muted">
      <InviteBrandBar />

      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md animate-rise rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
          {children}
        </div>
      </div>

      <p className="pb-6 text-center text-xs text-ink-400">{appConfig.shortName}</p>
    </main>
  );
}

export { PROTECTION_NOTICE, OWNER_ROLE_LABELS };
