'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Megaphone, Search, SearchX, Users, X } from 'lucide-react';
import { useClientSummaries } from '@/hooks/use-clients';
import { inviteIsLive } from '@/lib/domain/invite-expiration';
import { cn } from '@/lib/utils/cn';
import { formatNumber, matchesSearch, pluralize } from '@/lib/utils/text';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Recrutamento.
 *
 * Reune os candidatos e o estado do convite de cada um. Nenhum token e
 * gerado ou renovado aqui: a acao apenas abre a aba de convite do candidato,
 * onde a regra de link ja existe — assim os links ja enviados continuam
 * funcionando.
 */
export function RecruitView() {
  const { data, loading, error, reload } = useClientSummaries();
  const [term, setTerm] = useState('');

  const clients = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(
    () => clients.filter((client) => matchesSearch(term, client.name, client.email)),
    [clients, term],
  );

  const ativos = useMemo(
    () => clients.filter((client) => client.invite.active).length,
    [clients],
  );

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-500 uppercase">
          Mobilização
        </p>
        <h1 className="mt-1.5 text-2xl leading-tight font-bold tracking-tight text-ink-900 sm:text-[1.75rem]">
          Recrutar
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Acompanhe o convite de cada candidato e gerencie o recrutamento da equipe.
        </p>
      </header>

      <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-2 shadow-card sm:flex-row sm:items-center">
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 size-4 text-ink-400"
          />
          <input
            id="busca-recrutamento"
            type="search"
            value={term}
            aria-label="Buscar candidatos por nome ou e-mail"
            placeholder="Buscar por nome ou e-mail"
            onChange={(event) => setTerm(event.target.value)}
            className="min-h-11 w-full rounded-control bg-transparent pr-10 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {term ? (
            <button
              type="button"
              onClick={() => setTerm('')}
              aria-label="Limpar busca"
              className="absolute right-1 flex size-9 items-center justify-center rounded-control text-ink-400 transition-colors hover:text-ink-900"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <p className="shrink-0 px-2 text-xs text-ink-500 sm:px-3">
          {formatNumber(ativos)} {pluralize(ativos, 'convite ativo', 'convites ativos')}
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 rounded-card border border-danger-200 bg-danger-50 px-5 py-10 text-center"
        >
          <AlertTriangle aria-hidden="true" className="size-6 text-danger-600" />
          <p className="text-base font-semibold text-danger-700">{error}</p>
          <Button variant="secondary" onClick={reload}>
            Tentar novamente
          </Button>
        </div>
      ) : loading ? (
        <ul className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <li key={index}>
              <Skeleton className="h-24 rounded-card sm:h-20" />
            </li>
          ))}
        </ul>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="size-6" />}
          title="Nenhum candidato cadastrado"
          description="Cadastre um candidato para gerar o formulário de equipe e começar o recrutamento."
          action={
            <Link
              href="/candidatos"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand-700 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-800"
            >
              Ir para Candidatos
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-6" />}
          title="Nenhum resultado"
          description={`Nada encontrado para "${term}". Revise o termo buscado.`}
          action={
            <Button variant="secondary" onClick={() => setTerm('')}>
              Limpar busca
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((client) => (
            <li
              key={client.id}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card sm:flex-row sm:items-center"
            >
              <Avatar name={client.name} src={client.photo} size="md" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.9375rem] font-semibold text-ink-900">
                  {client.name}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                  <Users aria-hidden="true" className="size-3.5 shrink-0" />
                  {formatNumber(client.memberCount)}{' '}
                  {pluralize(client.memberCount, 'integrante', 'integrantes')}
                </p>
              </div>

              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 self-start rounded-pill px-2 py-1 text-[0.6875rem] font-medium whitespace-nowrap sm:self-center',
                  inviteIsLive(client.invite)
                    ? 'bg-success-50 text-success-700'
                    : 'bg-danger-50 text-danger-700',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-1.5 rounded-full',
                    inviteIsLive(client.invite) ? 'bg-success-600' : 'bg-danger-600',
                  )}
                />
                {inviteIsLive(client.invite) ? 'Link ativo' : 'Link expirado'}
              </span>

              {/* Abre a aba de convite do candidato. Nenhum token e gerado aqui. */}
              <Link
                href={`/candidatos/${client.id}?aba=convite`}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-4 text-sm font-medium text-ink-900 shadow-card transition-colors hover:bg-ink-50"
              >
                Gerenciar recrutamento
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
