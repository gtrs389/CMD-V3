'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clock3, Pencil, TrendingUp, Trash2, Users } from 'lucide-react';
import type { ClientSummary } from '@/lib/types';
import { formatLastActivity } from '@/lib/utils/date';
import { cn } from '@/lib/utils/cn';
import { formatNumber, initials, pluralize } from '@/lib/utils/text';
import { Avatar } from '@/components/ui/Avatar';
import { Menu } from '@/components/ui/Menu';

/**
 * Faixa colorida do topo do cartao. Varia apenas pela posicao na grade:
 * nada disso e guardado no banco.
 */
const ACCENTS = [
  'bg-[#2f7de1]',
  'bg-[#1f4e6d]',
  'bg-[#e0a426]',
  'bg-[#d9534f]',
  'bg-[#2f9e8f]',
  'bg-[#7c62d6]',
];

export function accentFor(index: number): string {
  return ACCENTS[index % ACCENTS.length];
}

interface ClientCardProps {
  client: ClientSummary;
  /** Posicao na grade: define apenas a cor da faixa superior. */
  index?: number;
  onEdit: (client: ClientSummary) => void;
  onDelete: (client: ClientSummary) => void;
}

/** Cartao de time: foto, contato, numeros da equipe e acoes principais. */
export function ClientCard({ client, index = 0, onEdit, onDelete }: ClientCardProps) {
  const router = useRouter();
  const href = `/candidatos/${client.id}`;
  const remaining = client.memberCount - client.recentMembers.length;

  return (
    <article
      onClick={(event) => {
        // O clique em qualquer area livre do cartao abre o time.
        if ((event.target as HTMLElement).closest('a,button')) return;
        router.push(href);
      }}
      className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-shadow duration-200 hover:shadow-raised"
    >
      <span aria-hidden="true" className={cn('block h-1 w-full', accentFor(index))} />

      <div className="flex flex-col gap-3 px-4 pt-3.5 pb-3">
        <div className="flex items-start gap-3">
          <Avatar name={client.name} src={client.photo} size="md" />

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[0.9375rem] leading-tight font-semibold text-ink-900">
              {client.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-ink-500">{client.email}</p>
          </div>

          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2 py-1 text-[0.6875rem] font-medium whitespace-nowrap',
              client.invite.active
                ? 'bg-success-50 text-success-700'
                : 'bg-danger-50 text-danger-700',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'size-1.5 rounded-full',
                client.invite.active ? 'bg-success-600' : 'bg-danger-600',
              )}
            />
            {client.invite.active ? 'Convite ativo' : 'Convite inativo'}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Users aria-hidden="true" className="size-4 shrink-0 text-accent-600" />
            <div className="min-w-0">
              <dt className="text-[0.6875rem] leading-none text-ink-500">Integrantes</dt>
              <dd className="mt-1 text-sm leading-none font-semibold text-ink-900">
                {formatNumber(client.memberCount)}
              </dd>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <TrendingUp aria-hidden="true" className="size-4 shrink-0 text-accent-600" />
            <div className="min-w-0">
              <dt className="text-[0.6875rem] leading-none text-ink-500">Este mês</dt>
              <dd className="mt-1 text-sm leading-none font-semibold text-ink-900">
                {formatNumber(client.memberCountThisMonth)}
              </dd>
            </div>
          </div>
        </dl>

        <div className="flex items-center justify-between gap-3">
          {client.recentMembers.length > 0 ? (
            <div className="flex items-center">
              <ul className="flex -space-x-2">
                {client.recentMembers.map((member) => (
                  <li key={member.id} title={member.name}>
                    {member.photo ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={member.photo}
                        alt={`Foto de ${member.name}`}
                        className="size-7 rounded-full object-cover ring-2 ring-surface"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex size-7 items-center justify-center rounded-full bg-ink-100 text-[0.625rem] font-semibold text-ink-500 ring-2 ring-surface"
                      >
                        {initials(member.name)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {remaining > 0 ? (
                <span className="ml-1.5 rounded-pill bg-accent-50 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-accent-700">
                  +{formatNumber(remaining)}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-[0.6875rem] text-ink-500">Nenhum integrante cadastrado</p>
          )}

          <div className="flex min-w-0 items-center gap-2">
            <Clock3 aria-hidden="true" className="size-4 shrink-0 text-ink-400" />
            <div className="min-w-0">
              <p className="text-[0.6875rem] leading-none text-ink-500">Último cadastro</p>
              <p className="mt-1 truncate text-[0.6875rem] leading-none font-medium text-ink-700">
                {client.lastMemberAt ? formatLastActivity(client.lastMemberAt) : 'Nenhum'}
              </p>
            </div>
          </div>
        </div>

        {/* Pilha compacta das pessoas do time. Sem pessoas, a linha nem existe. */}
        {client.teamPeopleCount > 0 ? (
          <div className="flex items-center gap-1.5">
            <ul className="flex -space-x-1.5">
              {client.teamPeoplePreview.map((person) => (
                <li key={person.id} title={person.name}>
                  {person.photo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={person.photo}
                      alt={`Foto de ${person.name}`}
                      className="size-5 rounded-full object-cover ring-2 ring-surface"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex size-5 items-center justify-center rounded-full bg-ink-100 text-[0.5625rem] font-semibold text-ink-500 ring-2 ring-surface"
                    >
                      {initials(person.name)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <span className="text-[0.6875rem] text-ink-500">
              {formatNumber(client.teamPeopleCount)}{' '}
              {pluralize(client.teamPeopleCount, 'pessoa do time', 'pessoas do time')}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line py-1 pr-1 pl-4">
        <Link
          href={href}
          className="inline-flex min-h-10 items-center gap-1.5 text-[0.8125rem] font-semibold text-accent-600 transition-colors hover:text-accent-700"
        >
          Abrir time
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>

        <Menu
          label={`Ações de ${client.name}`}
          actions={[
            {
              id: 'editar',
              label: 'Editar time',
              icon: <Pencil className="size-4" />,
              onSelect: () => onEdit(client),
            },
            {
              id: 'excluir',
              label: 'Excluir time',
              icon: <Trash2 className="size-4" />,
              tone: 'danger',
              onSelect: () => onDelete(client),
            },
          ]}
        />
      </div>
    </article>
  );
}

/** Esqueleto com o mesmo formato do cartao, usado durante o carregamento. */
export function ClientCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-full animate-shimmer flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      <span className={cn('block h-1 w-full opacity-40', accentFor(index))} />
      <div className="flex flex-col gap-3 px-4 pt-3.5 pb-3">
        <div className="flex items-start gap-3">
          <span className="size-11 shrink-0 rounded-full bg-ink-100" />
          <div className="flex-1 space-y-2 pt-1">
            <span className="block h-3.5 w-2/3 rounded-md bg-ink-100" />
            <span className="block h-3 w-1/2 rounded-md bg-ink-100" />
          </div>
          <span className="h-5 w-20 shrink-0 rounded-pill bg-ink-100" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <span className="block h-8 rounded-md bg-ink-100" />
          <span className="block h-8 rounded-md bg-ink-100" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="block h-7 w-24 rounded-pill bg-ink-100" />
          <span className="block h-7 w-28 rounded-md bg-ink-100" />
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-line px-4 py-3">
        <span className="block h-4 w-24 rounded-md bg-ink-100" />
        <span className="block size-4 rounded-md bg-ink-100" />
      </div>
    </div>
  );
}
