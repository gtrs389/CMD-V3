'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Layers,
  LayoutList,
  MapPin,
  Pencil,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';
import { useClient } from '@/hooks/use-clients';
import { useSession } from '@/components/layout/SessionProvider';
import { useMembers } from '@/hooks/use-members';
import { initials } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Menu } from '@/components/ui/Menu';
import { Skeleton } from '@/components/ui/Skeleton';
import { TabPanel, Tabs, type TabItem } from '@/components/ui/Tabs';
import { FormsPanel } from '@/components/fields/FormsPanel';
import { MembersPanel, type PedidoDeFiltro } from '@/components/members/MembersPanel';
import {
  NavegadorDePessoas,
  useNavegador,
  type Navegador,
} from '@/components/members/NavegadorDePessoas';
import { trocarParametros } from '@/lib/utils/historico';
import { diagnosticar, municipioDaOperacao } from '@/lib/domain/inconsistencias';
import { formatNumber, pluralize } from '@/lib/utils/text';
import { InconsistenciasPanel } from './InconsistenciasPanel';
import { NeoRelatorioModal } from '@/components/neo/NeoRelatorioModal';
import { BannerTagModal } from './BannerTagModal';
import { DemoBadge } from './DemoBadge';
import { ClientFormModal } from './ClientFormModal';
import { ClientOverviewPanel } from './ClientOverviewPanel';
import { DeleteClientDialog } from './DeleteClientDialog';
import { DemoAccessSwitch } from './DemoAccessSwitch';
import { BatchLinksModal } from './BatchLinksModal';
import { DemoDataDialog } from './DemoDataDialog';
import { DemoRecruitersModal } from './DemoRecruitersModal';
import { GenerateClientInviteButton } from './GenerateClientInviteButton';
import { GenerateInviteButton } from './GenerateInviteButton';
import { TeamLinksBar } from './TeamLinksBar';
import { InviteLinkModal } from './InviteLinkModal';
import type { TabId } from './client-tabs';

interface ClientDetailViewProps {
  clientId: string;
  /** Aba aberta ao entrar. */
  initialTab?: TabId;
  /**
   * Abre o link de cadastro ao entrar. O convite nao e mais uma aba: o
   * atalho de "Recrutar" e os enderecos antigos (`?aba=convite`) caem aqui.
   */
  initialInvite?: boolean;
  /** Ficha aberta ao entrar (`?integrante=`), vinda do Rastreamento de links. */
  initialMemberId?: string | null;
}

/** Pagina individual do time, organizada em abas. */
export function ClientDetailView({
  clientId,
  initialTab,
  initialInvite = false,
  initialMemberId = null,
}: ClientDetailViewProps) {
  const router = useRouter();
  const { can, user } = useSession();
  const { data: client, loading, error, reload } = useClient(clientId);
  const { data: members, loading: loadingMembers } = useMembers(clientId);

  const [tab, setTab] = useState<TabId>(initialTab ?? 'visao-geral');

  const [editing, setEditing] = useState(false);
  const [banner, setBanner] = useState(false);
  const [recrutadores, setRecrutadores] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** Refazer os dados gerados: so aparece em Time DEMO, so para o ADMIN. */
  const [refazendo, setRefazendo] = useState(false);
  const [invite, setInvite] = useState(initialInvite);
  /** Links de cadastro em lote: vários de uma vez, para distribuir. */
  const [lote, setLote] = useState(false);
  /** Relatorio do NEO: so para quem pode tirar a lista do sistema. */
  const [relatorio, setRelatorio] = useState(false);
  /**
   * Aba pedida pelo endereco, depois que a pagina ja esta aberta.
   *
   * O mapa da visao geral leva para ESTA MESMA rota, so trocando o
   * `?integrante=`. Como o componente continua montado, o `useState` acima
   * ignora o novo valor inicial: a aba ficava na visao geral, o painel da
   * equipe nem chegava a existir — `TabPanel` nao desenha aba inativa — e a
   * ficha nunca abria. Era esse o "Ver ficha completa nao faz nada".
   *
   * O ajuste acontece durante a renderizacao, comparando com o ultimo valor
   * visto, e nao em um efeito: assim a aba certa ja sai na primeira pintura,
   * sem um quadro intermediario na aba errada.
   */
  const [abaDaUrl, setAbaDaUrl] = useState(initialTab);
  if (initialTab !== abaDaUrl) {
    setAbaDaUrl(initialTab);
    if (initialTab) setTab(initialTab);
  }

  const memberList = useMemo(() => members ?? [], [members]);

  /**
   * O diagnostico do time, calculado uma vez para a aba, o contador dela e o
   * aviso da visao geral. Sai da mesma lista que a pagina ja recebeu: nenhuma
   * consulta a mais, e corrigir uma ficha atualiza tudo junto.
   */
  const diagnostico = useMemo(
    () =>
      diagnosticar(
        memberList,
        municipioDaOperacao({ stateUf: client?.stateUf, cities: client?.cities }),
      ),
    [memberList, client?.stateUf, client?.cities],
  );

  /**
   * "Ver a Equipe na lista" do painel de um Lider, aberto de qualquer aba:
   * vai para a lista ja filtrada por ele.
   */
  const [pedidoDeFiltro, setPedidoDeFiltro] = useState<PedidoDeFiltro | null>(null);

  // O time enxerga apenas o proprio cadastro, em leitura. As rotas de
  // gravacao recusam o perfil no servidor: aqui so evitamos oferecer a acao.
  const podeVoltar = can('client.list');
  const podeEditar = can('client.update');
  const podeExcluir = can('client.delete');
  const podeGerenciarConvite = can('invite.manage');

  // Enderecos de acesso ao painel oferecidos nesta tela:
  //
  //   ADMIN geral            os dois, para distribuir a quem for.
  //   Administrador do time  so o da equipe, que e quem ele convida. O
  //                          endereco dos administradores nao aparece: quem
  //                          distribui acesso de administracao e o ADMIN.
  //
  // A rota confere o perfil de novo, entao esconder aqui nunca e a protecao.
  const enderecosDeAcesso = can('settings.manage')
    ? (['TEAM_ADMIN', 'EQUIPE'] as const)
    : user?.role === 'CANDIDATE'
      ? (['EQUIPE'] as const)
      : [];

  // Area interna do formulario: exclusiva do ADMIN, e sempre completa. Sem
  // as duas permissoes nao ha aba, cartao nem previa, a pagina recusa
  // `?aba=formulario` e a configuracao dos campos nem chega nesta resposta.
  // Area de configuracao dos DOIS formularios do time: exclusiva do ADMIN
  // geral, e sempre completa. Sem as duas permissoes nao ha aba, cartao nem
  // previa, a pagina recusa `?aba=formulario` e a configuracao dos campos nem
  // chega nesta resposta.
  const mostrarFormulario = can('form.view') && can('form.manage');

  // Perfil sem acesso ao formulario nunca fica preso na aba: qualquer
  // tentativa cai na visao geral.
  const abaAtiva: TabId = tab === 'formulario' && !mostrarFormulario ? 'visao-geral' : tab;

  // A aba fica no endereco (`?aba=`): recarregar ou mandar o link abre na
  // mesma aba. Troca a entrada atual do historico, sem criar um "voltar"
  // por aba. Tambem depois de um "voltar" do navegador, que pode pousar
  // numa entrada gravada com a aba de antes.
  const abaNoEndereco = useRef(abaAtiva);
  useEffect(() => {
    abaNoEndereco.current = abaAtiva;
    const gravar = () =>
      trocarParametros({ aba: abaNoEndereco.current === 'visao-geral' ? null : abaNoEndereco.current });
    gravar();
    window.addEventListener('popstate', gravar);
    return () => window.removeEventListener('popstate', gravar);
  }, [abaAtiva]);

  if (loading) return <DetailSkeleton />;

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

  if (!client) {
    return (
      <EmptyState
        icon={<Building2 className="size-6" />}
        title="Time não encontrado"
        description="O time pode ter sido excluido por outra pessoa."
        action={
          <Link
            href="/candidatos"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-brand-700 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-800"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Voltar para times
          </Link>
        }
      />
    );
  }

  const tabs: TabItem[] = [
    { id: 'visao-geral', label: 'Visão geral', icon: <LayoutList className="size-4" /> },
    {
      id: 'equipe',
      label: 'Equipe',
      icon: <Users className="size-4" />,
      badge: (
        <span className="rounded-pill bg-accent-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-700 tabular-nums">
          {memberList.length}
        </span>
      ),
    },
    {
      id: 'inconsistencias',
      label: 'Inconsistências',
      icon:
        diagnostico.pessoasComProblema > 0 ? (
          <AlertTriangle className="size-4" />
        ) : (
          <ShieldCheck className="size-4" />
        ),
      badge:
        diagnostico.pessoasComProblema > 0 ? (
          <span className="rounded-pill bg-danger-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-danger-700 tabular-nums">
            {formatNumber(diagnostico.pessoasComProblema)}
          </span>
        ) : undefined,
    },
    ...(mostrarFormulario
      ? [{ id: 'formulario', label: 'Formulários', icon: <FileText className="size-4" /> }]
      : []),
  ];

  return (
    <div className="space-y-3">
      {podeVoltar ? (
        <Link
          href="/candidatos"
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-ink-500 transition-colors hover:text-ink-900"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Voltar para times
        </Link>
      ) : null}

      <header className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5">
        {/* O grupo de botoes da direita e largo e nao encolhe: cada botao tem
            `whitespace-nowrap`. Sem `flex-wrap` aqui, a conta de espaco fecha
            negativa e sobra zero para o nome do time — que, com `min-w-0`,
            aceita zero e quebra uma letra por linha. Com a quebra, o grupo
            inteiro desce para a linha de baixo e o nome fica com a largura
            do cartao. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
          {client.photo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={client.photo}
              alt={`Foto de ${client.name}`}
              className="size-16 shrink-0 rounded-card border border-line object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-16 shrink-0 items-center justify-center rounded-card border border-line bg-ink-100 text-lg font-semibold text-ink-500"
            >
              {initials(client.name)}
            </span>
          )}

          {/* `flex-1` sozinho e `flex: 1 1 0%`: base ZERO. Num aperto o nome do
              time e o primeiro a ser espremido, ate sumir. A base minima diz
              qual largura ele pede antes de ceder; `min-w-0` continua, para o
              texto poder truncar em vez de esticar o cartao. */}
          <div className="min-w-0 flex-1 sm:basis-72">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl leading-tight font-bold tracking-tight break-words text-ink-900 sm:text-[1.375rem]">
                {client.name}
              </h1>
              {/* Quem identifica um Time DEMO e o ADMIN geral. Para o
                  administrador do proprio time — que e quem estara
                  apresentando — a tela e a mesma de um time real, sem selo
                  aparecendo no meio da demonstracao. */}
              {client.isDemo && user?.role === 'ADMIN' ? <DemoBadge /> : null}
            </div>

            {/* De onde o time e (038). Cadastrar sem nunca mostrar seria
                guardar dado que ninguem confere — e o estado errado so
                aparece quando alguem o ve. Nada e desenhado nos times
                antigos, que ainda nao tem estado: um traco ali nao diz nada
                a mais do que o silencio. */}
            {client.stateUf ? (
              <p className="mt-1 flex items-center gap-1.5 text-[0.8125rem] text-ink-500">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">
                  {client.stateUf}
                  {client.cities.length > 0 ? ` · ${client.cities.join(', ')}` : ''}
                </span>
              </p>
            ) : null}

            {/* No lugar do contato do time: quem administra a operacao. */}
            {client.people.length > 0 ? (
              <div className="mt-1.5 flex items-center gap-2">
                <ul className="flex -space-x-2">
                  {client.people.slice(0, 5).map((person) => (
                    <li key={person.id} title={person.name}>
                      {person.photo ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={person.photo}
                          alt={`Foto de ${person.name}`}
                          className="size-7 rounded-full object-cover ring-2 ring-surface"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex size-7 items-center justify-center rounded-full bg-ink-100 text-[0.625rem] font-semibold text-ink-500 ring-2 ring-surface"
                        >
                          {initials(person.name)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <span className="truncate text-[0.8125rem] text-ink-500">
                  {client.people.length}{' '}
                  {client.people.length === 1
                    ? 'administrador do time'
                    : 'administradores do time'}
                </span>
              </div>
            ) : (
              <p className="mt-1 truncate text-[0.8125rem] text-ink-500">
                Nenhum administrador cadastrado.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* A chave do Time DEMO fica a vista, e nao no menu: ela costuma
                ser usada ao vivo, no meio de uma apresentacao, e o estado
                dela (ligado ou desligado) e informacao, nao acao escondida. */}
            {client.isDemo && user?.role === 'ADMIN' ? (
              <DemoAccessSwitch client={client} onChanged={reload} />
            ) : null}

            {/* Os tres links do time ficam juntos e nomeados: cadastro,
                administrador e equipe. Nada de endereco na tela — cada botao
                copia o seu. Ligar/desligar o recrutamento e ver o token
                atual continuam no menu, em "Configurações do link". */}
            <TeamLinksBar
              clientId={client.id}
              audiences={enderecosDeAcesso}
              generateButton={
                podeGerenciarConvite ? (
                  <GenerateClientInviteButton client={client} label="Gerar link" />
                ) : (
                  <GenerateInviteButton label="Gerar link" />
                )
              }
            />

            {/* O relatorio carrega a lista inteira do time: e da mesma regra
                da planilha exportada (`member.export`), e a rota confere. */}
            {can('member.export') ? (
              <button
                type="button"
                onClick={() => setRelatorio(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill bg-navy-900 px-4 text-sm font-medium whitespace-nowrap text-white shadow-card transition-colors hover:bg-navy-800"
              >
                <Sparkles aria-hidden="true" className="size-4" />
                Relatório do NEO
              </button>
            ) : null}

            {podeGerenciarConvite ? (
              <button
                type="button"
                onClick={() => setLote(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border border-line bg-surface px-4 text-sm font-medium whitespace-nowrap text-accent-600 shadow-card transition-colors hover:bg-accent-50"
              >
                <Layers aria-hidden="true" className="size-4" />
                Gerar em lote
              </button>
            ) : null}

            {podeEditar ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-pill border border-line bg-surface px-4 text-sm font-medium text-accent-600 shadow-card transition-colors hover:bg-accent-50"
              >
                <Pencil aria-hidden="true" className="size-4" />
                Editar time
              </button>
            ) : null}

            {podeEditar || podeExcluir || podeGerenciarConvite ? (
              <div className="rounded-control border border-line bg-surface shadow-card">
                <Menu
                  label={`Ações de ${client.name}`}
                  actions={[
                    ...(podeGerenciarConvite
                      ? [
                          {
                            id: 'config-link',
                            label: 'Configurações do link',
                            icon: <Settings className="size-4" />,
                            onSelect: () => setInvite(true),
                          },
                        ]
                      : []),
                    ...(podeEditar
                      ? [
                          {
                            id: 'editar',
                            label: 'Editar time',
                            icon: <Pencil className="size-4" />,
                            onSelect: () => setEditing(true),
                          },
                          {
                            id: 'estampa',
                            label: 'Banner do celular',
                            icon: <ImageIcon className="size-4" />,
                            onSelect: () => setBanner(true),
                          },
                        ]
                      : []),
                    ...(client.isDemo && user?.role === 'ADMIN'
                      ? [
                          {
                            id: 'dados-demo',
                            label: 'Refazer dados de demonstração',
                            icon: <RefreshCw className="size-4" />,
                            onSelect: () => setRefazendo(true),
                          },
                          {
                            id: 'recrutadores-demo',
                            label: 'Pessoas que também recrutam',
                            icon: <Users className="size-4" />,
                            onSelect: () => setRecrutadores(true),
                          },
                        ]
                      : []),
                    ...(podeExcluir
                      ? [
                          {
                            id: 'excluir',
                            label: 'Excluir time',
                            icon: <Trash2 className="size-4" />,
                            tone: 'danger' as const,
                            onSelect: () => setDeleting(true),
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <NavegadorDePessoas
        client={client}
        members={memberList}
        carregando={loadingMembers}
        inicial={initialMemberId}
        onFiltrarEquipe={(lider) => {
          const responsavel = lider.userId;
          if (!responsavel) return;
          setPedidoDeFiltro((atual) => ({ responsavel, vez: (atual?.vez ?? 0) + 1 }));
          setTab('equipe');
        }}
      >
        <Tabs
          variant="underline"
          label="Seções do time"
          items={tabs}
          active={abaAtiva}
          onChange={(id) => setTab(id as TabId)}
        />

        <TabPanel id="visao-geral" active={abaAtiva}>
          {/* O que esta errado aparece na entrada, e nao so na aba: cadastro
              repetido infla o total e o ranking que esta logo abaixo. */}
          {!loadingMembers && diagnostico.pessoasComProblema > 0 ? (
            <button
              type="button"
              onClick={() => setTab('inconsistencias')}
              className="group mb-3 flex w-full items-center gap-3 rounded-card border border-warning-600/30 bg-warning-50/70 px-4 py-3 text-left transition-colors hover:bg-warning-50"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-control bg-surface text-warning-600"
              >
                <AlertTriangle className="size-4" />
              </span>
              <span className="min-w-0 flex-1 text-sm text-ink-700">
                <strong className="font-semibold text-ink-900">
                  {formatNumber(diagnostico.pessoasComProblema)}{' '}
                  {pluralize(diagnostico.pessoasComProblema, 'cadastro precisa', 'cadastros precisam')} de
                  atenção
                </strong>
                <span className="block text-xs text-ink-500 sm:inline sm:before:content-['_·_']">
                  {[
                    diagnostico.excedentes > 0
                      ? `${formatNumber(diagnostico.excedentes)} ${pluralize(diagnostico.excedentes, 'repetido', 'repetidos')}`
                      : null,
                    diagnostico.incompletos.membros.length > 0
                      ? `${formatNumber(diagnostico.incompletos.membros.length)} ${pluralize(diagnostico.incompletos.membros.length, 'incompleto', 'incompletos')}`
                      : null,
                    `saúde do cadastro em ${diagnostico.saude}%`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-warning-600 sm:inline-flex">
                Ver quadro
                <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          ) : null}

          <ClientOverviewPanel
            client={client}
            members={memberList}
            onOpenTab={setTab}
            onOpenForm={mostrarFormulario ? () => setTab('formulario') : undefined}
            // O link de cadastro fica no botao do cabecalho: o cartao
            // "Meu link de cadastro" sai da visao geral.
            showInviteCard={false}
            // Os cartoes "Administradores do time" e "Acesso ao sistema" saem
            // da visao geral: quem administra aparece no cabecalho, ao lado do
            // nome, e os dois links de acesso viraram botao la em cima. Editar
            // quem administra continua em "Editar time".
          />
        </TabPanel>

        {/* Equipe e Inconsistencias ficam montadas depois de abertas: sair
            e voltar encontra a busca, os filtros e a rolagem como estavam.
            Fichas e paineis abrem por cima, pelo navegador — nunca trocam de
            aba. */}
        <TabPanel id="equipe" active={abaAtiva} keepMounted>
          <MembersPanel
            client={client}
            members={memberList}
            loading={loadingMembers}
            filtroDeResponsavel={pedidoDeFiltro}
          />
        </TabPanel>

        <TabPanel id="inconsistencias" active={abaAtiva} keepMounted>
          <ComNavegador>
            {(navegador) => (
              <InconsistenciasPanel
                clientName={client.name}
                members={memberList}
                diagnostico={diagnostico}
                onOpenMember={(id) => navegador?.abrirPessoa(id)}
                canExport={can('member.export')}
              />
            )}
          </ComNavegador>
        </TabPanel>

        {mostrarFormulario ? (
          <TabPanel id="formulario" active={abaAtiva}>
            <FormsPanel client={client} members={memberList} onChanged={reload} />
          </TabPanel>
        ) : null}
      </NavegadorDePessoas>

      <BatchLinksModal open={lote} client={client} onClose={() => setLote(false)} />

      {/* Montado so quando abre: cada abertura comeca do zero, e o relatorio
          anterior nao fica guardado na memoria da pagina. */}
      {relatorio ? (
        <NeoRelatorioModal
          open
          clientId={client.id}
          clientName={client.name}
          onClose={() => setRelatorio(false)}
        />
      ) : null}

      <InviteLinkModal
        open={invite}
        client={client}
        canManage={podeGerenciarConvite}
        onClose={() => setInvite(false)}
      />

      <ClientFormModal open={editing} client={client} onClose={() => setEditing(false)} />

      <BannerTagModal open={banner} client={client} onClose={() => setBanner(false)} />

      {/* Montado so quando abre: o valor de hoje e lido do servidor na
          abertura, e um modal que fica montado guardaria o numero antigo. */}
      {recrutadores ? (
        <DemoRecruitersModal
          open
          client={client}
          onClose={() => setRecrutadores(false)}
          onChanged={reload}
        />
      ) : null}

      <DemoDataDialog
        open={refazendo}
        client={client}
        onCancel={() => setRefazendo(false)}
        onDone={() => {
          setRefazendo(false);
          // A pagina inteira le de novo: as pessoas, os numeros e o mapa sao
          // os que acabaram de ser gravados.
          reload();
        }}
      />

      <DeleteClientDialog
        open={deleting}
        client={client}
        memberCount={memberList.length}
        onCancel={() => setDeleting(false)}
        onDeleted={() => {
          setDeleting(false);
          router.replace('/candidatos');
        }}
      />
    </div>
  );
}

/** Entrega o navegador da pagina a quem so recebe callbacks. */
function ComNavegador({ children }: { children: (navegador: Navegador | null) => ReactNode }) {
  return children(useNavegador());
}

function DetailSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-40" />
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-card" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-card" />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Skeleton className="h-64 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    </div>
  );
}
