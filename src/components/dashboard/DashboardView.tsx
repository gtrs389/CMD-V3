'use client';

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  Clock3,
  Link2,
  Plus,
  TrendingUp,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import type { Member } from '@/lib/types';
import { useClientSummaries } from '@/hooks/use-clients';
import { useAllMembers } from '@/hooks/use-members';
import { useSession } from '@/components/layout/SessionProvider';
import { formatRelative } from '@/lib/utils/date';
import { initials } from '@/lib/utils/text';
import { cn } from '@/lib/utils/cn';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { MobilizationMap } from './MobilizationMap';
import { MembersChart, type ChartPoint } from './MembersChart';

const RECENT_WINDOW_DAYS = 7;
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const numberFormat = new Intl.NumberFormat('pt-BR');

/** Inicio do dia, no fuso do navegador. */
function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function sameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** Data e hora curtas usadas na coluna "Cadastrado em". */
function shortDateTime(iso: string, today: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';

  const hora = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const ontem = new Date(today);
  ontem.setDate(ontem.getDate() - 1);

  if (sameDay(date, today)) return `Hoje, ${hora}`;
  if (sameDay(date, ontem)) return `Ontem, ${hora}`;
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hora}`;
}

/** Cidade e UF do integrante, como aparecem na tabela. */
function location(member: Member): string {
  const parts = [member.city, member.state].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : '--';
}

export function DashboardView() {
  const [creating, setCreating] = useState(false);
  const { user } = useSession();

  const {
    data: clients,
    loading: loadingClients,
    error: clientsError,
    reload: reloadClients,
  } = useClientSummaries();
  const {
    data: members,
    loading: loadingMembers,
    error: membersError,
    reload: reloadMembers,
  } = useAllMembers();

  const loading = loadingClients || loadingMembers;
  const error = clientsError ?? membersError;

  const clientList = useMemo(() => clients ?? [], [clients]);
  const memberList = useMemo(() => members ?? [], [members]);

  // Fixa o instante da montagem: mantem as contagens estaveis entre renderizacoes.
  const [now] = useState(() => new Date());

  const stats = useMemo(() => {
    const today = startOfDay(now);

    const janelaRecente = new Date(today);
    janelaRecente.setDate(janelaRecente.getDate() - (RECENT_WINDOW_DAYS - 1));

    const inicioDoMes = new Date(now.getFullYear(), now.getMonth(), 1);

    const recentes = memberList.filter((member) => new Date(member.createdAt) >= janelaRecente);
    const deHoje = memberList.filter((member) => sameDay(new Date(member.createdAt), now));

    // Sete colunas, uma por dia, do mais antigo para o mais recente.
    const serie: ChartPoint[] = [];
    for (let i = RECENT_WINDOW_DAYS - 1; i >= 0; i -= 1) {
      const dia = new Date(today);
      dia.setDate(dia.getDate() - i);
      serie.push({
        label: WEEKDAYS[dia.getDay()],
        value: memberList.filter((member) => sameDay(new Date(member.createdAt), dia)).length,
      });
    }

    const ordenados = [...memberList].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return {
      total: memberList.length,
      recentes: recentes.length,
      serie,
      hoje: deHoje.length,
      avataresDeHoje: deHoje.slice(0, 3),
      ultimoCadastro: ordenados[0]?.createdAt ?? null,
      ultimos: ordenados.slice(0, 5),
      convitesAtivos: clientList.filter((client) => client.invite.active).length,
      clientesNoMes: clientList.filter((client) => new Date(client.createdAt) >= inicioDoMes).length,
      topClientes: [...clientList].sort((a, b) => b.memberCount - a.memberCount).slice(0, 4),
    };
  }, [clientList, memberList, now]);

  const maiorCliente = Math.max(1, ...stats.topClientes.map((client) => client.memberCount));
  const nomeCurto = (user?.name ?? 'Administrador').split(' ')[0];

  return (
    <div className="animate-rise space-y-4 pb-2">
      <header className="flex flex-wrap items-start justify-between gap-3 px-1 pt-1">
        <div className="min-w-0">
          <p className="text-[0.625rem] font-semibold tracking-[0.14em] text-ink-500 uppercase">
            Central de mobilização
          </p>
          <h1 className="mt-1 text-[1.75rem] leading-tight font-bold tracking-tight text-ink-900 sm:text-[2rem]">
            Olá, {nomeCurto}
          </h1>
          <p className="mt-0.5 text-sm text-ink-500">Sua operação em movimento.</p>
        </div>

        <Button className="shrink-0 rounded-pill px-5" onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" className="size-4" />
          Novo cliente
        </Button>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
        >
          <p>{error}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              reloadClients();
              reloadMembers();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}

      {/* Linha superior: cartao principal, dois atalhos e cadastros de hoje. */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,0.85fr)_minmax(0,0.9fr)]">
        <article className="rounded-card bg-navy-900 p-5 text-white shadow-overlay">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-control bg-navy-700 text-white"
              >
                <UsersRound className="size-[1.125rem]" />
              </span>
              <p className="text-sm font-medium text-navy-200">Integrantes cadastrados</p>
            </div>

            <span className="rounded-pill bg-navy-700 px-3 py-1 text-[0.6875rem] font-medium text-navy-200">
              Últimos {RECENT_WINDOW_DAYS} dias
            </span>
          </div>

          {loading ? (
            <Skeleton className="mt-4 h-10 w-40 bg-navy-700" />
          ) : (
            <p className="mt-4 text-[2.75rem] leading-none font-bold tracking-tight">
              {numberFormat.format(stats.total)}
            </p>
          )}

          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-accent-400">
            <TrendingUp aria-hidden="true" className="size-3.5" />+{numberFormat.format(stats.recentes)} nos
            últimos {RECENT_WINDOW_DAYS} dias
          </p>

          <MembersChart
            points={stats.serie}
            highlight={loading ? undefined : numberFormat.format(stats.total)}
          />

          <p className="mt-3 max-w-[13rem] text-xs leading-snug text-navy-300">
            Mais pessoas fazendo a diferença juntas.
          </p>
        </article>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <AtalhoCard
            href="/clientes"
            icon={<Users className="size-[1.125rem]" />}
            value={clientList.length}
            label="Clientes"
            hint={
              stats.clientesNoMes > 0
                ? `${stats.clientesNoMes} ${stats.clientesNoMes === 1 ? 'adicionado' : 'adicionados'} este mês`
                : 'Nenhum adicionado este mês'
            }
            loading={loading}
          />
          <AtalhoCard
            href="/clientes"
            icon={<Link2 className="size-[1.125rem]" />}
            value={stats.convitesAtivos}
            label="Convites ativos"
            hint={
              stats.convitesAtivos > 0
                ? 'Links recebendo cadastros'
                : 'Nenhum link ativo no momento'
            }
            loading={loading}
          />
        </div>

        <article className="rounded-card border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-control bg-brand-50 text-brand-700"
            >
              <UserPlus className="size-[1.125rem]" />
            </span>
            <p className="text-sm font-medium text-ink-500">Cadastros hoje</p>
          </div>

          {loading ? (
            <Skeleton className="mt-4 h-10 w-20" />
          ) : (
            <p className="mt-4 text-[2.75rem] leading-none font-bold tracking-tight text-ink-900">
              {numberFormat.format(stats.hoje)}
            </p>
          )}

          <div className="mt-4 flex min-h-9 items-center">
            {stats.hoje === 0 ? (
              <p className="text-xs text-ink-500">Nenhum cadastro registrado hoje.</p>
            ) : (
              <>
                <div className="flex -space-x-2">
                  {stats.avataresDeHoje.map((member) =>
                    member.photo ? (
                      <img
                        key={member.id}
                        src={member.photo}
                        alt={`Foto de ${member.name}`}
                        className="size-9 rounded-full border-2 border-surface object-cover"
                      />
                    ) : (
                      <span
                        key={member.id}
                        aria-hidden="true"
                        className="flex size-9 items-center justify-center rounded-full border-2 border-surface bg-ink-100 text-[0.625rem] font-semibold text-ink-500"
                      >
                        {initials(member.name)}
                      </span>
                    ),
                  )}
                </div>
                {stats.hoje > stats.avataresDeHoje.length ? (
                  <span className="ml-2 rounded-pill bg-brand-50 px-2 py-1 text-[0.6875rem] font-semibold text-brand-800">
                    +{numberFormat.format(stats.hoje - stats.avataresDeHoje.length)}
                  </span>
                ) : null}
              </>
            )}
          </div>

          <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-500">
            <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
            {stats.ultimoCadastro
              ? `Último cadastro ${formatRelative(stats.ultimoCadastro)}`
              : 'Nenhum cadastro ainda'}
          </p>
        </article>
      </section>

      {/* Linha inferior: ultimos integrantes e ranking de clientes. */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.72fr)_minmax(0,1fr)]">
        <article className="rounded-card border border-line bg-surface p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-control bg-brand-50 text-brand-700"
              >
                <UsersRound className="size-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-ink-900">
                  Últimos integrantes cadastrados
                </h2>
                <p className="text-xs text-ink-500">
                  Pessoas que acabaram de entrar nas equipes dos seus clientes.
                </p>
              </div>
            </div>

            <Link
              href="/clientes"
              className="shrink-0 text-xs font-semibold text-brand-700 hover:text-brand-800"
            >
              Ver todos
            </Link>
          </div>

          {loading ? (
            <div className="mt-4 space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : stats.ultimos.length === 0 ? (
            <p className="mt-6 text-sm text-ink-500">
              Nenhum integrante cadastrado ainda. Compartilhe um link de convite para começar.
            </p>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-line sm:hidden">
                {stats.ultimos.map((member) => {
                  const cliente = clientList.find((item) => item.id === member.clientId);
                  return (
                    <li key={member.id} className="flex items-start gap-2.5 py-3">
                      <Avatar name={member.name} src={member.photo} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.8125rem] font-medium text-ink-900">
                          {member.name}
                        </p>
                        <p className="truncate text-xs text-ink-700">{cliente?.name ?? '--'}</p>
                        <p className="mt-0.5 truncate text-xs text-ink-500">
                          {location(member)} · {shortDateTime(member.createdAt, now)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <table className="mt-3 hidden w-full border-collapse text-left sm:table">
                <thead>
                  <tr className="border-b border-line">
                    {['Integrante', 'Cliente', 'Localização', 'Cadastrado em'].map((coluna) => (
                      <th
                        key={coluna}
                        scope="col"
                        className="pb-2 text-[0.625rem] font-semibold tracking-[0.08em] text-ink-500 uppercase"
                      >
                        {coluna}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.ultimos.map((member) => {
                    const cliente = clientList.find((item) => item.id === member.clientId);
                    return (
                      <tr key={member.id} className="border-b border-line last:border-0">
                        <td className="py-2.5 pr-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <Avatar name={member.name} src={member.photo} size="sm" />
                            <span className="truncate text-[0.8125rem] font-medium text-ink-900">
                              {member.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 text-[0.8125rem] text-ink-700">
                          {cliente?.name ?? '--'}
                        </td>
                        <td className="py-2.5 pr-3 text-[0.8125rem] text-ink-500">
                          {location(member)}
                        </td>
                        <td className="py-2.5 text-[0.8125rem] text-ink-500">
                          {shortDateTime(member.createdAt, now)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </article>

        <article className="rounded-card border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-control bg-brand-50 text-brand-700"
              >
                <Users className="size-4" />
              </span>
              <h2 className="text-sm font-semibold text-ink-900">Clientes</h2>
            </div>

            <Link
              href="/clientes"
              className="shrink-0 text-xs font-semibold text-brand-700 hover:text-brand-800"
            >
              Ver todos
            </Link>
          </div>

          {loading ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          ) : stats.topClientes.length === 0 ? (
            <p className="mt-6 text-sm text-ink-500">
              Nenhum cliente cadastrado. Use o botão “Novo cliente” para começar.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {stats.topClientes.map((client) => (
                <li key={client.id}>
                  <Link
                    href={`/clientes/${client.id}`}
                    className="flex items-center gap-3 py-2.5 transition-colors hover:bg-ink-50"
                  >
                    <Avatar name={client.name} src={client.photo} size="sm" />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8125rem] font-medium text-ink-900">
                        {client.name}
                      </p>
                      <p className="text-xs text-ink-500">
                        {numberFormat.format(client.memberCount)}{' '}
                        {client.memberCount === 1 ? 'integrante' : 'integrantes'}
                      </p>
                    </div>

                    <ClientBar value={client.memberCount} max={maiorCliente} />

                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <MobilizationMap />

      <ClientFormModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

interface AtalhoCardProps {
  href: string;
  icon: React.ReactNode;
  value: number;
  label: string;
  hint: string;
  loading: boolean;
}

/** Cartao compacto com total, rotulo e uma linha de contexto. */
function AtalhoCard({ href, icon, value, label, hint, loading }: AtalhoCardProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:bg-ink-50"
    >
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-control bg-brand-50 text-brand-700"
      >
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        {loading ? (
          <Skeleton className="h-7 w-12" />
        ) : (
          <p className="text-[1.75rem] leading-none font-bold tracking-tight text-ink-900">
            {numberFormat.format(value)}
          </p>
        )}
        <p className="mt-1 text-[0.8125rem] font-medium text-ink-900">{label}</p>
        <p className="mt-0.5 truncate text-xs text-ink-500">{hint}</p>
      </div>

      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-400" />
    </Link>
  );
}

/** Barra proporcional ao maior cliente exibido. */
function ClientBar({ value, max }: { value: number; max: number }) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <span
      aria-hidden="true"
      className={cn('hidden h-1.5 w-16 shrink-0 overflow-hidden rounded-pill bg-ink-100 sm:block')}
    >
      <span
        className="block h-full rounded-pill bg-brand-700"
        style={{ width: `${Math.max(percent, 4)}%` }}
      />
    </span>
  );
}
