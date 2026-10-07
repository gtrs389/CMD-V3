'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  BarChart3,
  BookmarkCheck,
  Check,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Pencil,
  SearchX,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { Client, Member, TeamTier } from '@/lib/types';
import { memberRepository } from '@/lib/repositories';
import { recruiterKey, recruiterOptions } from '@/lib/domain/recruitment';
import { montarCsvDaEquipe, nomeDoArquivo } from '@/lib/domain/csv-export';
import { byNewest, formatDate } from '@/lib/utils/date';
import { baixarCsv } from '@/lib/utils/download';
import { formatPhone } from '@/lib/utils/phone';
import { avisoDeFaltas, cadastroIncompleto } from '@/lib/domain/member-completeness';
import { avisoDeConferencia, precisaConferir } from '@/lib/domain/conferencia';
import { buscarPessoa, type CampoDaBusca } from '@/lib/domain/busca-de-pessoas';
import { opcoesDeTag, passaNoFiltroDeTag, SEM_TAG, tagDaPessoa } from '@/lib/domain/tag-do-lider';
import { cn } from '@/lib/utils/cn';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dropdown } from '@/components/ui/Dropdown';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { SearchInput } from '@/components/ui/SearchInput';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/components/layout/SessionProvider';
import { MemberFormModal } from './MemberFormModal';
import { SurveyAnswerModal } from '@/components/survey/SurveyAnswerModal';
import { SpreadsheetImportModal } from './SpreadsheetImportModal';
import { PdfDeLideresModal } from './PdfDeLideresModal';
import { submitOwnSurveyAnswer } from '@/lib/repositories';
import { RecruitedBy } from './RecruitedBy';
import { TierBadge } from './TierBadge';
import { TagDoLider } from './TagDoLider';
import { TagDaReferencia } from './TagDaReferencia';
import { EquipePorReferencia } from './EquipePorReferencia';
import { NavegadorDePessoas, useNavegador } from './NavegadorDePessoas';
import { verificadoPorFotoParaGravar } from '@/lib/domain/csv-import';
import {
  SEM_REFERENCIA,
  SEM_ZONA,
  chaveDaReferencia,
  contarFotos,
  opcoesDeReferencia,
  opcoesDeZona,
  passaNaFoto,
  passaNaReferencia,
  passaNaZona,
  situacaoDaFoto,
  tituloLegivel,
  type FiltroDeFoto,
} from '@/lib/domain/filtros-da-equipe';
import { problemaDoTitulo } from '@/lib/domain/conferencia';

interface MembersPanelProps {
  client: Client;
  /**
   * Formulario que o botao de adicionar abre.
   *
   *   'integrante'   a ficha do Formulario 1 — o cadastro de integrante, com
   *                  acesso ao painel. E o que a pagina do TIME usa.
   *   'formulario-2' as perguntas que ESTE lider envia adiante. E o que a
   *                  pagina do integrante usa: o Formulario 2 e o formulario
   *                  dele, e quem responde nao vira integrante.
   */
  addForm?: 'integrante' | 'formulario-2';
  members: Member[];
  loading: boolean;
  /**
   * Ficha aberta ao entrar, indicada pelo endereco (`?integrante=`). Usada
   * pelo botao "Ver ficha completa" do Rastreamento de links. Abre uma unica
   * vez: fechar o dialogo nao reabre.
   */
  openMemberId?: string | null;
  /**
   * "Ver a Equipe na lista", pedido de fora (o painel de um Lider aberto em
   * outra aba): filtra a lista por aquele responsavel. `vez` muda a cada
   * pedido, para o mesmo Lider poder ser pedido de novo.
   */
  filtroDeResponsavel?: PedidoDeFiltro | null;
}

export interface PedidoDeFiltro {
  responsavel: string;
  vez: number;
}

/**
 * Gestao da equipe do time.
 *
 * Fichas, paineis de Lider e edicao abrem pelo `NavegadorDePessoas` da
 * pagina — em pilha, por cima da lista, sem perder a busca nem os filtros.
 * Numa pagina que nao tem navegador (a do Lider), a lista monta o dela.
 */
export function MembersPanel(props: MembersPanelProps) {
  const navegador = useNavegador();
  const [pedido, setPedido] = useState<PedidoDeFiltro | null>(null);

  if (navegador) return <ListaDoTime {...props} />;

  return (
    <NavegadorDePessoas
      client={props.client}
      members={props.members}
      carregando={props.loading}
      inicial={props.openMemberId ?? null}
      onFiltrarEquipe={(lider) => {
        const responsavel = lider.userId;
        if (responsavel) setPedido((atual) => ({ responsavel, vez: (atual?.vez ?? 0) + 1 }));
      }}
    >
      <ListaDoTime {...props} filtroDeResponsavel={props.filtroDeResponsavel ?? pedido} />
    </NavegadorDePessoas>
  );
}

/** A lista: tabela no desktop e cartoes no celular, sem rolagem horizontal. */
function ListaDoTime({
  client,
  members,
  loading,
  addForm = 'integrante',
  filtroDeResponsavel = null,
}: MembersPanelProps) {
  const navegador = useNavegador();
  const toast = useToast();
  // Perfil somente leitura nao recebe as acoes. O servidor recusa do mesmo
  // jeito: esconder o botao nunca e a protecao.
  const { can, user } = useSession();
  const podeCriar = can('member.create');
  /**
   * Os dois formularios cadastram INTEGRANTE — o que muda sao as perguntas.
   * Na pagina do lider e o Formulario 2, e a pessoa entra na equipe dele
   * igual a quem se cadastra pelo link (migration 044).
   */
  const rotuloAdicionar = 'Adicionar integrante';
  const podeEditar = can('member.update');
  const podeExcluir = can('member.delete');
  /**
   * Exportar a equipe em planilha: so o ADMIN geral.
   *
   * A lista exportada e exatamente a que esta na tela, ja recortada pela
   * hierarquia no servidor — nenhuma linha a mais aparece no arquivo.
   */
  const podeExportar = can('member.export');
  // O integrante da equipe ve apenas nome, foto e telefone: nada de e-mail,
  // responsavel pelo cadastro ou origem, que o servidor ja nao envia mais.
  const somenteBasico = user?.role === 'EQUIPE';
  const [term, setTerm] = useState('');
  // Filtro por responsavel pelo cadastro. Recorte de leitura apenas: o que
  // chega da API ja vem limitado pela hierarquia, no servidor.
  const [recruiter, setRecruiter] = useState(filtroDeResponsavel?.responsavel ?? 'todos');
  // Filtro por nivel: Lideres, Equipe ou todos — ou o time agrupado por
  // referencia ('referencia'), que troca a lista pelo painel agrupado.
  const [nivel, setNivel] = useState<'todos' | 'referencia' | TeamTier>('todos');
  // Filtro pela tag do Lider: o Lider e a Equipe dele juntos. Tambem so
  // leitura.
  const [tag, setTag] = useState('todas');
  // Filtro pela etiqueta: quem esta para conferir, incompleto ou em ordem.
  const [situacao, setSituacao] = useState<'todas' | 'conferir' | 'incompleto' | 'em-ordem'>(
    'todas',
  );
  // Filtros dos dados da planilha: REFERÊNCIA, VERIFICADO POR FOTO, zona e
  // de onde a pessoa veio (planilha do Sheets ou sistema).
  const [referencia, setReferencia] = useState('todas');
  const [foto, setFoto] = useState<FiltroDeFoto>('todos');
  const [zona, setZona] = useState('todas');
  // "Ver a Equipe na lista" pedido depois da lista montada: aplicado na
  // renderizacao, comparando com o ultimo pedido visto — o filtro certo ja
  // sai na primeira pintura.
  const [pedidoVisto, setPedidoVisto] = useState(filtroDeResponsavel);
  if (filtroDeResponsavel !== pedidoVisto) {
    setPedidoVisto(filtroDeResponsavel);
    if (filtroDeResponsavel) {
      setRecruiter(filtroDeResponsavel.responsavel);
      setNivel('todos');
      setTag('todas');
      setSituacao('todas');
      setReferencia('todas');
      setFoto('todos');
      setZona('todas');
      setTerm('');
    }
  }
  /** Adicionar: o formulario de cadastro. Editar abre pelo navegador. */
  const [formOpen, setFormOpen] = useState(false);
  /** Cadastro de muita gente de uma vez, por planilha. */
  const [planilhaAberta, setPlanilhaAberta] = useState(false);
  /** PDF "Líderes por referência": escolhe as referências e baixa. */
  const [pdfDeLideres, setPdfDeLideres] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);

  const ordered = useMemo(() => [...members].sort(byNewest), [members]);

  const responsaveis = useMemo(() => recruiterOptions(ordered), [ordered]);
  // So as tags que alguem da lista tem; sem nenhuma, o filtro nao aparece.
  const tags = useMemo(() => opcoesDeTag(ordered), [ordered]);

  // A tag escolhida sumiu (o Lider perdeu a tag): o filtro volta a "todas",
  // em vez de deixar a lista vazia sem motivo visivel.
  if (tag !== 'todas' && !tags.some((opcao) => opcao.valor === tag)) setTag('todas');

  const referencias = useMemo(() => opcoesDeReferencia(ordered), [ordered]);
  const zonas = useMemo(() => opcoesDeZona(ordered), [ordered]);
  const fotos = useMemo(() => contarFotos(ordered), [ordered]);
  // A opcao escolhida sumiu da lista (a planilha mudou): volta a "todas".
  if (referencia !== 'todas' && !referencias.some((o) => o.valor === referencia)) setReferencia('todas');
  if (zona !== 'todas' && !zonas.some((o) => o.valor === zona)) setZona('todas');

  /**
   * A lista filtrada, e ONDE a busca achou cada pessoa.
   *
   * A busca olha todos os dados da pessoa (`busca-de-pessoas.ts`): nome,
   * telefone, CPF, titulo, bairro, rua, zona/secao e quem cadastrou. O
   * "achado no CPF" aparece na linha quando o nome nao explica por que ela
   * esta ali.
   */
  const { filtered, achadoEm } = useMemo(() => {
    const achadoEm = new Map<string, CampoDaBusca[]>();
    const filtered = ordered.filter((member) => {
      if (recruiter !== 'todos' && recruiterKey(member) !== recruiter) return false;
      if ((nivel === 'LIDER' || nivel === 'EQUIPE') && member.tier !== nivel) return false;
      if (!passaNoFiltroDeTag(member, tag)) return false;
      if (situacao === 'conferir' && !precisaConferir(member)) return false;
      if (situacao === 'incompleto' && !cadastroIncompleto(member)) return false;
      if (situacao === 'em-ordem' && (precisaConferir(member) || cadastroIncompleto(member))) {
        return false;
      }
      if (!passaNaReferencia(member, referencia)) return false;
      if (!passaNaFoto(member, foto)) return false;
      if (!passaNaZona(member, zona)) return false;

      const resultado = buscarPessoa(member, term);
      if (!resultado.achou) return false;
      const alemDoNome = resultado.campos.filter((campo) => campo !== 'nome');
      if (term.trim() && !resultado.campos.includes('nome') && alemDoNome.length) {
        achadoEm.set(member.id, alemDoNome);
      }
      return true;
    });
    return { filtered, achadoEm };
  }, [ordered, term, recruiter, nivel, tag, situacao, referencia, foto, zona]);

  /** Contagens de cada botao de filtro, sobre o time inteiro. */
  const contagens = useMemo(
    () => ({
      lideres: ordered.filter((m) => m.tier === 'LIDER').length,
      equipe: ordered.filter((m) => m.tier === 'EQUIPE').length,
      conferir: ordered.filter((m) => precisaConferir(m)).length,
      incompleto: ordered.filter((m) => cadastroIncompleto(m)).length,
      emOrdem: ordered.filter((m) => !precisaConferir(m) && !cadastroIncompleto(m)).length,
      referencias: new Set(ordered.filter((m) => m.tier === 'LIDER').map((m) => chaveDaReferencia(m)).filter(Boolean)).size,
    }),
    [ordered],
  );

  const filtrosAtivos = [
    term.trim() ? { id: 'busca', rotulo: `“${term.trim()}”`, limpar: () => setTerm('') } : null,
    nivel !== 'todos'
      ? {
          id: 'nivel',
          rotulo: nivel === 'LIDER' ? 'Líderes' : nivel === 'EQUIPE' ? 'Equipe' : 'Por referência',
          limpar: () => setNivel('todos'),
        }
      : null,
    tag !== 'todas'
      ? { id: 'tag', rotulo: tag === SEM_TAG ? 'Sem tag' : `Tag ${tag}`, limpar: () => setTag('todas') }
      : null,
    situacao !== 'todas'
      ? {
          id: 'situacao',
          rotulo:
            situacao === 'conferir' ? 'Para conferir' : situacao === 'incompleto' ? 'Incompletos' : 'Em ordem',
          limpar: () => setSituacao('todas'),
        }
      : null,
    referencia !== 'todas'
      ? {
          id: 'referencia',
          rotulo:
            referencia === SEM_REFERENCIA
              ? 'Sem referência'
              : `Ref. ${referencias.find((o) => o.valor === referencia)?.rotulo ?? ''}`,
          limpar: () => setReferencia('todas'),
        }
      : null,
    foto !== 'todos'
      ? {
          id: 'foto',
          rotulo: foto === 'sim' ? 'Verificado por foto' : foto === 'nao' ? 'Não verificado por foto' : 'Foto não informada',
          limpar: () => setFoto('todos'),
        }
      : null,
    zona !== 'todas'
      ? {
          id: 'zona',
          rotulo: zona === SEM_ZONA ? 'Sem zona' : `Zona ${zona}`,
          limpar: () => setZona('todas'),
        }
      : null,
    recruiter !== 'todos'
      ? {
          id: 'responsavel',
          rotulo: `Por ${responsaveis.find((r) => r.key === recruiter)?.label ?? 'responsável'}`,
          limpar: () => setRecruiter('todos'),
        }
      : null,
  ].filter((f): f is { id: string; rotulo: string; limpar: () => void } => f !== null);

  function limparTudo() {
    setTerm('');
    setNivel('todos');
    setTag('todas');
    setSituacao('todas');
    setRecruiter('todos');
    setReferencia('todas');
    setFoto('todos');
    setZona('todas');
  }

  /** Clicar na tag de uma linha filtra a lista por ela. */
  function filtrarPelaTag(member: Member) {
    const daPessoa = tagDaPessoa(member);
    if (daPessoa) setTag(daPessoa);
  }

  /** A tag da referencia do Lider vira atalho: todos da mesma referencia (ou todos sem). */
  function filtrarPelaReferencia(member: Member) {
    const chave = chaveDaReferencia(member) || SEM_REFERENCIA;
    if (referencias.some((o) => o.valor === chave)) setReferencia(chave);
  }

  /** Clicar no nome: Lider abre o painel dele; os outros, a ficha. */
  function abrir(member: Member) {
    if (member.tier === 'LIDER' && !somenteBasico) navegador?.abrirLider(member.id);
    else navegador?.abrirPessoa(member.id);
  }
  const verFicha = (member: Member) => navegador?.abrirPessoa(member.id);
  const verPainel = (member: Member) => navegador?.abrirLider(member.id);
  /** Editar abre por cima da lista; salvar volta para ela, como estava. */
  const openEdit = (member: Member) => navegador?.editar(member.id);

  async function handleRemove() {
    if (!removing) return;
    try {
      await memberRepository.remove(removing.id);
      toast.success('Integrante excluido.');
    } catch {
      toast.error('Não foi possível excluir o integrante.');
    } finally {
      setRemoving(null);
    }
  }

  /**
   * Grava UMA pessoa conferida da planilha.
   *
   * O destino e o mesmo do botao de adicionar daquela pagina: na do time, a
   * ficha do integrante; na do lider, o Formulario 2 — que tambem cria o
   * integrante (migration 044). A planilha nao e um caminho paralelo.
   */
  const salvarDaPlanilha = async (pessoa: {
    name: string;
    phone: string;
    voterId: string;
    zone: string;
    section: string;
    state: string;
    city: string;
    district: string;
    street: string;
    photoVerified: string;
    reference: string;
  }) => {
    const ficha = {
      name: pessoa.name.trim(),
      phone: pessoa.phone,
      voterId: pessoa.voterId || null,
      zone: pessoa.zone || null,
      section: pessoa.section || null,
      // O endereco foi escolhido na conferencia, na mesma cadeia da ficha.
      state: pessoa.state || null,
      city: pessoa.city || null,
      district: pessoa.district || null,
      street: pessoa.street || null,
      // "VERIFICADO POR FOTO": SIM = true, NÃO = false, em branco = nulo.
      photoVerified: verificadoPorFotoParaGravar(pessoa.photoVerified),
      // "REFERÊNCIA": vai como veio; em branco, a pessoa simplesmente nao tem.
      reference: pessoa.reference.trim() || null,
    };

    if (addForm === 'formulario-2') {
      // Sem `answers`: a planilha traz os seis campos, e nenhuma pergunta
      // propria do Formulario 2.
      await submitOwnSurveyAnswer({ ...ficha, answers: [], bulkImport: true });
      return;
    }

    await memberRepository.create({
      ...ficha,
      clientId: client.id,
      source: 'admin',
      // Veio da planilha: telefone ja usado no time nao recusa a pessoa —
      // ela entra, e o que nao nasce e o acesso dela.
      bulkImport: true,
      // A planilha nao traz foto, pergunta do formulario nem aceite: quem
      // preenche por planilha nao esta diante do aviso de privacidade.
      photo: null,
      responses: [],
      consentAt: null,
    });
  };

  function openCreate() {
    setFormOpen(true);
  }

  /**
   * Baixa a equipe em planilha: Nome, Telefone e Cadastrado por.
   *
   * Sai o que esta na tela. Sem pesquisa e sem filtro — que e como a pagina
   * abre —, sai o time inteiro; com um deles ligado, sai o recorte que quem
   * pediu esta olhando, e o aviso diz quantas pessoas foram. Exportar uma
   * lista diferente da que esta a vista seria a pior das duas opcoes.
   *
   * O arquivo e montado aqui mesmo, sobre a lista que a pagina ja recebeu:
   * nenhuma requisicao nova, e nenhum dado alem do que a tela ja mostra.
   */
  function exportar() {
    if (filtered.length === 0) return;

    baixarCsv(nomeDoArquivo(client.name), montarCsvDaEquipe(filtered));
    toast.success(
      filtered.length === 1
        ? 'Planilha baixada com 1 pessoa.'
        : `Planilha baixada com ${filtered.length} pessoas.`,
    );
  }

  const rotuloExportar =
    filtered.length === ordered.length
      ? 'Exportar a equipe em planilha'
      : `Exportar em planilha as ${filtered.length} pessoas desta busca`;

  const botaoExportar = podeExportar ? (
    <Button
      variant="secondary"
      onClick={exportar}
      disabled={filtered.length === 0}
      title={rotuloExportar}
      aria-label={rotuloExportar}
    >
      <Download aria-hidden="true" className="size-4" />
      Exportar
    </Button>
  ) : null;

  /**
   * PDF dos Lideres por referencia: o time inteiro (nao o recorte da busca),
   * com as referencias escolhidas na janela. Mesma regra da planilha: so
   * quem pode exportar.
   */
  const botaoPdfDeLideres =
    podeExportar && contagens.lideres > 0 ? (
      <Button
        variant="secondary"
        onClick={() => setPdfDeLideres(true)}
        title="Baixar o PDF dos líderes por referência"
        aria-label="Baixar o PDF dos líderes por referência"
      >
        <FileText aria-hidden="true" className="size-4" />
        PDF dos líderes
      </Button>
    ) : null;

  const importar = podeCriar ? (
    <SpreadsheetImportModal
      open={planilhaAberta}
      onClose={() => setPlanilhaAberta(false)}
      // Estado e municipio sao fixos (Alagoas, Palmeira dos Indios): a
      // propria conferencia os preenche e trava — ver `ENDERECO_FIXO`.
      salvar={salvarDaPlanilha}
    />
  ) : null;

  const botaoPlanilha = podeCriar ? (
    <Button variant="secondary" onClick={() => setPlanilhaAberta(true)}>
      <FileSpreadsheet aria-hidden="true" className="size-4" />
      Planilha
    </Button>
  ) : null;

  if (!loading && members.length === 0) {
    return (
      <>
        <EmptyState
          icon={<Users className="size-6" />}
          title="Nenhum integrante cadastrado"
          description={
            addForm === 'formulario-2'
              ? 'Compartilhe o seu link para receber cadastros, ou preencha o Formulário 2 com a pessoa na frente de você.'
              : 'Compartilhe o link de convite para receber cadastros ou adicione um integrante manualmente.'
          }
          action={
            podeCriar ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                {botaoPlanilha}
                <Button onClick={openCreate}>
                  <UserPlus aria-hidden="true" className="size-4" />
                  {rotuloAdicionar}
                </Button>
              </div>
            ) : undefined
          }
        />
        {importar}

        {addForm === 'formulario-2' ? (
          <SurveyAnswerModal open={formOpen} onClose={() => setFormOpen(false)} />
        ) : (
          <MemberFormModal
            open={formOpen}
            client={client}
            member={null}
            onClose={() => setFormOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* A busca: uma caixa so, que acha por qualquer dado da pessoa. */}
      <div className="space-y-3 rounded-card border border-line bg-surface p-3 shadow-card sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            id="busca-integrantes"
            value={term}
            onChange={setTerm}
            label="Buscar pessoas por nome, telefone, CPF, título, bairro, rua, zona e seção ou responsável"
            placeholder={
              somenteBasico
                ? 'Buscar por nome ou telefone'
                : 'Buscar por nome, telefone, CPF, título, bairro, rua ou responsável'
            }
            className="lg:flex-1"
          />
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {botaoPdfDeLideres}
            {botaoExportar}
            {podeCriar ? (
              // O rotulo curto cabe na barra; o completo fica no titulo e na
              // leitura por tecnologia assistiva, dizendo QUAL formulario abre.
              <>
                {botaoPlanilha}
                <Button onClick={openCreate} title={rotuloAdicionar} aria-label={rotuloAdicionar}>
                  <UserPlus aria-hidden="true" className="size-4" />
                  Adicionar
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {/* Na pagina do Lider a lista inteira e a Equipe dele, e ele ve so
            o basico: os filtros sao de quem ve o time todo. */}
        {!somenteBasico ? (
          <div className="space-y-3">
            {/* Os dois recortes que mais se usa, sempre a vista. */}
            <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-between">
              <Segmentos
                rotulo="Nível"
                valor={nivel}
                onChange={(v) => setNivel(v as 'todos' | 'referencia' | TeamTier)}
                opcoes={[
                  { valor: 'todos', rotulo: 'Todos', quantidade: ordered.length },
                  { valor: 'LIDER', rotulo: 'Líderes', quantidade: contagens.lideres },
                  { valor: 'EQUIPE', rotulo: 'Liderados', quantidade: contagens.equipe },
                  // O time agrupado pela referencia dos Lideres (a Equipe herda a do Lider).
                  { valor: 'referencia', rotulo: 'Por referência', quantidade: contagens.referencias, icone: <BookmarkCheck className="size-3.5" /> },
                ]}
              />
              <Segmentos
                rotulo="Situação"
                valor={situacao}
                onChange={(v) => setSituacao(v as typeof situacao)}
                opcoes={[
                  { valor: 'todas', rotulo: 'Todas' },
                  { valor: 'conferir', rotulo: 'Para conferir', quantidade: contagens.conferir, tom: 'danger' },
                  { valor: 'incompleto', rotulo: 'Incompletos', quantidade: contagens.incompleto, tom: 'warning' },
                  { valor: 'em-ordem', rotulo: 'Em ordem', quantidade: contagens.emOrdem, tom: 'success' },
                ]}
              />
            </div>

            {/* O resto dos recortes em grade, cada um com o nome em cima e a
                contagem em cada opcao. So aparece o filtro que tem o que
                filtrar. */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              {responsaveis.length > 1 ? (
                <FiltroEmCaixa
                  id="filtro-responsavel"
                  rotulo="Líder / quem cadastrou"
                  valor={recruiter}
                  padrao="todos"
                  onChange={setRecruiter}
                  opcoes={[
                    { valor: 'todos', rotulo: 'Qualquer um' },
                    ...responsaveis.map((option) => ({
                      valor: option.key,
                      rotulo: `${option.label} (${option.count})`,
                    })),
                  ]}
                />
              ) : null}
              {referencias.length > 0 ? (
                <FiltroEmCaixa
                  id="filtro-referencia"
                  rotulo="Referência"
                  valor={referencia}
                  padrao="todas"
                  onChange={setReferencia}
                  opcoes={[
                    { valor: 'todas', rotulo: 'Todas' },
                    ...referencias.map((opcao) => ({
                      valor: opcao.valor,
                      rotulo: `${opcao.rotulo} (${opcao.quantidade})`,
                    })),
                  ]}
                />
              ) : null}
              {fotos.sim + fotos.nao > 0 ? (
                <FiltroEmCaixa
                  id="filtro-foto"
                  rotulo="Verificado por foto"
                  valor={foto}
                  padrao="todos"
                  onChange={(v) => setFoto(v as FiltroDeFoto)}
                  opcoes={[
                    { valor: 'todos', rotulo: 'Todos' },
                    { valor: 'sim', rotulo: `Sim (${fotos.sim})` },
                    { valor: 'nao', rotulo: `Não (${fotos.nao})` },
                    ...(fotos.sem > 0 ? [{ valor: 'sem', rotulo: `Não informado (${fotos.sem})` }] : []),
                  ]}
                />
              ) : null}
              {zonas.length > 1 ? (
                <FiltroEmCaixa
                  id="filtro-zona"
                  rotulo="Zona eleitoral"
                  valor={zona}
                  padrao="todas"
                  onChange={setZona}
                  opcoes={[
                    { valor: 'todas', rotulo: 'Todas' },
                    ...zonas.map((opcao) => ({
                      valor: opcao.valor,
                      rotulo: `${opcao.rotulo} (${opcao.quantidade})`,
                    })),
                  ]}
                />
              ) : null}
              {tags.length > 0 ? (
                <FiltroEmCaixa
                  id="filtro-tag"
                  rotulo="Tag do Líder"
                  valor={tag}
                  padrao="todas"
                  onChange={setTag}
                  opcoes={[
                    { valor: 'todas', rotulo: 'Todas' },
                    ...tags.map((opcao) => ({
                      valor: opcao.valor,
                      rotulo: `${opcao.rotulo} (${opcao.quantidade})`,
                    })),
                  ]}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {/* O que esta ligado, dito em uma linha — e desligavel peca por peca. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
          <span className="font-semibold text-ink-900 tabular-nums">
            {filtered.length === ordered.length
              ? `${ordered.length} ${ordered.length === 1 ? 'pessoa' : 'pessoas'}`
              : `${filtered.length} de ${ordered.length}`}
          </span>
          {filtrosAtivos.map((filtro) => (
            <button
              key={filtro.id}
              type="button"
              onClick={filtro.limpar}
              className="inline-flex items-center gap-1 rounded-pill bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700 transition-colors hover:bg-accent-100"
              aria-label={`Tirar o filtro ${filtro.rotulo}`}
            >
              {filtro.rotulo}
              <X aria-hidden="true" className="size-3" />
            </button>
          ))}
          {filtrosAtivos.length > 1 ? (
            <button type="button" onClick={limparTudo} className="text-xs font-medium text-ink-500 hover:text-ink-900">
              Limpar tudo
            </button>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          icon={<SearchX className="size-5" />}
          title="Ninguém com esses filtros"
          description={
            term.trim()
              ? `Nada encontrado para "${term.trim()}" — a busca olha nome, telefone, CPF, título, bairro, rua, responsável e tag.`
              : 'Nenhuma pessoa combina com os filtros escolhidos.'
          }
          action={
            <Button variant="secondary" onClick={limparTudo}>
              Limpar filtros
            </Button>
          }
        />
      ) : nivel === 'referencia' ? (
        <EquipePorReferencia pessoas={filtered} time={ordered} onAbrirPessoa={verFicha} onAbrirLider={verPainel} />
      ) : (
        <>
          {/* Celular e tablet: cartoes empilhados */}
          <ul className="space-y-3 lg:hidden">
            {filtered.map((member) => (
              <li key={member.id}>
                <Card>
                  <CardBody className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Avatar name={member.name} src={member.photo} size="md" />
                      <div className="min-w-0 flex-1">
                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => abrir(member)}
                            className="block min-w-0 wrap-break-word text-left text-sm font-semibold text-ink-900 hover:text-brand-700"
                          >
                            {member.name}
                          </button>
                          <TagDoLider member={member} onClick={somenteBasico ? undefined : () => filtrarPelaTag(member)} />
                          {!somenteBasico ? <TagDaReferencia member={member} onClick={() => filtrarPelaReferencia(member)} /> : null}
                        </span>
                        {!somenteBasico ? <SeloDaLinha member={member} /> : null}
                        <AchadoEm campos={achadoEm.get(member.id)} />
                        <p className="mt-1 wrap-break-word text-sm text-ink-500 tabular-nums">
                          {member.phone ? formatPhone(member.phone) : 'Sem telefone'}
                        </p>
                        {member.email ? <p className="break-all text-xs text-ink-500">{member.email}</p> : null}
                      </div>
                    </div>

                    {!somenteBasico ? (
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-control bg-ink-50 p-2.5 text-xs">
                        <div className="min-w-0">
                          <dt className="text-ink-500">Título</dt>
                          <dd className="mt-0.5">
                            <TituloDaLinha voterId={member.voterId} />
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-ink-500">Zona · Seção</dt>
                          <dd className="mt-0.5 font-medium text-ink-900 tabular-nums">
                            {member.zone || member.section ? `${member.zone ?? '–'} · ${member.section ?? '–'}` : <Vazio />}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-ink-500">Referência</dt>
                          <dd className="mt-0.5 wrap-break-word font-medium text-ink-900">{member.reference || <Vazio />}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-ink-500">Verificado por foto</dt>
                          <dd className="mt-0.5">
                            <FotoDaLinha member={member} comTexto />
                          </dd>
                        </div>
                        <div className="col-span-2 min-w-0">
                          <dt className="text-ink-500">Líder</dt>
                          <dd className="mt-0.5">
                            <RecruitedBy recruiter={member.recruitedBy} />
                          </dd>
                        </div>
                      </dl>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      {member.tier === 'LIDER' && !somenteBasico ? (
                        <Button size="sm" onClick={() => verPainel(member)}>
                          <BarChart3 aria-hidden="true" className="size-4" />
                          Painel do Líder
                        </Button>
                      ) : null}
                      <Button variant="secondary" size="sm" onClick={() => verFicha(member)}>
                        <Eye aria-hidden="true" className="size-4" />
                        Ficha
                      </Button>
                      {podeEditar && !member.fromSheet ? (
                        <Button variant="secondary" size="sm" onClick={() => openEdit(member)}>
                          <Pencil aria-hidden="true" className="size-4" />
                          Editar
                        </Button>
                      ) : null}
                      {podeExcluir && !member.fromSheet ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger-600 hover:bg-danger-50"
                          onClick={() => setRemoving(member)}
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                          Excluir
                        </Button>
                      ) : null}
                    </div>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>

          {/* Desktop: tabela para leitura rapida */}
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <caption className="sr-only">Integrantes da equipe de {client.name}</caption>
              <thead className="border-b border-line bg-ink-50 text-[0.6875rem] tracking-[0.06em] text-ink-500 uppercase">
                {somenteBasico ? (
                  <tr>
                    <th scope="col" className="w-[52%] px-4 py-3 font-semibold">Integrante</th>
                    <th scope="col" className="w-[32%] px-4 py-3 font-semibold">Telefone</th>
                    <th scope="col" className="w-[16%] px-4 py-3 text-right font-semibold">Ações</th>
                  </tr>
                ) : (
                  <tr>
                    <th scope="col" className="w-[23%] px-4 py-3 font-semibold">Integrante</th>
                    <th scope="col" className="w-[13%] px-3 py-3 font-semibold">Título</th>
                    <th scope="col" className="w-[9%] px-3 py-3 font-semibold whitespace-nowrap">Zona/Seção</th>
                    <th scope="col" className="w-[12%] px-3 py-3 font-semibold">Telefone</th>
                    <th scope="col" className="w-[15%] px-3 py-3 font-semibold">Líder</th>
                    <th scope="col" className="w-[12%] px-3 py-3 font-semibold">Referência</th>
                    <th scope="col" className="w-[5%] px-2 py-3 text-center font-semibold" title="Verificado por foto">
                      Foto
                    </th>
                    <th scope="col" className="w-[11%] px-4 py-3 text-right font-semibold">Ações</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((member) => (
                  <tr key={member.id} className="group transition-colors hover:bg-ink-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={member.name} src={member.photo} size="sm" />
                        <span className="min-w-0">
                          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => abrir(member)}
                              className="block min-w-0 wrap-break-word text-left font-semibold text-ink-900 hover:text-brand-700 hover:underline"
                              title={member.tier === 'LIDER' && !somenteBasico ? 'Abrir o painel do Líder' : 'Abrir a ficha'}
                            >
                              {member.name}
                            </button>
                            <TagDoLider member={member} onClick={somenteBasico ? undefined : () => filtrarPelaTag(member)} />
                            {!somenteBasico ? <TagDaReferencia member={member} onClick={() => filtrarPelaReferencia(member)} /> : null}
                          </span>
                          {!somenteBasico ? <SeloDaLinha member={member} /> : null}
                          {!somenteBasico && member.email ? (
                            <span className="block break-all text-xs text-ink-500">{member.email}</span>
                          ) : null}
                          <AchadoEm campos={achadoEm.get(member.id)} />
                        </span>
                      </div>
                    </td>
                    {!somenteBasico ? (
                      <>
                        <td className="px-3 py-3">
                          <TituloDaLinha voterId={member.voterId} />
                        </td>
                        <td className="px-3 py-3 text-ink-700 tabular-nums">
                          {member.zone || member.section ? (
                            <span className="whitespace-nowrap">
                              {member.zone ?? '–'}
                              <span className="px-1 text-ink-400">·</span>
                              {member.section ?? '–'}
                            </span>
                          ) : (
                            <Vazio />
                          )}
                        </td>
                      </>
                    ) : null}
                    <td className={cn('py-3 text-ink-700 tabular-nums', somenteBasico ? 'px-4' : 'px-3')}>
                      {member.phone ? <span className="whitespace-nowrap">{formatPhone(member.phone)}</span> : <Vazio />}
                    </td>
                    {!somenteBasico ? (
                      <>
                        <td className="px-3 py-3">
                          <RecruitedBy recruiter={member.recruitedBy} />
                        </td>
                        <td className="px-3 py-3">
                          {member.reference ? (
                            <button
                              type="button"
                              onClick={() => filtrarPelaReferencia(member)}
                              title={`Filtrar pela referência ${member.reference}`}
                              className="block max-w-full wrap-break-word rounded-pill bg-ink-100 px-2 py-0.5 text-left text-xs font-medium text-ink-700 transition-colors hover:bg-accent-50 hover:text-accent-700"
                            >
                              {member.reference}
                            </button>
                          ) : (
                            <Vazio />
                          )}
                        </td>
                        <td className="px-2 py-3 text-center">
                          <FotoDaLinha member={member} />
                        </td>
                      </>
                    ) : null}
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-0.5">
                        {member.tier === 'LIDER' && !somenteBasico ? (
                          <IconButton
                            label={`Painel do Líder ${member.name}`}
                            icon={<BarChart3 className="size-4" />}
                            onClick={() => verPainel(member)}
                          />
                        ) : null}
                        <IconButton
                          label={`Ver ficha de ${member.name}`}
                          icon={<Eye className="size-4" />}
                          onClick={() => verFicha(member)}
                        />
                        {podeEditar && !member.fromSheet ? (
                          <IconButton
                            label={`Editar ${member.name}`}
                            icon={<Pencil className="size-4" />}
                            onClick={() => openEdit(member)}
                          />
                        ) : null}
                        {podeExcluir && !member.fromSheet ? (
                          <IconButton
                            label={`Excluir ${member.name}`}
                            icon={<Trash2 className="size-4" />}
                            variant="danger"
                            onClick={() => setRemoving(member)}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {importar}
      {botaoPdfDeLideres ? <PdfDeLideresModal open={pdfDeLideres} onClose={() => setPdfDeLideres(false)} members={ordered} /> : null}

      {/* Adicionar abre o formulario que a pagina escolheu. EDITAR abre
          pelo navegador, e e sempre a ficha do integrante, porque e uma
          ficha de integrante que esta sendo corrigida. */}
      {addForm === 'formulario-2' ? (
        <SurveyAnswerModal open={formOpen} onClose={() => setFormOpen(false)} />
      ) : (
        <MemberFormModal open={formOpen} client={client} member={null} onClose={() => setFormOpen(false)} />
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Excluir integrante"
        description={`"${removing?.name ?? ''}" será removido da equipe de ${client.name}. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir integrante"
        onCancel={() => setRemoving(null)}
        onConfirm={handleRemove}
        details={
          <p className="rounded-control bg-ink-50 p-3 text-sm text-ink-700">
            A foto e todas as respostas do formulário também serão apagadas.
          </p>
        }
      />
    </div>
  );
}

/** "achado no CPF": por que a pessoa apareceu, quando nao foi pelo nome. */
function AchadoEm({ campos }: { campos: CampoDaBusca[] | undefined }) {
  if (!campos?.length) return null;
  return (
    <span className="mt-0.5 inline-flex items-center gap-1 rounded-pill bg-accent-50 px-2 py-0.5 text-[0.6875rem] font-medium text-accent-700">
      achado {campos.length === 1 ? 'no campo' : 'nos campos'} {campos.join(', ')}
    </span>
  );
}

/** Botoes lado a lado, com a contagem: um so ligado por vez. */
function Segmentos({
  rotulo,
  valor,
  onChange,
  opcoes,
}: {
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  opcoes: { valor: string; rotulo: string; quantidade?: number; tom?: 'danger' | 'warning' | 'success'; icone?: ReactNode }[];
}) {
  const ponto = { danger: 'bg-danger-600', warning: 'bg-warning-600', success: 'bg-success-600' };
  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap items-center gap-1 rounded-control bg-ink-50 p-1">
      {opcoes.map((opcao) => {
        const ativo = opcao.valor === valor;
        return (
          <button
            key={opcao.valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(opcao.valor)}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-3 text-xs font-medium whitespace-nowrap transition-colors',
              ativo ? 'bg-surface text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-900',
            )}
          >
            {opcao.tom ? <span aria-hidden="true" className={cn('size-1.5 rounded-full', ponto[opcao.tom])} /> : null}
            {opcao.icone ? <span aria-hidden="true" className={ativo ? 'text-gold-600' : 'text-ink-400'}>{opcao.icone}</span> : null}
            {opcao.rotulo}
            {opcao.quantidade !== undefined ? (
              <span className={cn('tabular-nums', ativo ? 'text-ink-500' : 'text-ink-400')}>{opcao.quantidade}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Um filtro de lista: o nome em cima, a escolha embaixo. Ligado (fora do
 * padrao), a caixa fica destacada — da para ver de longe o que esta
 * recortando a lista.
 */
function FiltroEmCaixa({
  id,
  rotulo,
  valor,
  padrao,
  onChange,
  opcoes,
}: {
  id: string;
  rotulo: string;
  valor: string;
  padrao: string;
  onChange: (valor: string) => void;
  opcoes: { valor: string; rotulo: string }[];
}) {
  const ligado = valor !== padrao;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span
        id={`${id}-rotulo`}
        className={cn(
          'wrap-break-word text-[0.6875rem] font-semibold tracking-[0.08em] uppercase',
          ligado ? 'text-accent-700' : 'text-ink-500',
        )}
      >
        {rotulo}
      </span>
      <Dropdown
        id={id}
        aria-labelledby={`${id}-rotulo`}
        value={valor}
        highlighted={ligado}
        onChange={onChange}
        options={opcoes.map((opcao) => ({ value: opcao.valor, label: opcao.rotulo }))}
      />
    </div>
  );
}

/** Etiquetas de uma linha: nivel, situacao e de onde a pessoa veio. */
function SeloDaLinha({ member }: { member: Member }) {
  const classe = 'px-2 py-0.5 text-[0.6875rem]';
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      <TierBadge tier={member.tier} className={classe} />
      {/* Lider desativado pelo ADMIN geral: sem painel e sem link de
          cadastro. A Equipe dele continua na lista. */}
      {member.tier === 'LIDER' && member.access === 'DISABLED' ? (
        <Badge tone="danger" title="Sem acesso ao painel e com o link de cadastro desligado" className={classe}>
          Desativado
        </Badge>
      ) : null}
      {precisaConferir(member) ? (
        <Badge tone="danger" title={avisoDeConferencia(member)} className={classe}>
          Conferir
        </Badge>
      ) : null}
      {cadastroIncompleto(member) ? (
        <Badge tone="warning" title={avisoDeFaltas(member)} className={classe}>
          Incompleto
        </Badge>
      ) : null}
      {/* Da planilha, so com a "DATA DE CADASTRO" preenchida: sem ela nao ha
          data para mostrar. */}
      {member.semDataDeCadastro ? null : (
        <span className="text-[0.6875rem] text-ink-400 tabular-nums" title="Data do cadastro">
          {formatDate(member.createdAt)}
        </span>
      )}
    </span>
  );
}

/** O titulo como se le no papel; com problema, em vermelho e com o motivo. */
function TituloDaLinha({ voterId }: { voterId: string | null }) {
  const legivel = tituloLegivel(voterId);
  if (!legivel) return <Vazio />;
  const problema = problemaDoTitulo(voterId);
  return (
    <span
      title={problema ?? undefined}
      className={cn(
        'whitespace-nowrap tabular-nums',
        problema ? 'font-semibold text-danger-600' : 'text-ink-700',
      )}
    >
      {legivel}
    </span>
  );
}

/** VERIFICADO POR FOTO: um sinal so, que se le de relance. */
function FotoDaLinha({ member, comTexto = false }: { member: Member; comTexto?: boolean }) {
  const situacao = situacaoDaFoto(member);
  if (situacao === 'sem') return <Vazio />;
  const sim = situacao === 'sim';
  return (
    <span
      title={sim ? 'Verificado por foto' : 'Não verificado por foto'}
      className="inline-flex items-center gap-1.5 font-medium"
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 items-center justify-center rounded-full',
          sim ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600',
        )}
      >
        {sim ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
      </span>
      {comTexto ? (
        <span className={sim ? 'text-success-700' : 'text-danger-600'}>{sim ? 'Sim' : 'Não'}</span>
      ) : (
        <span className="sr-only">{sim ? 'Sim' : 'Não'}</span>
      )}
    </span>
  );
}

/** Campo sem valor: um traco discreto, e nao um buraco na linha. */
function Vazio() {
  return (
    <span className="text-ink-400" aria-label="não informado">
      —
    </span>
  );
}
