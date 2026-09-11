/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react';
import { appConfig } from '@/config/app.config';
import type { PublicInviteOwner } from '@/lib/types';
import { cn } from '@/lib/utils/cn';
import { initials } from '@/lib/utils/text';

/**
 * Moldura da pagina publica de cadastro. Sem cabecalho de marca: a
 * identidade da tela vem so do cartao azul-marinho.
 *
 * Desktop: coluna azul-marinho fixa a esquerda, com quem convidou, e o
 * formulario a direita, com rolagem propria.
 * Celular: cartao azul-marinho horizontal no topo e o formulario em uma
 * coluna, tudo rolando junto.
 *
 * Nao ha etapas, progresso nem pastilhas: o cadastro inteiro cabe em uma
 * pagina so.
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
 * Cartao azul-marinho lateral do desktop.
 *
 * Fixo em toda a altura da tela: quem preenche o formulario nunca perde de
 * vista quem convidou. Apenas a coluna do formulario, ao lado, tem rolagem
 * propria.
 */
export function InviteOwnerAside({ owner, fallbackName, className }: OwnerProps) {
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
    </aside>
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
