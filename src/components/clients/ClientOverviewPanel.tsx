'use client';

import { contandoUmaVez, diagnosticar, municipioDaOperacao } from '@/lib/domain/inconsistencias';
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
  ShieldCheck,
  Trophy,
  TrendingUp,
  UserCheck,
  Users,
  UsersRound,
} from 'lucide-react';
import type { Client, FieldOption, Member } from '@/lib/types';
import {
  RELATIONSHIP_COLOR_CLASSES,
  relationshipColor,
  relationshipLabel,
} from '@/lib/domain/relationship';
import { ALAGOAS_CENTER } from '@/lib/domain/demo-catalog';
import { inviteIsLive } from '@/lib/domain/invite-expiration';
import { copyText } from '@/lib/utils/clipboard';
import { byNewest, formatLastActivity, formatRelative, startOfMonthIso } from '@/lib/utils/date';
import { formatNumber, initials, pluralize } from '@/lib/utils/text';
import { invitePath } from '@/lib/utils/url';
import { useOrigin } from '@/hooks/use-origin';
import { useNavegador } from '@/components/members/NavegadorDePessoas';
import { TagDoLider } from '@/components/members/TagDoLider';
import { useSession } from '@/components/layout/SessionProvider';
import { useToast } from '@/components/ui/Toast';
import { MobilizationMap } from '@/components/dashboard/MobilizationMap';
import { TeamChart, type TeamChartPoint } from './TeamChart';
import { LiderNoMapa } from './LiderNoMapa';
import { BotaoDePdf } from '@/components/dashboard/BotaoDePdf';
import { baixarPdfDoRankingDeLideres } from '@/components/dashboard/pdf-do-mapa';
import { Reveal } from '@/components/ui/Reveal';
import { Contador } from '@/components/ui/Contador';
import { cn } from '@/lib/utils/cn';

/** Abreviacao dos dias, na ordem devolvida por `getDay()`. */
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Numero de pessoas exibidas na pilha de fotos e na lista inferior. */
const RECENT_LIMIT = 5;

interface ClientOverviewPanelProps {
  client: Client;
  members: Member[];
  /** Abre outra aba da propria pagina. */
  onOpenTab: (tab: 'equipe') => void;
  /**
   * Abre a area interna do formulario. So e passado a quem tem `form.view`
   * (ADMIN): sem ele o cartao "Formulário de cadastro" nao existe, e a
   * configuracao dos campos tambem nao chega do servidor.
   */
  onOpenForm?: () => void;
  /**
   * Exibe o cartao "Meu link de cadastro". Na pagina do time ele sai:
   * o link fica no botao do cabecalho, ao lado do nome.
   */
  showInviteCard?: boolean;
  /** Abre o link de cadastro. Sem ele o cartao nao oferece a acao. */
  onManageInvite?: () => void;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Visao geral do time.
 *
 * Todos os numeros vem dos cadastros reais da equipe: nada aqui e estimado.
 * O cartao "Formulário de cadastro" e a unica parte exclusiva do ADMIN; sem
 * ele os cartoes restantes se reorganizam e nao fica vao vazio.
 */
export function ClientOverviewPanel({
  client,
  members: todos,
  onOpenTab,
  onOpenForm,
  showInviteCard = true,
  onManageInvite,
}: ClientOverviewPanelProps) {
  // Instante fixo do render: mantem os recortes de tempo coerentes entre si.
  const [now] = useState(() => new Date());
  // Para CONTAR: a mesma pessoa cadastrada duas vezes pelo mesmo Lider conta
  // uma vez — no total, nos Liderados e no ranking.
  const members = useMemo(() => contandoUmaVez(todos), [todos]);

  // Perfil somente leitura apenas consulta: os atalhos mudam de rotulo.
  const { can, user } = useSession();
  const podeGerenciarConvite = can('invite.manage');
  const podeVerMapa = can('map.view');
  // Area interna do formulario: exclusiva do ADMIN. Sem `form.view` o cartao
  // nao aparece, e nenhuma contagem de campos ativos ou obrigatorios e
  // calculada, porque a configuracao nem vem na resposta.
  const podeVerFormulario = can('form.view') && onOpenForm !== undefined;
  const podeEditarFormulario = can('form.manage');
  // O ranking e dos Lideres, e quem o le e quem administra o time. Na pagina
  // do proprio Lider a lista e a Equipe dele, que nao cadastra ninguem: o
  // quadro so mostraria zeros.
  const mostrarRanking = user?.role !== 'EQUIPE';
  /** O Lider clicado no ranking: o painel dele abre por cima, pela pilha. */
  const navegador = useNavegador();

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
      // Da planilha sem "DATA DE CADASTRO": conta no total, nunca em "hoje".
      if (member.semDataDeCadastro) continue;
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

    const recentes = members.filter((member) => !member.semDataDeCadastro).sort(byNewest).slice(0, RECENT_LIMIT);

    return { hoje, mes, ultimos7, variacao, serie, recentes, ultimo: recentes[0] ?? null };
  }, [members, now]);

  const total = members.length;
  const restantes = total - stats.recentes.length;

  /**
   * A estrutura do time em tres numeros: quem administra, os Lideres e os
   * Liderados (a Equipe dos Lideres). Sai da MESMA lista da pagina — no time
   * duplicado com a planilha do Sheets ligada, ja com a Equipe lida dela.
   */
  const estrutura = useMemo(() => {
    const lideres = members.filter((member) => member.tier === 'LIDER');
    const liderados = members.length - lideres.length;
    const comEquipe = new Set(
      members
        .filter((member) => member.tier === 'EQUIPE' && member.recruitedBy?.userId)
        .map((member) => member.recruitedBy!.userId as string),
    );
    return {
      administradores: client.people.length,
      lideres: lideres.length,
      lideresComEquipe: lideres.filter((lider) => lider.userId && comEquipe.has(lider.userId)).length,
      liderados,
      media: lideres.length > 0 ? Math.round((liderados / lideres.length) * 10) / 10 : 0,
    };
  }, [members, client.people.length]);

  /**
   * Ranking dos Lideres.
   *
   * As linhas sao os LIDERES deste time — todos eles, inclusive quem ainda
   * nao trouxe ninguem, que aparece com zero. O que cada um soma e a
   * quantidade de gente cadastrada por ele (a Equipe dele), lida do
   * snapshot de origem. Quem e da Equipe fica de fora: nao cadastra
   * ninguem, e apareceria sempre em zero, como se estivesse devendo. O
   * cadastro trazido por quem administra o time tambem nao entra, porque
   * este quadro e dos Lideres.
   */
  const ranking = useMemo<RankingRow[]>(() => {
    const porResponsavel = new Map<string, number>();
    for (const member of members) {
      const userId = member.recruitedBy?.userId;
      if (userId) porResponsavel.set(userId, (porResponsavel.get(userId) ?? 0) + 1);
    }

    return members
      .filter((member) => member.tier === 'LIDER')
      .map((member) => ({
        key: member.id,
        userId: member.userId,
        name: member.name,
        tag: member.tag,
        photo: member.photo,
        count: member.userId ? (porResponsavel.get(member.userId) ?? 0) : 0,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
  }, [members]);

  const relationshipOptions: FieldOption[] = useMemo(
    () => client.form.fields.find((field) => field.systemKey === 'relationship')?.options ?? [],
    [client.form.fields],
  );

  const form = useMemo(() => {
    if (!podeVerFormulario) return null;
    const fields = client.form.fields;
    const ativos = fields.filter((field) => field.enabled);
    const obrigatorios = ativos.filter((field) => field.required).length;
    const percentual = fields.length === 0 ? 0 : Math.round((ativos.length / fields.length) * 100);
    return { ativos: ativos.length, obrigatorios, percentual };
  }, [client.form.fields, podeVerFormulario]);

  // O mesmo diagnostico do quadro de Inconsistencias: e dele que o pino de
  // cada Lider tira "quantos para corrigir" e o PDF.
  const diagnostico = useMemo(
    () =>
      podeVerMapa && mostrarRanking
        ? diagnosticar(
            todos,
            municipioDaOperacao({ stateUf: client.stateUf, cities: client.cities }),
            client.inconsistenciasDesligadas ?? [],
          )
        : null,
    [todos, client.stateUf, client.cities, client.inconsistenciasDesligadas, podeVerMapa, mostrarRanking],
  );

  /** O que o balao do pino de um Lider mostra no mapa. */
  const acoesDoLider = diagnostico
    ? (memberId: string) => (
        <LiderNoMapa
          memberId={memberId}
          members={todos}
          diagnostico={diagnostico}
          clientName={client.name}
          onVerEquipe={navegador ? (id) => navegador.abrirLider(id) : undefined}
        />
      )
    : undefined;

  // Os indicadores, numa faixa so: a estrutura do time e o ritmo de cadastro.
  const indicadores = [
    ...(mostrarRanking
      ? [
          {
            icon: <ShieldCheck aria-hidden="true" className="size-[1.125rem]" />,
            tone: 'brand' as const,
            label: 'Administradores',
            value: estrutura.administradores,
            hint:
              estrutura.administradores === 1 ? 'administra o time' : 'administram o time',
          },
          {
            icon: <UserCheck aria-hidden="true" className="size-[1.125rem]" />,
            tone: 'accent' as const,
            label: 'Líderes',
            value: estrutura.lideres,
            hint:
              estrutura.lideres === 0
                ? 'nenhum Líder ainda'
                : `${formatNumber(estrutura.lideresComEquipe)} com Equipe`,
          },
          {
            icon: <Users aria-hidden="true" className="size-[1.125rem]" />,
            tone: 'success' as const,
            label: 'Liderados',
            value: estrutura.liderados,
            hint: estrutura.lideres === 0 ? 'a Equipe dos Líderes' : `média de ${formatNumber(estrutura.media)} por Líder`,
          },
        ]
      : []),
    {
      icon: <BarChart3 aria-hidden="true" className="size-[1.125rem]" />,
      tone: 'accent' as const,
      label: 'Cadastros hoje',
      value: stats.hoje,
      hint: (
        <span className="flex items-center gap-1">
          <Clock3 aria-hidden="true" className="size-3 shrink-0" />
          {stats.ultimo ? `Último ${formatRelative(stats.ultimo.createdAt)}` : 'Nenhum cadastro ainda'}
        </span>
      ),
    },
    {
      icon: <TrendingUp aria-hidden="true" className="size-[1.125rem]" />,
      tone: 'success' as const,
      label: 'Últimos 7 dias',
      value: stats.ultimos7,
      badge: `${stats.variacao >= 0 ? '+' : ''}${formatNumber(stats.variacao)}%`,
      hint: 'vs. semana anterior',
    },
  ];

  return (
    <div className="space-y-4">
      {/* 1. O MAPA, em destaque: e a leitura que a operacao abre primeiro.
          SEM animacao de entrada no envoltorio: qualquer animacao ali (ate
          so de opacidade) cria um contexto de empilhamento, e a TELA CHEIA
          do mapa (position: fixed) ficava por baixo da barra lateral e dos
          cartoes da pagina. A entrada animada fica nos pinos e nos numeros. */}
      {podeVerMapa ? (
        <div>
          <MobilizationMap
            clientId={client.id}
            clientName={client.name}
            destaque
            renderLiderActions={acoesDoLider}
            // O Time DEMO e todo de Alagoas: enquanto nao houver pino
            // resolvido, o mapa abre no centro do estado.
            fallbackCenter={client.isDemo ? ALAGOAS_CENTER : undefined}
          />
        </div>
      ) : null}

      {/* 2. Os indicadores: numeros que correm ate o valor. */}
      <div
        className={cn(
          'grid gap-3 sm:grid-cols-2',
          indicadores.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-2',
        )}
      >
        {indicadores.map((item, i) => (
          <Reveal key={item.label} delay={i * 70} className="flex">
            <StatCard {...item} onOpen={() => onOpenTab('equipe')} />
          </Reveal>
        ))}
      </div>

      {/* 3. O ritmo e quem puxa: a equipe ao longo da semana e o ranking. */}
      <div
        className={cn(
          'grid gap-3',
          mostrarRanking ? 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]' : '',
        )}
      >
        <Reveal className="flex flex-col">
          <TeamCard
            total={total}
            mes={stats.mes}
            serie={stats.serie}
            recentes={stats.recentes}
            restantes={restantes}
          />
        </Reveal>

        {mostrarRanking ? (
          // No desktop o ranking acompanha a altura do cartao da equipe e rola
          // por dentro: sem isso, o cartao azul esticava ate a lista e ficava
          // com um vao vazio embaixo.
          <Reveal delay={90} className="flex min-h-80 flex-col lg:relative lg:min-h-0">
            <div className="flex flex-1 flex-col lg:absolute lg:inset-0">
              <RankingCard
                rows={ranking}
                onDownload={() =>
                  baixarPdfDoRankingDeLideres({ time: client.name, clientId: client.id, members: todos })
                }
                currentUserId={user?.id ?? null}
                onOpen={navegador ? (id) => navegador.abrirLider(id) : undefined}
              />
            </div>
          </Reveal>
        ) : null}
      </div>

      {/* 4. Quem chegou por ultimo, o link e o formulario. */}
      <div
        className={
          showInviteCard || form
            ? 'grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]'
            : 'grid gap-3'
        }
      >
        <Reveal>
          <RecentMembersCard
            members={stats.recentes}
            options={relationshipOptions}
            onOpenTeam={() => onOpenTab('equipe')}
          />
        </Reveal>

        {showInviteCard || form ? (
          <Reveal delay={90} className="flex flex-col gap-3">
            {showInviteCard ? (
              <InviteCard
                client={client}
                canManage={podeGerenciarConvite}
                onManage={onManageInvite}
              />
            ) : null}

            {form && onOpenForm ? (
              <FormCard
                ativos={form.ativos}
                obrigatorios={form.obrigatorios}
                percentual={form.percentual}
                canEdit={podeEditarFormulario}
                onEdit={onOpenForm}
              />
            ) : null}
          </Reveal>
        ) : null}
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
      className="relative flex-1 overflow-hidden rounded-card bg-gradient-to-br from-navy-900 to-navy-800 p-4 text-white shadow-overlay sm:p-5"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-accent-500/15 blur-3xl"
      />
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
            <Contador valor={total} duracao={1200} />
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
  tone: 'accent' | 'success' | 'brand';
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
      className="group flex min-h-11 w-full items-center gap-3 rounded-card border border-line bg-surface p-3.5 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-overlay"
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-control transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6',
          tone === 'accent'
            ? 'bg-accent-50 text-accent-600'
            : tone === 'brand'
              ? 'bg-brand-50 text-brand-700'
              : 'bg-success-50 text-success-600',
        )}
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[0.6875rem] font-medium text-ink-500">{label}</span>
        <span className="mt-0.5 flex items-baseline gap-1.5">
          <Contador valor={value} className="text-[1.75rem] leading-none font-bold tracking-tight text-ink-900" />
          {badge ? (
            <span className="text-xs font-semibold text-success-600">{badge}</span>
          ) : null}
        </span>
        <span className="mt-1 block truncate text-[0.6875rem] text-ink-500">{hint}</span>
      </span>

      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-ink-400 transition-transform duration-200 group-hover:translate-x-0.5"
      />
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
  /** Ausente quando nao ha para onde ir: o cartao fica so com a copia. */
  onManage?: () => void;
}) {
  const toast = useToast();
  const origin = useOrigin();
  const [copied, setCopied] = useState(false);

  // Link fora do prazo nunca aparece como ativo neste resumo.
  const live = inviteIsLive(client.invite);

  // O endereco vem do banco a cada carregamento: o link continua disponivel
  // entre sessoes e aparelhos. Sem token (convite anterior ao link pessoal),
  // nada e exibido e nada e inventado.
  const path = client.invite.token && live ? invitePath(client.invite.token) : null;
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
            live
              ? 'inline-flex items-center gap-1.5 rounded-pill bg-success-50 px-2 py-1 text-[0.6875rem] font-medium text-success-600'
              : 'inline-flex items-center gap-1.5 rounded-pill bg-danger-50 px-2 py-1 text-[0.6875rem] font-medium text-danger-600'
          }
        >
          <span
            aria-hidden="true"
            className={live ? 'size-1.5 rounded-full bg-success-600' : 'size-1.5 rounded-full bg-danger-600'}
          />
          {live ? 'Ativo' : 'Expirado'}
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
            {live ? 'Link ainda não disponível.' : 'Link expirado. Gere um novo link.'}
          </p>
        )}

        {onManage ? (
          <button
            type="button"
            onClick={onManage}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control bg-accent-600 px-4 text-sm font-medium text-white transition-colors hover:bg-accent-700"
          >
            {canManage ? 'Gerenciar link' : 'Ver link'}
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-[0.6875rem] text-ink-500">
        {live
          ? 'Quem se cadastrar por este link entra na sua equipe.'
          : 'Este link não aceita mais cadastros. Gere um novo link.'}
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------
   Ultimos cadastros
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
          Últimos Cadastros
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
                  {['Nome', 'Vínculo', 'Endereço', 'Cadastrado em'].map((coluna) => (
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
   Ranking de cadastros
   ------------------------------------------------------------------------- */

/** Uma linha do ranking: um Lider e o que ele ja trouxe. */
interface RankingRow {
  key: string;
  /** Usuario do integrante. Nulo enquanto ele nao tem acesso proprio. */
  userId: string | null;
  name: string;
  /** Tag do Lider (migration 048), ao lado do nome. */
  tag: string | null;
  photo: string | null;
  count: number;
}

/** Medalhas das tres primeiras posicoes. Da quarta em diante, so o numero. */
const MEDAL_CLASSES = [
  'bg-[#e0a426] text-white',
  // Prata. `ink-300` nao existe na paleta: o 2o lugar saia sem fundo, com
  // o numero branco no branco.
  'bg-[#8e9aa7] text-white',
  'bg-[#b06a2c] text-white',
];

/**
 * Ranking dos Lideres.
 *
 * Responde a pergunta que o responsavel pela operacao faz primeiro: quem
 * esta trazendo gente. Todos os Lideres aparecem, inclusive quem ainda esta
 * em zero — e justamente isso que mostra onde falta empurrar. A contagem sai
 * do snapshot gravado em cada cadastro, entao ninguem perde o que ja fez se
 * o acesso for removido depois.
 *
 * A lista rola dentro do proprio cartao: equipe grande nao estica a pagina.
 */
function RankingCard({
  rows,
  currentUserId,
  onOpen,
  onDownload,
}: {
  /** Baixa o Ranking dos Lideres em PDF, com onde a Equipe de cada um vota. */
  onDownload?: () => Promise<void>;
  rows: RankingRow[];
  /** Destaca a linha de quem esta olhando o painel. */
  currentUserId: string | null;
  /** Clicar em um Lider abre o painel dele. */
  onOpen?: (memberId: string) => void;
}) {
  const maior = rows[0]?.count ?? 0;
  const comCadastro = rows.filter((row) => row.count > 0).length;

  return (
    <section
      aria-labelledby="ranking-de-cadastros"
      className="flex h-full flex-col rounded-card border border-line bg-surface shadow-card"
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <h2
          id="ranking-de-cadastros"
          className="flex items-center gap-2 text-[0.8125rem] font-semibold text-ink-900"
        >
          <Trophy aria-hidden="true" className="size-4 text-accent-600" />
          Ranking dos Líderes
        </h2>
        {rows.length > 0 ? (
          <span className="rounded-pill bg-accent-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-700 tabular-nums">
            {formatNumber(rows.length)}
          </span>
        ) : null}
        {onDownload && rows.length > 0 ? (
          <span className="ml-auto">
            <BotaoDePdf
              onClick={onDownload}
              rotulo="PDF"
              titulo="Baixar o Ranking dos Líderes em PDF, com locais, zonas e seções de cada um"
            />
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 pb-5 text-center text-sm text-ink-500">
          Nenhum Líder cadastrado ainda. Compartilhe o link de cadastro para começar.
        </p>
      ) : (
        <ul className="scrollbar-slim max-h-80 min-h-0 flex-1 divide-y divide-line overflow-y-auto px-4 lg:max-h-none">
          {rows.map((row, index) => (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => onOpen?.(row.key)}
                disabled={!onOpen}
                title={onOpen ? `Abrir o painel de ${row.name}` : undefined}
                className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-control px-2 py-2.5 text-left transition-colors enabled:hover:bg-ink-50"
              >
              <span
                aria-hidden="true"
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold ${
                  row.count > 0
                    ? (MEDAL_CLASSES[index] ?? 'bg-ink-100 text-ink-500')
                    : 'bg-ink-100 text-ink-400'
                }`}
              >
                {index + 1}
              </span>

              {row.photo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={row.photo}
                  alt={`Foto de ${row.name}`}
                  className="size-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[0.625rem] font-semibold text-ink-500"
                >
                  {initials(row.name)}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-ink-900">
                  <span className="min-w-0 truncate">
                    {row.name}
                    {row.userId && row.userId === currentUserId ? (
                      <span className="ml-1.5 text-[0.6875rem] font-medium text-ink-500">(você)</span>
                    ) : null}
                  </span>
                  <TagDoLider member={{ tier: 'LIDER', tag: row.tag, recruitedBy: null }} />
                </p>

                {/* Barra proporcional ao primeiro colocado: a diferenca
                    entre as posicoes fica visivel sem ler os numeros. */}
                <span
                  aria-hidden="true"
                  className="mt-1.5 block h-1 w-full overflow-hidden rounded-pill bg-ink-100"
                >
                  <span
                    className="cmd-barra block h-full rounded-pill bg-gradient-to-r from-accent-600 to-accent-400"
                    style={
                      {
                        width: `${maior > 0 ? Math.round((row.count / maior) * 100) : 0}%`,
                        '--cmd-atraso': `${Math.min(index, 12) * 60}ms`,
                      } as React.CSSProperties
                    }
                  />
                </span>
              </div>

              <span className="shrink-0 text-right">
                <span
                  className={`block text-base leading-none font-bold tabular-nums ${
                    row.count > 0 ? 'text-ink-900' : 'text-ink-400'
                  }`}
                >
                  {formatNumber(row.count)}
                </span>
                <span className="mt-0.5 block text-[0.6875rem] text-ink-500">
                  {pluralize(row.count, 'cadastro', 'cadastros')}
                </span>
              </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 ? (
        <p className="px-4 py-2.5 text-[0.6875rem] text-ink-500">
          {comCadastro === 0
            ? 'Nenhum Líder trouxe alguém ainda.'
            : `${formatNumber(comCadastro)} de ${formatNumber(rows.length)} ${pluralize(
                rows.length,
                'Líder já trouxe alguém',
                'Líderes já trouxeram alguém',
              )}`}
        </p>
      ) : null}
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
