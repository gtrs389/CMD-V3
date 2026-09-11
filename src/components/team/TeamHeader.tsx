'use client';

import type { TeamOverview } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/permissions';
import { initials } from '@/lib/utils/text';

/**
 * Cabecalho da area do integrante.
 *
 * Mesmo formato do cabecalho aprovado na pagina do candidato: foto grande,
 * nome em destaque e etiqueta de estado a direita. Aqui a foto e o nome sao
 * do proprio integrante, e a etiqueta diz o perfil.
 */
export function TeamHeader({ overview }: { overview: TeamOverview }) {
  const { profile } = overview;

  return (
    <header className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {profile.photo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={profile.photo}
            alt={`Foto de ${profile.name}`}
            className="size-16 shrink-0 rounded-card border border-line object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-16 shrink-0 items-center justify-center rounded-card border border-line bg-ink-100 text-lg font-semibold text-ink-500"
          >
            {initials(profile.name)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl leading-tight font-bold tracking-tight break-words text-ink-900 sm:text-[1.375rem]">
              {profile.name}
            </h1>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-accent-50 px-2 py-1 text-[0.6875rem] font-medium whitespace-nowrap text-accent-700">
              {ROLE_LABELS.EQUIPE}
            </span>
          </div>

          <p className="mt-1 truncate text-[0.8125rem] text-ink-500">{profile.email}</p>
          <p className="mt-0.5 truncate text-xs text-ink-400">Equipe de {overview.candidateName}</p>
        </div>
      </div>
    </header>
  );
}
