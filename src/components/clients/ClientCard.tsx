'use client';

import { useRef, type CSSProperties, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  Clock3,
  Copy,
  ExternalLink,
  Medal,
  Pencil,
  Trash2,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import type { ClientSummary } from '@/lib/types';
import { formatLastActivity } from '@/lib/utils/date';
import { cn } from '@/lib/utils/cn';
import { formatNumber, initials, pluralize } from '@/lib/utils/text';
import { DemoBadge } from './DemoBadge';
import { CopyBadge } from './CopyBadge';
import { Contador } from '@/components/ui/Contador';
import { Menu, type MenuAction } from '@/components/ui/Menu';

/**
 * Faixa colorida do topo do cartao. Varia apenas pela posicao na grade:
 * nada disso e guardado no banco. Cada faixa e um gradiente que desliza.
 */
const ACCENTS = [
  'from-[#2f7de1] via-[#4f9bff] to-[#2f7de1]',
  'from-[#1f4e6d] via-[#2f7de1] to-[#1f4e6d]',
  'from-[#e0a426] via-[#f2c14e] to-[#e0a426]',
  'from-[#d9534f] via-[#f0857f] to-[#d9534f]',
  'from-[#2f9e8f] via-[#5fd0bf] to-[#2f9e8f]',
  'from-[#7c62d6] via-[#a48ff0] to-[#7c62d6]',
];

export function accentFor(index: number): string {
  return ACCENTS[index % ACCENTS.length];
}

/** Medalha dos tres maiores times (so a operacao real disputa). */
const MEDALHAS = [
  { texto: '1º maior time', classe: 'bg-gradient-to-br from-gold-400 to-gold-500 text-navy-900' },
  { texto: '2º maior time', classe: 'bg-gradient-to-br from-ink-100 to-ink-200 text-ink-700' },
  { texto: '3º maior time', classe: 'bg-gradient-to-br from-[#f3c9a1] to-[#d99a63] text-[#5a3410]' },
];

interface ClientCardProps {
  client: ClientSummary;
  /** Posicao na grade: define a cor da faixa e o atraso da entrada. */
  index?: number;
  /** Posicao entre os maiores times (0, 1, 2) ou nulo. */
  rank?: number | null;
  /** Integrantes do maior time da lista: a barra de forca e relativa a ele. */
  maxMembers?: number;
  /** Duplicar aparece so para o ADMIN geral, e nunca num Time DEMO. */
  canDuplicate?: boolean;
  onEdit: (client: ClientSummary) => void;
  onDelete: (client: ClientSummary) => void;
  onDuplicate?: (client: ClientSummary) => void;
}

/** Acoes do menu de tres pontos, iguais no cartao e na linha da lista. */
export function acoesDoTime(
  client: ClientSummary,
  {
    onOpen,
    onEdit,
    onDelete,
    onDuplicate,
    canDuplicate,
  }: {
    onOpen: () => void;
    onEdit: (client: ClientSummary) => void;
    onDelete: (client: ClientSummary) => void;
    onDuplicate?: (client: ClientSummary) => void;
    canDuplicate?: boolean;
  },
): MenuAction[] {
  const href = `/candidatos/${client.id}`;
  return [
    { id: 'abrir', label: 'Abrir time', icon: <ArrowRight className="size-4" />, onSelect: onOpen },
    {
      id: 'nova-aba',
      label: 'Abrir em nova aba',
      icon: <ExternalLink className="size-4" />,
      onSelect: () => window.open(href, '_blank', 'noopener'),
    },
    { id: 'editar', label: 'Editar time', icon: <Pencil className="size-4" />, onSelect: () => onEdit(client) },
    ...(canDuplicate && onDuplicate && !client.isDemo
      ? [
          {
            id: 'duplicar',
            label: 'Duplicar time',
            icon: <Copy className="size-4" />,
            onSelect: () => onDuplicate(client),
          },
        ]
      : []),
    {
      id: 'excluir',
      label: 'Excluir time',
      icon: <Trash2 className="size-4" />,
      tone: 'danger' as const,
      onSelect: () => onDelete(client),
    },
  ];
}

/** Cartao de time: foto, numeros da equipe, quem chegou por ultimo e acoes. */
export function ClientCard({
  client,
  index = 0,
  rank = null,
  maxMembers = 0,
  canDuplicate = false,
  onEdit,
  onDelete,
  onDuplicate,
}: ClientCardProps) {
  const router = useRouter();
  const cardRef = useRef<HTMLElement>(null);
  const href = `/candidatos/${client.id}`;
  const remaining = client.memberCount - client.recentMembers.length;
  const forca = maxMembers > 0 ? Math.max(2, Math.round((client.memberCount / maxMembers) * 100)) : 0;
  const medalha = rank !== null && rank < MEDALHAS.length && client.memberCount > 0 ? MEDALHAS[rank] : null;
  const emAlta = client.memberCountLast7Days > 0;

  // O holofote segue o mouse sem renderizar de novo: so as variaveis do CSS.
  function moverHolofote(event: MouseEvent<HTMLElement>) {
    const box = cardRef.current?.getBoundingClientRect();
    if (!box) return;
    cardRef.current?.style.setProperty('--mx', `${event.clientX - box.left}px`);
    cardRef.current?.style.setProperty('--my', `${event.clientY - box.top}px`);
  }

  return (
    <article
      ref={cardRef}
      onMouseMove={moverHolofote}
      onClick={(event) => {
        // O clique em qualquer area livre do cartao abre o time.
        if ((event.target as HTMLElement).closest('a,button,[role="menu"]')) return;
        router.push(href);
      }}
      style={{ '--cmd-atraso': `${Math.min(index, 11) * 55}ms` } as CSSProperties}
      className={cn(
        'cmd-holofote cmd-cascata group flex h-full cursor-pointer flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card',
        'transition-[transform,box-shadow,border-color] duration-300 ease-out',
        'hover:-translate-y-1 hover:border-accent-100 hover:shadow-[0_18px_40px_-18px_rgba(15,30,53,0.35)]',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('cmd-faixa-viva block h-1.5 w-full bg-gradient-to-r', accentFor(index))}
      />

      <div className="flex flex-col gap-4 px-4 pt-4 pb-3.5">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            {/* Anel em gradiente em volta da foto, que gira devagar no hover. */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute -inset-[3px] rounded-full bg-gradient-to-br opacity-80 transition-transform duration-700 group-hover:rotate-180',
                accentFor(index),
              )}
            />
            <span className="relative block rounded-full bg-surface p-[2px]">
              {client.photo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={client.photo}
                  alt={`Foto de ${client.name}`}
                  className="size-12 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-navy-800 to-navy-600 text-sm font-bold text-white"
                >
                  {initials(client.name)}
                </span>
              )}
            </span>
            {medalha ? (
              <span
                title={medalha.texto}
                className={cn(
                  'absolute -right-1.5 -bottom-1 flex size-6 items-center justify-center rounded-full shadow-card ring-2 ring-surface',
                  medalha.classe,
                )}
              >
                <Medal aria-hidden="true" className="size-3.5" />
                <span className="sr-only">{medalha.texto}</span>
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="wrap-break-word text-base leading-tight font-semibold text-ink-900 transition-colors group-hover:text-accent-700">
              {client.name}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {/* Time de demonstracao: o selo evita que um numero de
                  apresentacao seja lido como numero da operacao. */}
              {client.isDemo ? <DemoBadge /> : null}
              {/* Copia de um time oficial (049): fora da Visao geral. */}
              {client.isCopy ? <CopyBadge sourceName={client.copyOf?.name} /> : null}
              {client.stateUf ? (
                <span className="rounded-pill bg-ink-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-ink-500">
                  {client.stateUf}
                </span>
              ) : null}
            </div>
          </div>

          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2 py-1 text-[0.6875rem] font-semibold whitespace-nowrap',
              client.invite.active ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700',
            )}
          >
            <span aria-hidden="true" className="relative flex size-1.5">
              {client.invite.active ? (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success-600 opacity-50" />
              ) : null}
              <span
                className={cn(
                  'relative inline-flex size-1.5 rounded-full',
                  client.invite.active ? 'bg-success-600' : 'bg-danger-600',
                )}
              />
            </span>
            {client.invite.active ? 'Convite ativo' : 'Convite inativo'}
          </span>
        </div>

        {/* Os tres numeros do time. O principal corre ate o valor. */}
        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-control bg-gradient-to-br from-accent-50 to-surface px-2.5 py-2">
            <dt className="flex items-center gap-1 text-[0.6875rem] font-medium text-ink-500">
              <Users aria-hidden="true" className="size-3.5 text-accent-600" />
              Integrantes
            </dt>
            <dd className="mt-1 text-lg leading-none font-bold text-ink-900">
              <Contador valor={client.memberCount} />
            </dd>
          </div>
          <div className="rounded-control bg-ink-50 px-2.5 py-2">
            <dt className="flex items-center gap-1 text-[0.6875rem] font-medium text-ink-500">
              <TrendingUp aria-hidden="true" className="size-3.5 text-accent-600" />
              Este mês
            </dt>
            <dd className="mt-1 text-lg leading-none font-bold text-ink-900">
              <Contador valor={client.memberCountThisMonth} />
            </dd>
          </div>
          <div className={cn('rounded-control px-2.5 py-2', emAlta ? 'bg-success-50' : 'bg-ink-50')}>
            <dt className="flex items-center gap-1 text-[0.6875rem] font-medium text-ink-500">
              <Zap aria-hidden="true" className={cn('size-3.5', emAlta ? 'text-success-600' : 'text-ink-400')} />7 dias
            </dt>
            <dd
              className={cn(
                'mt-1 flex items-center gap-0.5 text-lg leading-none font-bold',
                emAlta ? 'text-success-700' : 'text-ink-900',
              )}
            >
              {emAlta ? '+' : ''}
              <Contador valor={client.memberCountLast7Days} />
              {emAlta ? <ArrowUpRight aria-hidden="true" className="size-4" /> : null}
            </dd>
          </div>
        </dl>

        {/* Forca da equipe: o tamanho do time perto do maior da lista. */}
        {maxMembers > 0 ? (
          <div>
            <div className="flex items-center justify-between text-[0.6875rem] text-ink-500">
              <span>Força da equipe</span>
              <span className="font-semibold text-ink-700 tabular-nums">{forca}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-ink-100">
              <div
                className={cn('cmd-barra-viva h-full rounded-pill bg-gradient-to-r', accentFor(index))}
                style={{ width: `${forca}%`, '--cmd-atraso': `${200 + Math.min(index, 11) * 55}ms` } as CSSProperties}
              />
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          {client.recentMembers.length > 0 ? (
            <div className="flex items-center">
              <ul className="flex -space-x-2">
                {client.recentMembers.map((member) => (
                  <li
                    key={member.id}
                    title={member.name}
                    className="transition-transform duration-200 hover:z-10 hover:-translate-y-1"
                  >
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
              <p className="mt-1 wrap-break-word text-[0.6875rem] leading-none font-medium text-ink-700">
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
              {pluralize(client.teamPeopleCount, 'administrador do time', 'administradores do time')}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line py-1 pr-1 pl-4">
        <Link
          href={href}
          className="group/abrir inline-flex min-h-10 items-center gap-1.5 text-[0.8125rem] font-semibold text-accent-600 transition-colors hover:text-accent-700"
        >
          Abrir time
          <ArrowRight
            aria-hidden="true"
            className="size-3.5 transition-transform duration-200 group-hover:translate-x-1 group-hover/abrir:translate-x-1"
          />
        </Link>

        <Menu
          label={`Ações de ${client.name}`}
          actions={acoesDoTime(client, {
            onOpen: () => router.push(href),
            onEdit,
            onDelete,
            onDuplicate,
            canDuplicate,
          })}
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
      <span className={cn('block h-1.5 w-full bg-gradient-to-r opacity-40', accentFor(index))} />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-3.5">
        <div className="flex items-start gap-3">
          <span className="size-[3.25rem] shrink-0 rounded-full bg-ink-100" />
          <div className="flex-1 space-y-2 pt-1">
            <span className="block h-3.5 w-2/3 rounded-md bg-ink-100" />
            <span className="block h-3 w-1/3 rounded-md bg-ink-100" />
          </div>
          <span className="h-5 w-20 shrink-0 rounded-pill bg-ink-100" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <span className="block h-12 rounded-control bg-ink-100" />
          <span className="block h-12 rounded-control bg-ink-100" />
          <span className="block h-12 rounded-control bg-ink-100" />
        </div>
        <span className="block h-1.5 rounded-pill bg-ink-100" />
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
