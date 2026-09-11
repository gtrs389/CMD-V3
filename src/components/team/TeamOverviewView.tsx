'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Clock3, FileText, ListChecks, TrendingUp, UsersRound } from 'lucide-react';
import type { FieldOption, Member, TeamOverview } from '@/lib/types';
import {
  RELATIONSHIP_COLOR_CLASSES,
  relationshipColor,
  relationshipLabel,
} from '@/lib/domain/relationship';
import { FIELD_TYPE_LABELS } from '@/lib/domain/form-config';
import { byNewest, formatLastActivity, formatRelative, startOfMonthIso } from '@/lib/utils/date';
import { formatNumber, initials, pluralize } from '@/lib/utils/text';
import { formatPhone } from '@/lib/utils/phone';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { TeamChart, type TeamChartPoint } from '@/components/clients/TeamChart';
import { useTeamOverview } from '@/hooks/use-team';
import { PersonalLinkCard } from './PersonalLinkCard';
import { TeamHeader } from './TeamHeader';
import { TeamMemberSheet } from './TeamMemberSheet';

/** Abreviacao dos dias, na ordem devolvida por `getDay()`. */
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const RECENT_LIMIT = 5;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Minha mobilizacao.
 *
 * Mesmo desenho da pagina do candidato, com o escopo do integrante: todos os
 * numeros, o grafico e as listas contam apenas quem se cadastrou pelo link
 * dele. O servidor ja devolve so isso, entao nao ha filtro de tela que
 * mostre mais.
 */
export function TeamOverviewView() {
  const { data: overview, loading, error, reload } = useTeamOverview();

  if (loading) return <OverviewSkeleton />;

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
      >
        <p>{error}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!overview) return null;

  return (
    <div className="space-y-3">
      <TeamHeader overview={overview} />
      <TeamStats overview={overview} />
    </div>
  );
}

function TeamStats({ overview }: { overview: TeamOverview }) {
  // Instante fixo do render: mantem os recortes de tempo coerentes entre si.
  const [now] = useState(() => new Date());
  const members = overview.members;

  const stats = useMemo(() => {
    const today = startOfDay(now);
    const monthStart = startOfMonthIso(now);
    const week = now.getTime() - 7 * 86_400_000;
    const previousWeek = now.getTime() - 14 * 86_400_000;

    const dayCounts = new Map<number, number>();
    let hoje = 0;
    let mes = 0;
    let ultimos7 = 0;
    let anteriores7 = 0;

    for (const member of members) {
      const created = new Date(member.createdAt).getTime();
      if (Number.isNaN(created)) continue;

      const day = startOfDay(new Date(created));
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
      if (day === today) hoje += 1;
      if (member.createdAt >= monthStart) mes += 1;
      if (created >= week) ultimos7 += 1;
      else if (created >= previousWeek) anteriores7 += 1;
    }

    const serie: TeamChartPoint[] = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today - (6 - index) * 86_400_000);
      return {
        label: WEEKDAYS[day.getDay()],
        value: dayCounts.get(day.getTime()) ?? 0,
      };
    });

    const variacao =
      anteriores7 === 0
        ? ultimos7 > 0
          ? 100
          : 0
        : Math.round(((ultimos7 - anteriores7) / anteriores7) * 100);

    const recentes = [...members].sort(byNewest).slice(0, RECENT_LIMIT);

    return {
      hoje,
      mes,
      ultimos7,
      variacao,
      serie,
      recentes,
      ultimo: recentes[0] ?? null,
    };
  }, [members, now]);

  const relationshipOptions: FieldOption[] = useMemo(
    () => overview.form.fields.find((field) => field.systemKey === 'relationship')?.options ?? [],
    [overview.form.fields],
  );

  const total = members.length;
  const restantes = total - stats.recentes.length;

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <MobilizationCard
          total={total}
          mes={stats.mes}
          serie={stats.serie}
          recentes={stats.recentes}
          restantes={restantes}
        />

        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              icon={<BarChart3 aria-hidden="true" className="size-[1.125rem]" />}
              tone="accent"
              label="Cadastros hoje"
              value={stats.hoje}
              hint={
                <span className="flex items-center gap-1">
                  <Clock3 aria-hidden="true" className="size-3 shrink-0" />
                  {stats.ultimo
                    ? `Último ${formatRelative(stats.ultimo.createdAt)}`
                    : 'Nenhum cadastro ainda'}
                </span>
              }
            />

            <StatCard
              icon={<TrendingUp aria-hidden="true" className="size-[1.125rem]" />}
              tone="success"
              label="Últimos 7 dias"
              value={stats.ultimos7}
              badge={`${stats.variacao >= 0 ? '+' : ''}${formatNumber(stats.variacao)}%`}
              hint="em relação à semana anterior"
            />
          </div>

          <PersonalLinkCard invite={overview.invite} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <MyTeamCard members={members} options={relationshipOptions} />
        <FormReadOnlyCard overview={overview} />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------
   Cartao azul-marinho da propria mobilizacao
   ------------------------------------------------------------------------- */

function MobilizationCard({
  total,
  mes,
  serie,
  recentes,
  restantes,
}: {
  total: number;
  mes: number;
  serie: TeamChartPoint[];
  recentes: Member[];
  restantes: number;
}) {
  return (
    <section
      aria-labelledby="minha-mobilizacao"
      className="rounded-card bg-navy-900 p-4 text-white shadow-overlay sm:p-5"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:items-start">
        <div className="min-w-0">
          <h2
            id="minha-mobilizacao"
            className="flex items-center gap-2 text-[0.8125rem] font-semibold"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-control bg-navy-700"
            >
              <UsersRound className="size-[1.125rem]" />
            </span>
            Cadastrados por mim
          </h2>

          <p className="mt-3 text-[2.75rem] leading-none font-bold tracking-tight">
            {formatNumber(total)}
          </p>
          <p className="mt-2 text-sm font-semibold text-emerald-400">
            +{formatNumber(mes)} neste mês
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-xs text-navy-300">Novos cadastros (últimos 7 dias)</p>
          <div className="mt-2">
            <TeamChart points={serie} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {recentes.length > 0 ? (
          <div className="flex items-center">
            <ul className="flex -space-x-2">
              {recentes.map((member) => (
                <li key={member.id} title={member.name}>
                  {member.photo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={member.photo}
                      alt={`Foto de ${member.name}`}
                      className="size-8 rounded-full object-cover ring-2 ring-navy-900"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex size-8 items-center justify-center rounded-full bg-navy-600 text-[0.625rem] font-semibold text-white ring-2 ring-navy-900"
                    >
                      {initials(member.name)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {restantes > 0 ? (
              <span className="ml-2 rounded-pill bg-navy-700 px-2 py-1 text-[0.6875rem] font-semibold text-navy-200">
                +{formatNumber(restantes)}
              </span>
            ) : null}
          </div>
        ) : null}

        <p className="text-xs text-navy-300">
          {total === 0
            ? 'Compartilhe seu link para receber os primeiros cadastros.'
            : mes > 0
              ? 'Sua equipe continua crescendo'
              : 'Nenhum cadastro novo neste mês'}
        </p>
      </div>
    </section>
  );
}

function StatCard({
  icon,
  tone,
  label,
  value,
  badge,
  hint,
}: {
  icon: React.ReactNode;
  tone: 'accent' | 'success';
  label: string;
  value: number;
  badge?: string;
  hint: React.ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-card border border-line bg-surface p-3.5 text-left shadow-card">
      <span
        aria-hidden="true"
        className={
          tone === 'accent'
            ? 'flex size-9 shrink-0 items-center justify-center rounded-control bg-accent-50 text-accent-600'
            : 'flex size-9 shrink-0 items-center justify-center rounded-control bg-success-50 text-success-600'
        }
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[0.6875rem] font-medium text-ink-500">{label}</span>
        <span className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-[1.75rem] leading-none font-bold tracking-tight text-ink-900">
            {formatNumber(value)}
          </span>
          {badge ? <span className="text-xs font-semibold text-success-600">{badge}</span> : null}
        </span>
        <span className="mt-1 block truncate text-[0.6875rem] text-ink-500">{hint}</span>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Minha equipe
   ------------------------------------------------------------------------- */

function RelationshipTag({ member, options }: { member: Member; options: FieldOption[] }) {
  const label = relationshipLabel(options, member.relationshipOptionId, member.relationshipLabel);
  if (!label) return <span className="text-xs text-ink-400">--</span>;

  const option = options.find((item) => item.id === member.relationshipOptionId);
  const classes = RELATIONSHIP_COLOR_CLASSES[option ? relationshipColor(option) : 'rose'];

  return (
    <span
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[0.6875rem] font-medium whitespace-nowrap ${classes}`}
    >
      {label}
    </span>
  );
}

/**
 * Lista dos recrutados diretos.
 *
 * Ficha basica apenas: nome, contato e data. Dados de aparelho, respostas
 * privadas da FonteData e mapa nao aparecem para o perfil EQUIPE, nem aqui
 * nem em rota nenhuma.
 */
function MyTeamCard({ members, options }: { members: Member[]; options: FieldOption[] }) {
  const ordered = useMemo(() => [...members].sort(byNewest), [members]);
  const [viewing, setViewing] = useState<Member | null>(null);

  return (
    <section
      aria-labelledby="minha-equipe"
      className="flex h-full flex-col rounded-card border border-line bg-surface shadow-card"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2
          id="minha-equipe"
          className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-900"
        >
          <UsersRound aria-hidden="true" className="size-4 text-accent-600" />
          Minha equipe
        </h2>
        <span className="rounded-pill bg-accent-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-700 tabular-nums">
          {formatNumber(ordered.length)}
        </span>
      </div>

      {ordered.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 pb-5 text-center text-sm text-ink-500">
          Ninguém se cadastrou pelo seu link ainda.
        </p>
      ) : (
        <>
          {/* Tabela a partir de `sm`; no celular a mesma informação vira lista,
              sem rolagem horizontal. */}
          <div className="hidden flex-1 flex-col px-1 pb-2 sm:flex">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {['Nome', 'Contato', 'Vínculo', 'Cadastrado em'].map((coluna) => (
                    <th
                      key={coluna}
                      scope="col"
                      className="px-3 pb-2 text-[0.6875rem] font-medium text-ink-500"
                    >
                      {coluna}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordered.map((member) => (
                  <tr
                    key={member.id}
                    tabIndex={0}
                    aria-label={`Ver ficha de ${member.name}`}
                    onClick={() => setViewing(member)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setViewing(member);
                      }
                    }}
                    className="cursor-pointer border-b border-line transition-colors last:border-0 hover:bg-ink-50"
                  >
                    <td className="px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2">
                        {member.photo ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={member.photo}
                            alt={`Foto de ${member.name}`}
                            className="size-7 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[0.625rem] font-semibold text-ink-500"
                          >
                            {initials(member.name)}
                          </span>
                        )}
                        <span className="truncate text-xs font-semibold text-ink-900">
                          {member.name}
                        </span>
                      </span>
                    </td>
                    <td className="truncate px-3 py-2.5 text-xs text-ink-500">
                      {member.phone ? formatPhone(member.phone) : (member.email ?? '--')}
                    </td>
                    <td className="px-3 py-2.5">
                      <RelationshipTag member={member} options={options} />
                    </td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap text-ink-500">
                      {formatLastActivity(member.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex-1 divide-y divide-line px-4 pb-3 sm:hidden">
            {ordered.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  onClick={() => setViewing(member)}
                  aria-label={`Ver ficha de ${member.name}`}
                  className="flex w-full items-start gap-2.5 py-3 text-left"
                >
                  {member.photo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={member.photo}
                      alt={`Foto de ${member.name}`}
                      className="size-9 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[0.625rem] font-semibold text-ink-500"
                    >
                      {initials(member.name)}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{member.name}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {member.phone ? formatPhone(member.phone) : (member.email ?? '--')}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {formatLastActivity(member.createdAt)}
                    </p>
                  </div>

                  <RelationshipTag member={member} options={options} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <TeamMemberSheet
        open={viewing !== null}
        member={viewing}
        options={options}
        onClose={() => setViewing(null)}
      />
    </section>
  );
}

/* -------------------------------------------------------------------------
   Formulario (somente visualizacao)
   ------------------------------------------------------------------------- */

function FormReadOnlyCard({ overview }: { overview: TeamOverview }) {
  const fields = [...overview.form.fields].sort((a, b) => a.order - b.order);
  const ativos = fields.filter((field) => field.enabled);

  return (
    <section
      aria-labelledby="formulario-da-equipe"
      className="flex h-full flex-col rounded-card border border-line bg-surface shadow-card"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2
          id="formulario-da-equipe"
          className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-900"
        >
          <FileText aria-hidden="true" className="size-4 text-accent-600" />
          Formulário do cadastro
        </h2>
        <Badge tone="neutral">Somente leitura</Badge>
      </div>

      <p className="px-4 text-[0.6875rem] text-ink-500">
        {formatNumber(ativos.length)} {pluralize(ativos.length, 'campo ativo', 'campos ativos')},
        configurados por {overview.candidateName}.
      </p>

      <ul className="mt-2 flex-1 divide-y divide-line px-4 pb-3">
        {ativos.map((field) => (
          <li key={field.id} className="flex items-center gap-3 py-2.5">
            <ListChecks aria-hidden="true" className="size-4 shrink-0 text-ink-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink-900">{field.label}</p>
              <p className="text-xs text-ink-500">{FIELD_TYPE_LABELS[field.type]}</p>
            </div>
            {field.required ? <Badge tone="brand">Obrigatório</Badge> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-3">
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-card" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Skeleton className="h-56 rounded-card" />
        <Skeleton className="h-56 rounded-card" />
      </div>
    </div>
  );
}
