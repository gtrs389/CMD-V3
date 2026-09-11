'use client';

import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  Link2,
  TrendingUp,
  UsersRound,
} from 'lucide-react';
import type { Client, FieldOption, Member } from '@/lib/types';
import {
  RELATIONSHIP_COLOR_CLASSES,
  relationshipColor,
  relationshipLabel,
} from '@/lib/domain/relationship';
import { copyText } from '@/lib/utils/clipboard';
import { byNewest, formatLastActivity, formatRelative, startOfMonthIso } from '@/lib/utils/date';
import { formatNumber, initials, pluralize } from '@/lib/utils/text';
import { invitePath } from '@/lib/utils/url';
import { useOrigin } from '@/hooks/use-origin';
import { useSession } from '@/components/layout/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { TeamChart, type TeamChartPoint } from './TeamChart';

/** Abreviacao dos dias, na ordem devolvida por `getDay()`. */
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Numero de pessoas exibidas na pilha de fotos e na lista inferior. */
const RECENT_LIMIT = 5;

interface ClientOverviewPanelProps {
  client: Client;
  members: Member[];
  /** Abre outra aba da propria pagina. */
  onOpenTab: (tab: 'equipe' | 'formulario' | 'convite') => void;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Visao geral do candidato.
 *
 * Todos os numeros vem dos cadastros reais da equipe e da configuracao do
 * formulario: nada aqui e estimado.
 */
export function ClientOverviewPanel({ client, members, onOpenTab }: ClientOverviewPanelProps) {
  // Instante fixo do render: mantem os recortes de tempo coerentes entre si.
  const [now] = useState(() => new Date());

  // Perfil somente leitura apenas consulta: os atalhos mudam de rotulo.
  const { can } = useSession();
  const podeGerenciarConvite = can('invite.manage');
  const podeEditarFormulario = can('form.manage');

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

      dayCounts.set(startOfDay(new Date(created)), (dayCounts.get(startOfDay(new Date(created))) ?? 0) + 1);
      if (startOfDay(new Date(created)) === today) hoje += 1;
      if (member.createdAt >= monthStart) mes += 1;
      if (created >= week) ultimos7 += 1;
      else if (created >= previousWeek) anteriores7 += 1;
    }

    const serie: TeamChartPoint[] = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today - (6 - index) * 86_400_000);
      return { label: WEEKDAYS[day.getDay()], value: dayCounts.get(day.getTime()) ?? 0 };
    });

    const variacao =
      anteriores7 === 0 ? (ultimos7 > 0 ? 100 : 0) : Math.round(((ultimos7 - anteriores7) / anteriores7) * 100);

    const recentes = [...members].sort(byNewest).slice(0, RECENT_LIMIT);

    return { hoje, mes, ultimos7, variacao, serie, recentes, ultimo: recentes[0] ?? null };
  }, [members, now]);

  const total = members.length;
  const restantes = total - stats.recentes.length;

  const relationshipOptions: FieldOption[] = useMemo(
    () => client.form.fields.find((field) => field.systemKey === 'relationship')?.options ?? [],
    [client.form.fields],
  );

  const form = useMemo(() => {
    const fields = client.form.fields;
    const ativos = fields.filter((field) => field.enabled);
    const obrigatorios = ativos.filter((field) => field.required).length;
    const percentual = fields.length === 0 ? 0 : Math.round((ativos.length / fields.length) * 100);
    return { ativos: ativos.length, obrigatorios, percentual };
  }, [client.form.fields]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <TeamCard
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
                  {stats.ultimo ? `Último ${formatRelative(stats.ultimo.createdAt)}` : 'Nenhum cadastro ainda'}
                </span>
              }
              onOpen={() => onOpenTab('equipe')}
            />

            <StatCard
              icon={<TrendingUp aria-hidden="true" className="size-[1.125rem]" />}
              tone="success"
              label="Últimos 7 dias"
              value={stats.ultimos7}
              badge={`${stats.variacao >= 0 ? '+' : ''}${formatNumber(stats.variacao)}%`}
              hint="em relação à semana anterior"
              onOpen={() => onOpenTab('equipe')}
            />
          </div>

          <InviteCard
            client={client}
            canManage={podeGerenciarConvite}
            onManage={() => onOpenTab('convite')}
          />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <RecentMembersCard
          members={stats.recentes}
          options={relationshipOptions}
          onOpenTeam={() => onOpenTab('equipe')}
        />

        <FormCard
          ativos={form.ativos}
          obrigatorios={form.obrigatorios}
          percentual={form.percentual}
          canEdit={podeEditarFormulario}
          onEdit={() => onOpenTab('formulario')}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Cartao azul-marinho da equipe
   ------------------------------------------------------------------------- */

function TeamCard({
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
      aria-labelledby="equipe-cadastrada"
      className="rounded-card bg-navy-900 p-4 text-white shadow-overlay sm:p-5"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] sm:items-start">
        <div className="min-w-0">
          <h2 id="equipe-cadastrada" className="flex items-center gap-2 text-[0.8125rem] font-semibold">
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-control bg-navy-700"
            >
              <UsersRound className="size-[1.125rem]" />
            </span>
            Equipe cadastrada
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
            ? 'Nenhum integrante cadastrado ainda.'
            : mes > 0
              ? 'A equipe continua crescendo'
              : 'Nenhum cadastro novo neste mês'}
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------
   Indicadores
   ------------------------------------------------------------------------- */

function StatCard({
  icon,
  tone,
  label,
  value,
  badge,
  hint,
  onOpen,
}: {
  icon: React.ReactNode;
  tone: 'accent' | 'success';
  label: string;
  value: number;
  badge?: string;
  hint: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}: ${formatNumber(value)}. Ver equipe`}
      className="flex min-h-11 items-center gap-3 rounded-card border border-line bg-surface p-3.5 text-left shadow-card transition-colors hover:bg-ink-50"
    >
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
          {badge ? (
            <span className="text-xs font-semibold text-success-600">{badge}</span>
          ) : null}
        </span>
        <span className="mt-1 block truncate text-[0.6875rem] text-ink-500">{hint}</span>
      </span>

      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-400" />
    </button>
  );
}

/* -------------------------------------------------------------------------
   Link de convite
   ------------------------------------------------------------------------- */

function InviteCard({
  client,
  canManage,
  onManage,
}: {
  client: Client;
  canManage: boolean;
  onManage: () => void;
}) {
  const toast = useToast();
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);

  // O endereco vem do banco a cada carregamento: o link continua disponivel
  // entre sessoes e aparelhos. Sem token (convite anterior ao link pessoal),
  // nada e exibido e nada e inventado.
  const path = client.invite.token ? invitePath(client.invite.token) : null;
  const url = path ? (origin ? `${origin}${path}` : path) : '';

  async function handleCopy() {
    if (!url) return;
    const ok = await copyText(url);
    if (!ok) {
      toast.error('Não foi possível copiar. Selecione o texto manualmente.');
      return;
    }
    setCopied(true);
    toast.success('Link copiado.');
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section
      aria-labelledby="link-de-convite"
      className="rounded-card border border-line bg-surface p-3.5 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-control bg-accent-50 text-accent-600"
        >
          <Link2 className="size-[1.125rem]" />
        </span>
        <h2 id="link-de-convite" className="text-[0.8125rem] font-semibold text-ink-900">
          Meu link de cadastro
        </h2>
        <span
          className={
            client.invite.active
              ? 'inline-flex items-center gap-1.5 rounded-pill bg-success-50 px-2 py-1 text-[0.6875rem] font-medium text-success-600'
              : 'inline-flex items-center gap-1.5 rounded-pill bg-danger-50 px-2 py-1 text-[0.6875rem] font-medium text-danger-600'
          }
        >
          <span
            aria-hidden="true"
            className={
              client.invite.active
                ? 'size-1.5 rounded-full bg-success-600'
                : 'size-1.5 rounded-full bg-danger-600'
            }
          />
          {client.invite.active ? 'Ativo' : 'Inativo'}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        {path ? (
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-control border border-line bg-ink-50 pr-1 pl-3">
            <input
              readOnly
              value={url}
              aria-label="Meu link de cadastro"
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-11 w-full min-w-0 bg-transparent font-mono text-xs text-ink-700 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copiar meu link de cadastro"
              className="flex size-11 shrink-0 items-center justify-center rounded-control text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              {copied ? (
                <Check aria-hidden="true" className="size-4 text-success-600" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
        ) : (
          <p className="flex min-h-11 min-w-0 flex-1 items-center rounded-control border border-line bg-ink-50 px-3 text-xs text-ink-500">
            Link ainda não disponível.
          </p>
        )}

        <button
          type="button"
          onClick={onManage}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control bg-accent-600 px-4 text-sm font-medium text-white transition-colors hover:bg-accent-700"
        >
          {canManage ? 'Gerenciar link' : 'Ver link'}
        </button>
      </div>

      <p className="mt-2 text-[0.6875rem] text-ink-500">
        {client.invite.active
          ? 'Quem se cadastrar por este link entra na sua equipe.'
          : 'Recrutamento desativado: nenhum link aceita cadastros no momento.'}
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------
   Ultimos integrantes
   ------------------------------------------------------------------------- */

function memberPlace(member: Member): string {
  const cidade = [member.city, member.state].filter(Boolean).join('/');
  return [member.district, cidade].filter(Boolean).join(', ') || '--';
}

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

function RecentMembersCard({
  members,
  options,
  onOpenTeam,
}: {
  members: Member[];
  options: FieldOption[];
  onOpenTeam: () => void;
}) {
  return (
    <section
      aria-labelledby="ultimos-integrantes"
      className="flex h-full flex-col rounded-card border border-line bg-surface shadow-card"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2
          id="ultimos-integrantes"
          className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-900"
        >
          <UsersRound aria-hidden="true" className="size-4 text-accent-600" />
          Últimos integrantes
        </h2>

        <button
          type="button"
          onClick={onOpenTeam}
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-accent-600 transition-colors hover:text-accent-700"
        >
          Ver equipe
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </button>
      </div>

      {members.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 pb-5 text-center text-sm text-ink-500">
          Nenhum integrante cadastrado ainda.
        </p>
      ) : (
        <>
          {/* Tabela a partir de `sm`; no celular a mesma informação vira lista. */}
          <div className="hidden flex-1 flex-col px-1 pb-2 sm:flex">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {['Nome', 'Vínculo', 'Localização', 'Cadastrado em'].map((coluna) => (
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
                {members.map((member) => (
                  <tr key={member.id} className="border-b border-line last:border-0">
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
                    <td className="px-3 py-2.5">
                      <RelationshipTag member={member} options={options} />
                    </td>
                    <td className="truncate px-3 py-2.5 text-xs text-ink-500">
                      {memberPlace(member)}
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
            {members.map((member) => (
              <li key={member.id} className="flex items-start gap-2.5 py-3">
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
                  <p className="mt-0.5 truncate text-xs text-ink-500">{memberPlace(member)}</p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {formatLastActivity(member.createdAt)}
                  </p>
                </div>

                <RelationshipTag member={member} options={options} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------
   Formulario de cadastro
   ------------------------------------------------------------------------- */

/** Anel proporcional ao percentual de campos ativos. */
function FormRing({ percentual }: { percentual: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, percentual)) / 100) * circumference;

  return (
    <div className="relative size-28">
      <svg viewBox="0 0 100 100" role="img" aria-label={`${percentual}% do formulário configurado`}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--color-ink-100)" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--color-success-600)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          transform="rotate(-90 50 50)"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-xl leading-none font-bold text-ink-900">{percentual}%</p>
        <p className="mt-1 text-[0.625rem] text-ink-500">configurado</p>
      </div>
    </div>
  );
}

function FormCard({
  ativos,
  obrigatorios,
  percentual,
  canEdit,
  onEdit,
}: {
  ativos: number;
  obrigatorios: number;
  percentual: number;
  canEdit: boolean;
  onEdit: () => void;
}) {
  return (
    <section
      aria-labelledby="formulario-de-cadastro"
      className="flex h-full flex-col rounded-card border border-line bg-surface shadow-card"
    >
      <div className="px-4 py-3">
        <h2
          id="formulario-de-cadastro"
          className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-900"
        >
          <FileText aria-hidden="true" className="size-4 text-accent-600" />
          Formulário de cadastro
        </h2>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
        <FormRing percentual={percentual} />

        <dl className="grid w-full grid-cols-2 gap-3 text-center">
          <div>
            <dt className="sr-only">Campos ativos</dt>
            <dd>
              <span className="block text-xl leading-none font-bold text-ink-900">
                {formatNumber(ativos)}
              </span>
              <span className="mt-1 block text-[0.6875rem] text-ink-500">
                {pluralize(ativos, 'campo ativo', 'campos ativos')}
              </span>
            </dd>
          </div>
          <div>
            <dt className="sr-only">Campos obrigatórios</dt>
            <dd>
              <span className="block text-xl leading-none font-bold text-ink-900">
                {formatNumber(obrigatorios)}
              </span>
              <span className="mt-1 block text-[0.6875rem] text-ink-500">
                {pluralize(obrigatorios, 'obrigatório', 'obrigatórios')}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="p-4">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-accent-50 px-4 text-sm font-semibold text-accent-700 transition-colors hover:bg-accent-100"
        >
          {canEdit ? 'Editar formulário' : 'Ver formulário'}
          <ArrowRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </section>
  );
}
