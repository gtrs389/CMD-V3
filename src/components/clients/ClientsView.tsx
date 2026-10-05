'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarRange,
  Check,
  ChevronDown,
  Flame,
  FlaskConical,
  LayoutGrid,
  Link2,
  List,
  Search,
  SearchX,
  UserPlus,
  Users,
  UsersRound,
  X,
  Zap,
} from 'lucide-react';
import { useClientSummaries } from '@/hooks/use-clients';
import { useSession } from '@/components/layout/SessionProvider';
import type { ClientSummary } from '@/lib/types';
import { cn } from '@/lib/utils/cn';
import { formatLastActivity, startOfMonthIso } from '@/lib/utils/date';
import { formatNumber, initials, matchesSearch, pluralize } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';
import { Contador } from '@/components/ui/Contador';
import { EmptyState } from '@/components/ui/EmptyState';
import { Menu } from '@/components/ui/Menu';
import { ClientCard, ClientCardSkeleton, acoesDoTime } from './ClientCard';
import { ClientFormModal } from './ClientFormModal';
import { DemoBadge } from './DemoBadge';
import { CopyBadge } from './CopyBadge';
import { DemoTeamModal } from './DemoTeamModal';
import { DeleteClientDialog } from './DeleteClientDialog';
import { DuplicateTeamDialog } from './DuplicateTeamDialog';
import { SampleDataButton } from './SampleDataButton';

type SortId = 'recentes' | 'antigos' | 'nome' | 'integrantes' | 'crescimento' | 'atividade';

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
    {
      id: 'crescimento',
      label: 'Mais cresceram (7 dias)',
      compare: (a, b) => b.memberCountLast7Days - a.memberCountLast7Days || b.memberCount - a.memberCount,
    },
    {
      id: 'atividade',
      label: 'Último cadastro',
      compare: (a, b) => (b.lastMemberAt ?? '').localeCompare(a.lastMemberAt ?? ''),
    },
  ];

type FiltroId = 'todos' | 'ativos' | 'inativos' | 'demo' | 'copias';

const FILTROS: { id: FiltroId; label: string; test: (c: ClientSummary) => boolean; soAdmin?: boolean }[] = [
  { id: 'todos', label: 'Todos', test: () => true },
  { id: 'ativos', label: 'Convite ativo', test: (c) => c.invite.active },
  { id: 'inativos', label: 'Convite inativo', test: (c) => !c.invite.active },
  { id: 'demo', label: 'DEMO', test: (c) => c.isDemo, soAdmin: true },
  { id: 'copias', label: 'Duplicados', test: (c) => c.isCopy },
];

type Visao = 'cartoes' | 'lista';
const CHAVE_DA_VISAO = 'cmd:times:visao';

const GRID = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3';

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
  const [filtro, setFiltro] = useState<FiltroId>('todos');
  const [visao, setVisao] = useState<Visao>('cartoes');
  const [creating, setCreating] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [editing, setEditing] = useState<ClientSummary | null>(null);
  const [deleting, setDeleting] = useState<ClientSummary | null>(null);
  const [duplicating, setDuplicating] = useState<ClientSummary | null>(null);

  // A visao escolhida (cartoes ou lista) e uma conveniencia deste navegador.
  useEffect(() => {
    try {
      const salva = window.localStorage.getItem(CHAVE_DA_VISAO);
      if (salva === 'lista' || salva === 'cartoes') {
        const quadro = requestAnimationFrame(() => setVisao(salva));
        return () => cancelAnimationFrame(quadro);
      }
    } catch {
      // Sem armazenamento: fica nos cartoes.
    }
    return undefined;
  }, []);
  function trocarVisao(nova: Visao) {
    setVisao(nova);
    try {
      window.localStorage.setItem(CHAVE_DA_VISAO, nova);
    } catch {
      // Sem armazenamento: vale so ate recarregar.
    }
  }

  const clients = useMemo(() => data ?? [], [data]);
  const filtros = useMemo(() => FILTROS.filter((f) => !f.soAdmin || adminGeral), [adminGeral]);
  const contagemPorFiltro = useMemo(
    () => new Map(filtros.map((f) => [f.id, clients.filter(f.test).length])),
    [clients, filtros],
  );

  const ordered = useMemo(() => {
    const compare = SORTS.find((option) => option.id === sort)?.compare ?? SORTS[0].compare;
    return [...clients].sort(compare);
  }, [clients, sort]);

  const filtered = useMemo(() => {
    const teste = FILTROS.find((f) => f.id === filtro)?.test ?? (() => true);
    return ordered.filter(
      (client) =>
        teste(client) &&
        matchesSearch(term, client.name, ...client.teamPeoplePreview.map((person) => person.name)),
    );
  }, [ordered, term, filtro]);

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
    // Nem DEMO, nem copia (049): os dois ficam fora dos numeros reais.
    const reais = clients.filter((client) => !client.isDemo && !client.isCopy);

    return {
      clients: reais.length,
      clientsThisMonth: reais.filter((client) => client.createdAt >= monthStart).length,
      members: reais.reduce((sum, client) => sum + client.memberCount, 0),
      membersThisMonth: reais.reduce((sum, client) => sum + client.memberCountThisMonth, 0),
      membersLast7Days: reais.reduce((sum, client) => sum + client.memberCountLast7Days, 0),
      activeInvites: reais.filter((client) => client.invite.active).length,
      reais,
    };
  }, [clients]);

  /** Os tres maiores times reais ganham medalha. */
  const ranking = useMemo(() => {
    const ordem = [...totals.reais].filter((c) => c.memberCount > 0).sort((a, b) => b.memberCount - a.memberCount);
    return new Map(ordem.slice(0, 3).map((c, i) => [c.id, i]));
  }, [totals.reais]);
  const maxMembers = useMemo(() => Math.max(0, ...clients.map((c) => c.memberCount)), [clients]);

  /** O time real que mais cresceu nos ultimos sete dias. */
  const destaque = useMemo(
    () =>
      [...totals.reais]
        .filter((c) => c.memberCountLast7Days > 0)
        .sort((a, b) => b.memberCountLast7Days - a.memberCountLast7Days)[0] ?? null,
    [totals.reais],
  );

  const limparTudo = () => {
    setTerm('');
    setFiltro('todos');
  };

  const acoes = {
    onEdit: setEditing,
    onDelete: setDeleting,
    onDuplicate: setDuplicating,
    canDuplicate: adminGeral,
  };

  return (
    <div className="space-y-5">
      {/* HEROI: titulo, acoes e os numeros da operacao real. */}
      <header className="relative overflow-hidden rounded-card bg-gradient-to-br from-navy-900 via-navy-800 to-[#1e3a8a] p-5 text-white shadow-overlay sm:p-6">
        <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0" />
        <span
          aria-hidden="true"
          className="cmd-orbe pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-accent-500/30 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="cmd-orbe cmd-orbe--b pointer-events-none absolute -bottom-28 left-1/4 size-72 rounded-full bg-gold-500/15 blur-3xl"
        />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 animate-fade-up">
            <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.16em] text-white/70 uppercase">
              <span aria-hidden="true" className="h-3.5 w-1 rounded-full bg-gold-400" />
              Gestão de times
            </p>
            <h1 className="mt-1.5 text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
              Times
            </h1>
            <p className="mt-1 max-w-md text-sm text-white/70">
              Cada operação, cada equipe e cada cadastro — num só lugar, ao vivo.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-pill bg-white px-4 text-sm font-semibold text-navy-900 shadow-[0_10px_24px_-10px_rgba(255,255,255,0.6)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-50"
              >
                <UserPlus aria-hidden="true" className="size-4 text-accent-600 transition-transform group-hover:scale-110" />
                Novo time
              </button>
              {/* Exclusivo do ADMIN geral. */}
              {adminGeral ? (
                <button
                  type="button"
                  onClick={() => setCreatingDemo(true)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
                >
                  <FlaskConical aria-hidden="true" className="size-4 text-gold-400" />
                  Criar Time DEMO
                </button>
              ) : null}
            </div>
          </div>

          {destaque ? <DestaqueDaSemana client={destaque} /> : null}
        </div>

        <dl className="relative mt-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Indicador
            indice={0}
            icone={<Building2 className="size-4" />}
            rotulo={pluralize(totals.clients, 'Time', 'Times')}
            valor={totals.clients}
            nota={`+${formatNumber(totals.clientsThisMonth)} este mês`}
          />
          <Indicador
            indice={1}
            icone={<UsersRound className="size-4" />}
            rotulo="Integrantes"
            valor={totals.members}
            nota={`+${formatNumber(totals.membersThisMonth)} este mês`}
            forte
          />
          <Indicador
            indice={2}
            icone={<Zap className="size-4" />}
            rotulo="Últimos 7 dias"
            valor={totals.membersLast7Days}
            nota={totals.membersLast7Days > 0 ? 'novos cadastros' : 'nenhum cadastro novo'}
            prefixo={totals.membersLast7Days > 0 ? '+' : ''}
          />
          <Indicador
            indice={3}
            icone={<Link2 className="size-4" />}
            rotulo="Convites ativos"
            valor={totals.activeInvites}
            nota={`de ${formatNumber(totals.clients)} ${pluralize(totals.clients, 'time', 'times')}`}
            progresso={totals.clients ? totals.activeInvites / totals.clients : 0}
          />
        </dl>
      </header>

      {/* BARRA: busca, filtros, ordem e visao. Gruda no topo ao rolar. */}
      <div className="sticky top-14 z-20 lg:top-2">
        <div className="flex flex-col gap-2 rounded-card border border-line bg-surface/90 p-2 shadow-raised backdrop-blur-md">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex min-w-0 flex-1 items-center">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-ink-400" />
              <input
                id="busca-candidatos"
                type="search"
                value={term}
                aria-label="Buscar times por nome ou administrador"
                placeholder="Buscar por nome ou administrador"
                onChange={(event) => setTerm(event.target.value)}
                className="min-h-11 w-full rounded-control bg-ink-50 pr-10 pl-9 text-sm text-ink-900 transition-colors placeholder:text-ink-400 focus:bg-surface focus:ring-2 focus:ring-accent-100 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
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
              <SortMenu value={sort} onChange={setSort} />
              <div role="group" aria-label="Visualização" className="flex rounded-control border border-line bg-ink-50 p-0.5">
                {(
                  [
                    { id: 'cartoes', label: 'Cartões', icon: <LayoutGrid className="size-4" /> },
                    { id: 'lista', label: 'Lista', icon: <List className="size-4" /> },
                  ] as const
                ).map((opcao) => (
                  <button
                    key={opcao.id}
                    type="button"
                    aria-pressed={visao === opcao.id}
                    aria-label={`Ver em ${opcao.label.toLowerCase()}`}
                    title={opcao.label}
                    onClick={() => trocarVisao(opcao.id)}
                    className={cn(
                      'flex size-9 items-center justify-center rounded-[0.5rem] transition-all duration-200',
                      visao === opcao.id ? 'bg-surface text-accent-600 shadow-card' : 'text-ink-500 hover:text-ink-900',
                    )}
                  >
                    {opcao.icon}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div role="group" aria-label="Filtrar times" className="-mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-0.5">
            {filtros.map((f) => {
              const ligado = filtro === f.id;
              const quantos = contagemPorFiltro.get(f.id) ?? 0;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={ligado}
                  onClick={() => setFiltro(f.id)}
                  className={cn(
                    'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold transition-all duration-200',
                    ligado
                      ? 'border-accent-600 bg-accent-600 text-white shadow-[0_6px_16px_-8px_rgba(37,99,235,0.8)]'
                      : 'border-line bg-surface text-ink-700 hover:border-accent-100 hover:bg-accent-50',
                  )}
                >
                  {ligado ? <Check aria-hidden="true" className="size-3.5" /> : null}
                  {f.label}
                  <span
                    className={cn(
                      'rounded-pill px-1.5 py-0.5 text-[0.625rem] tabular-nums',
                      ligado ? 'bg-white/20' : 'bg-ink-100 text-ink-500',
                    )}
                  >
                    {formatNumber(quantos)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <section id="lista-candidatos" className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink-900">Seus times</h2>
            <p className="mt-0.5 text-sm text-ink-500">
              {formatNumber(filtered.length)} {pluralize(filtered.length, 'operação', 'operações')}
              {filtro !== 'todos' || term ? ' no filtro' : ` ${pluralize(filtered.length, 'cadastrada', 'cadastradas')}`}
            </p>
          </div>
          {filtro !== 'todos' || term ? (
            <button
              type="button"
              onClick={limparTudo}
              className="inline-flex min-h-9 items-center gap-1 rounded-pill px-3 text-xs font-semibold text-accent-600 hover:bg-accent-50"
            >
              <X aria-hidden="true" className="size-3.5" />
              Limpar filtros
            </button>
          ) : null}
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
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-pill bg-accent-600 px-4 text-sm font-medium text-white shadow-card transition-colors hover:bg-accent-700"
                >
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
            description={
              term
                ? `Nada encontrado para "${term}" neste filtro. Revise o termo buscado ou veja todos os times.`
                : 'Nenhum time neste filtro.'
            }
            action={
              <Button variant="secondary" onClick={limparTudo}>
                Ver todos os times
              </Button>
            }
          />
        ) : visao === 'lista' ? (
          <ListaDeTimes
            clients={filtered}
            ranking={ranking}
            onOpen={(c) => router.push(`/candidatos/${c.id}`)}
            {...acoes}
          />
        ) : (
          <div className={GRID}>
            {filtered.map((client, index) => (
              <ClientCard
                key={client.id}
                client={client}
                index={index}
                rank={ranking.get(client.id) ?? null}
                maxMembers={maxMembers}
                {...acoes}
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
      {duplicating ? (
        <DuplicateTeamDialog open client={duplicating} onClose={() => setDuplicating(null)} />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Pecas do heroi
   ------------------------------------------------------------------------- */

function Indicador({
  indice,
  icone,
  rotulo,
  valor,
  nota,
  forte = false,
  prefixo = '',
  progresso,
}: {
  indice: number;
  icone: ReactNode;
  rotulo: string;
  valor: number;
  nota: string;
  forte?: boolean;
  prefixo?: string;
  /** De 0 a 1: desenha um anel de progresso ao lado do numero. */
  progresso?: number;
}) {
  return (
    <div
      className={cn(
        'cmd-cascata group relative overflow-hidden rounded-control border px-3.5 py-3 transition-all duration-300 hover:-translate-y-0.5',
        forte ? 'border-white/25 bg-white/15' : 'border-white/10 bg-white/5 hover:bg-white/10',
      )}
      style={{ '--cmd-atraso': `${150 + indice * 80}ms` } as CSSProperties}
    >
      <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide text-white/70 uppercase">
        <span className="flex size-6 items-center justify-center rounded-full bg-white/10 text-accent-400 transition-transform duration-300 group-hover:scale-110">
          {icone}
        </span>
        <span className="wrap-break-word">{rotulo}</span>
      </dt>
      <dd className="mt-2 flex items-end justify-between gap-2">
        <span className={cn('leading-none font-bold tracking-tight', forte ? 'text-3xl' : 'text-2xl')}>
          {prefixo}
          <Contador valor={valor} duracao={1200} />
        </span>
        {progresso !== undefined ? <AnelPequeno fracao={progresso} /> : null}
      </dd>
      <dd className="mt-1 wrap-break-word text-[0.6875rem] text-white/60">{nota}</dd>
    </div>
  );
}

function AnelPequeno({ fracao }: { fracao: number }) {
  const raio = 14;
  const volta = 2 * Math.PI * raio;
  const pct = Math.round(Math.min(1, Math.max(0, fracao)) * 100);
  return (
    <span className="relative flex size-9 shrink-0 items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 36 36" className="size-full -rotate-90">
        <circle cx="18" cy="18" r={raio} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3.5" />
        <circle
          cx="18"
          cy="18"
          r={raio}
          fill="none"
          stroke="#4ade80"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={volta}
          strokeDashoffset={volta * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <span className="absolute text-[0.5625rem] font-bold tabular-nums">{pct}%</span>
    </span>
  );
}

/** O time que mais cresceu na semana, em destaque no heroi. */
function DestaqueDaSemana({ client }: { client: ClientSummary }) {
  return (
    <Link
      href={`/candidatos/${client.id}`}
      className="cmd-cascata group relative flex w-full shrink-0 items-center gap-3 overflow-hidden rounded-card border border-gold-400/40 bg-gradient-to-br from-gold-500/20 via-white/5 to-transparent p-3.5 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-gold-400/70 lg:w-80"
      style={{ '--cmd-atraso': '220ms' } as CSSProperties}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full bg-gold-400/25 blur-2xl transition-opacity group-hover:opacity-100"
      />
      <span className="relative shrink-0">
        {client.photo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={client.photo} alt="" className="size-12 rounded-full object-cover ring-2 ring-gold-400" />
        ) : (
          <span className="flex size-12 items-center justify-center rounded-full bg-navy-700 text-sm font-bold ring-2 ring-gold-400">
            {initials(client.name)}
          </span>
        )}
        <span className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-gold-400 text-navy-900 ring-2 ring-navy-800">
          <Flame aria-hidden="true" className="size-3" />
        </span>
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[0.625rem] font-bold tracking-[0.14em] text-gold-400 uppercase">
          Destaque da semana
        </span>
        <span className="block wrap-break-word text-sm font-semibold text-white">{client.name}</span>
        <span className="mt-0.5 flex items-center gap-1 text-xs text-white/75">
          <ArrowUpRight aria-hidden="true" className="size-3.5 text-success-400" />
          <b className="text-success-400 tabular-nums">+{formatNumber(client.memberCountLast7Days)}</b> em 7 dias
        </span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="relative size-4 shrink-0 text-white/60 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-white"
      />
    </Link>
  );
}

/* -------------------------------------------------------------------------
   Visao em lista
   ------------------------------------------------------------------------- */

function ListaDeTimes({
  clients,
  ranking,
  onOpen,
  onEdit,
  onDelete,
  onDuplicate,
  canDuplicate,
}: {
  clients: ClientSummary[];
  ranking: Map<string, number>;
  onOpen: (client: ClientSummary) => void;
  onEdit: (client: ClientSummary) => void;
  onDelete: (client: ClientSummary) => void;
  onDuplicate: (client: ClientSummary) => void;
  canDuplicate: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className="hidden grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,0.8fr))_minmax(0,1fr)_2.75rem] items-center gap-3 border-b border-line bg-ink-50 px-4 py-2 text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase md:grid">
        <span>Time</span>
        <span className="text-right">Integrantes</span>
        <span className="text-right">Este mês</span>
        <span className="text-right">7 dias</span>
        <span>Último cadastro</span>
        <span className="sr-only">Ações</span>
      </div>
      <ul className="divide-y divide-line">
        {clients.map((client, index) => {
          const posicao = ranking.get(client.id);
          return (
            <li
              key={client.id}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a,button,[role="menu"]')) return;
                onOpen(client);
              }}
              className="cmd-cascata grid cursor-pointer grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent-50/60 md:grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,0.8fr))_minmax(0,1fr)_2.75rem]"
              style={{ '--cmd-atraso': `${Math.min(index, 14) * 35}ms` } as CSSProperties}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative shrink-0">
                  {client.photo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={client.photo} alt="" className="size-10 rounded-full object-cover ring-1 ring-line" />
                  ) : (
                    <span className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-navy-800 to-navy-600 text-xs font-bold text-white">
                      {initials(client.name)}
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    title={client.invite.active ? 'Convite ativo' : 'Convite inativo'}
                    className={cn(
                      'absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-surface',
                      client.invite.active ? 'bg-success-600' : 'bg-danger-600',
                    )}
                  />
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/candidatos/${client.id}`}
                    className="block wrap-break-word text-sm font-semibold text-ink-900 hover:text-accent-700"
                  >
                    {posicao !== undefined ? (
                      <span className="mr-1 text-gold-600" aria-label={`${posicao + 1}º maior time`}>
                        {['🥇', '🥈', '🥉'][posicao]}
                      </span>
                    ) : null}
                    {client.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-ink-500">
                    {client.isDemo ? <DemoBadge /> : null}
                    {client.isCopy ? <CopyBadge sourceName={client.copyOf?.name} /> : null}
                    <span className="md:hidden">
                      <Users aria-hidden="true" className="mr-0.5 inline size-3" />
                      {formatNumber(client.memberCount)} · +{formatNumber(client.memberCountLast7Days)} em 7 dias
                    </span>
                    <span className="hidden md:inline">
                      {client.invite.active ? 'Convite ativo' : 'Convite inativo'}
                    </span>
                  </div>
                </div>
              </div>
              <span className="hidden text-right text-sm font-bold text-ink-900 tabular-nums md:block">
                {formatNumber(client.memberCount)}
              </span>
              <span className="hidden text-right text-sm text-ink-700 tabular-nums md:block">
                {formatNumber(client.memberCountThisMonth)}
              </span>
              <span
                className={cn(
                  'hidden text-right text-sm font-semibold tabular-nums md:block',
                  client.memberCountLast7Days > 0 ? 'text-success-700' : 'text-ink-400',
                )}
              >
                {client.memberCountLast7Days > 0 ? `+${formatNumber(client.memberCountLast7Days)}` : '0'}
              </span>
              <span className="hidden wrap-break-word text-xs text-ink-500 md:block">
                {client.lastMemberAt ? formatLastActivity(client.lastMemberAt) : 'Nenhum'}
              </span>
              <Menu
                label={`Ações de ${client.name}`}
                actions={acoesDoTime(client, {
                  onOpen: () => onOpen(client),
                  onEdit,
                  onDelete,
                  onDuplicate,
                  canDuplicate,
                })}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Ordenacao da lista. Menu proprio para caber o icone e o rotulo. */
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
        <span className="wrap-break-word">{current.label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 shrink-0 text-ink-500 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-56 animate-scale-in overflow-hidden rounded-control border border-line bg-surface py-1 shadow-overlay"
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
                'flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm transition-colors hover:bg-ink-100',
                option.id === value ? 'font-semibold text-accent-700' : 'text-ink-700',
              )}
            >
              {option.label}
              {option.id === value ? <Check aria-hidden="true" className="size-4" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
