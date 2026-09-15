'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Building2,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Search,
  SearchX,
  UserPlus,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { useClientSummaries } from '@/hooks/use-clients';
import { useSession } from '@/components/layout/SessionProvider';
import type { ClientSummary } from '@/lib/types';
import { cn } from '@/lib/utils/cn';
import { startOfMonthIso } from '@/lib/utils/date';
import { formatNumber, matchesSearch, pluralize } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClientCard, ClientCardSkeleton } from './ClientCard';
import { ClientFormModal } from './ClientFormModal';
import { DemoTeamModal } from './DemoTeamModal';
import { DeleteClientDialog } from './DeleteClientDialog';
import { SampleDataButton } from './SampleDataButton';

type SortId = 'recentes' | 'antigos' | 'nome' | 'integrantes';

const SORTS: { id: SortId; label: string; compare: (a: ClientSummary, b: ClientSummary) => number }[] =
  [
    {
      id: 'recentes',
      label: 'Mais recentes',
      compare: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    },
    {
      id: 'antigos',
      label: 'Mais antigos',
      compare: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    },
    { id: 'nome', label: 'Nome (A–Z)', compare: (a, b) => a.name.localeCompare(b.name, 'pt-BR') },
    {
      id: 'integrantes',
      label: 'Mais integrantes',
      compare: (a, b) => b.memberCount - a.memberCount,
    },
  ];

const GRID = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3';

/** Botao azul de acao principal, igual ao do cabecalho da pagina. */
const ACTION_BUTTON =
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-pill bg-accent-600 ' +
  'px-4 text-sm font-medium text-white shadow-card transition-colors hover:bg-accent-700 ' +
  'active:bg-accent-700';

export function ClientsView() {
  const { user } = useSession();
  // Só o ADMIN geral cria e enxerga Time DEMO. A rota confere de novo: o
  // botão escondido nunca foi proteção.
  const adminGeral = user?.role === 'ADMIN';
  const router = useRouter();

  // A lista da pagina "Times" inclui os Times DEMO, com selo. Os indicadores
  // logo abaixo continuam somando apenas a operacao real.
  const { data, loading, error, reload } = useClientSummaries({ includeDemo: adminGeral });
  const [term, setTerm] = useState('');
  const [sort, setSort] = useState<SortId>('recentes');
  const [creating, setCreating] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [editing, setEditing] = useState<ClientSummary | null>(null);
  const [deleting, setDeleting] = useState<ClientSummary | null>(null);

  const clients = useMemo(() => data ?? [], [data]);

  const ordered = useMemo(() => {
    const compare = SORTS.find((option) => option.id === sort)?.compare ?? SORTS[0].compare;
    return [...clients].sort(compare);
  }, [clients, sort]);

  const filtered = useMemo(
    () =>
      ordered.filter((client) =>
        matchesSearch(
          term,
          client.name,
          ...client.teamPeoplePreview.map((person) => person.name),
        ),
      ),
    [ordered, term],
  );

  /**
   * Indicadores da OPERACAO REAL.
   *
   * O Time DEMO aparece na lista, com selo, porque o ADMIN geral precisa
   * abrir e apresentar. Mas ele nao entra em nenhum destes numeros: um time
   * de demonstracao somando ao total de times e de integrantes tornaria os
   * dois inuteis.
   */
  const totals = useMemo(() => {
    const monthStart = startOfMonthIso();
    const reais = clients.filter((client) => !client.isDemo);

    return {
      clients: reais.length,
      clientsThisMonth: reais.filter((client) => client.createdAt >= monthStart).length,
      members: reais.reduce((sum, client) => sum + client.memberCount, 0),
      membersLast7Days: reais.reduce((sum, client) => sum + client.memberCountLast7Days, 0),
    };
  }, [clients]);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-500 uppercase">
          Gestão de times
        </p>

        <div className="mt-1.5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl leading-tight font-bold tracking-tight text-ink-900 sm:text-[1.75rem]">
              Times
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              Organize suas operações e acompanhe cada equipe.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Exclusivo do ADMIN geral. */}
            {adminGeral ? (
              <Button variant="secondary" onClick={() => setCreatingDemo(true)}>
                <FlaskConical aria-hidden="true" className="size-4" />
                Criar Time DEMO
              </Button>
            ) : null}

            <button type="button" onClick={() => setCreating(true)} className={ACTION_BUTTON}>
              <UserPlus aria-hidden="true" className="size-4" />
              Novo time
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryTile
          href="#lista-candidatos"
          icon={<Users aria-hidden="true" className="size-5" />}
          value={totals.clients}
          label={pluralize(totals.clients, 'time', 'times')}
          delta={totals.clientsThisMonth}
          deltaLabel="este mês"
        />
        <SummaryTile
          href="/dashboard"
          icon={<UsersRound aria-hidden="true" className="size-5" />}
          value={totals.members}
          label={pluralize(totals.members, 'integrante', 'integrantes')}
          delta={totals.membersLast7Days}
          deltaLabel="nos últimos 7 dias"
        />
      </div>

      <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-2 shadow-card sm:flex-row sm:items-center">
        <div className="relative flex min-w-0 flex-1 items-center">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-ink-400" />
          <input
            id="busca-candidatos"
            type="search"
            value={term}
            aria-label="Buscar times por nome ou administrador"
            placeholder="Buscar por nome ou administrador"
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

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setTerm('')}
            aria-label={`Mostrar todos os times (${totals.clients})`}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-pill bg-accent-600 px-4 text-sm font-medium text-white transition-colors hover:bg-accent-700"
          >
            Todos
            <span className="rounded-pill bg-white/20 px-2 py-0.5 text-xs font-semibold">
              {formatNumber(totals.clients)}
            </span>
          </button>

          <SortMenu value={sort} onChange={setSort} />
        </div>
      </div>

      <section id="lista-candidatos" className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink-900">Seus times</h2>
          <p className="mt-0.5 text-sm text-ink-500">
            {formatNumber(filtered.length)} {pluralize(filtered.length, 'operação', 'operações')}{' '}
            {pluralize(filtered.length, 'cadastrada', 'cadastradas')}
          </p>
        </div>

        {error ? (
          <div
            role="alert"
            className="flex flex-col items-center justify-center gap-3 rounded-card border border-danger-200 bg-danger-50 px-5 py-10 text-center"
          >
            <AlertTriangle aria-hidden="true" className="size-6 text-danger-600" />
            <div>
              <p className="text-base font-semibold text-danger-700">
                Não foi possível carregar os times
              </p>
              <p className="mt-1 text-sm text-danger-700">{error}</p>
            </div>
            <Button variant="secondary" onClick={reload}>
              Tentar novamente
            </Button>
          </div>
        ) : loading ? (
          <div className={GRID}>
            {Array.from({ length: 6 }, (_, index) => (
              <ClientCardSkeleton key={index} index={index} />
            ))}
          </div>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="Nenhum time cadastrado"
            description="Cadastre o primeiro time para gerar o formulário de equipe e o link de convite."
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => setCreating(true)} className={ACTION_BUTTON}>
                  <UserPlus aria-hidden="true" className="size-4" />
                  Cadastrar time
                </button>
                <SampleDataButton />
              </div>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<SearchX className="size-6" />}
            title="Nenhum resultado"
            description={`Nada encontrado para "${term}". Revise o termo buscado ou veja todos os times.`}
            action={
              <Button variant="secondary" onClick={() => setTerm('')}>
                Limpar busca
              </Button>
            }
          />
        ) : (
          <div className={GRID}>
            {filtered.map((client, index) => (
              <ClientCard
                key={client.id}
                client={client}
                index={index}
                onEdit={setEditing}
                onDelete={setDeleting}
              />
            ))}
          </div>
        )}
      </section>

      {/* Concluida a criacao, a pagina do proprio Time DEMO abre: e la que
          os cartoes, as pessoas e o mapa ja aparecem preenchidos. */}
      {creatingDemo ? (
        <DemoTeamModal
          onClose={() => setCreatingDemo(false)}
          onCreated={({ client }) => {
            setCreatingDemo(false);
            reload();
            router.push(`/candidatos/${client.id}`);
          }}
        />
      ) : null}

      <ClientFormModal open={creating} onClose={() => setCreating(false)} />
      <ClientFormModal
        open={editing !== null}
        client={editing}
        onClose={() => setEditing(null)}
      />
      <DeleteClientDialog
        open={deleting !== null}
        client={deleting}
        memberCount={deleting?.memberCount ?? 0}
        onCancel={() => setDeleting(null)}
        onDeleted={() => setDeleting(null)}
      />
    </div>
  );
}

interface SummaryTileProps {
  href: string;
  icon: React.ReactNode;
  value: number;
  label: string;
  delta: number;
  deltaLabel: string;
}

/** Cartao de resumo do topo: total, variacao recente e atalho. */
function SummaryTile({ href, icon, value, label, delta, deltaLabel }: SummaryTileProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-card border border-line bg-surface px-4 py-3.5 shadow-card transition-shadow duration-200 hover:shadow-raised"
    >
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-600"
      >
        {icon}
      </span>

      <div className="min-w-0">
        <p className="text-2xl leading-none font-bold tracking-tight text-ink-900">
          {formatNumber(value)}
        </p>
        <p className="mt-1 text-sm text-ink-500">{label}</p>
      </div>

      <div className="ml-auto min-w-0 text-right">
        <p className="text-sm font-semibold text-ink-900">+{formatNumber(delta)}</p>
        <p className="mt-0.5 text-xs text-ink-500">{deltaLabel}</p>
      </div>

      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-50 text-ink-500 transition-colors group-hover:bg-accent-50 group-hover:text-accent-600"
      >
        <ChevronRight className="size-4" />
      </span>
    </Link>
  );
}

/** Ordenacao da lista. Menu proprio para caber o icone e o rotulo do print. */
function SortMenu({ value, onChange }: { value: SortId; onChange: (value: SortId) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = SORTS.find((option) => option.id === value) ?? SORTS[0];

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex-1 sm:flex-none">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Ordenar times: ${current.label}`}
        onClick={() => setOpen((state) => !state)}
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-control border border-line bg-surface px-3 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
      >
        <CalendarRange aria-hidden="true" className="size-4 shrink-0 text-ink-500" />
        <span className="truncate">{current.label}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-ink-500" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-48 animate-scale-in overflow-hidden rounded-control border border-line bg-surface py-1 shadow-overlay"
        >
          {SORTS.map((option) => (
            <button
              key={option.id}
              role="menuitemradio"
              aria-checked={option.id === value}
              type="button"
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
              className={cn(
                'flex min-h-11 w-full items-center px-3 text-left text-sm transition-colors hover:bg-ink-100',
                option.id === value ? 'font-semibold text-accent-700' : 'text-ink-700',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
