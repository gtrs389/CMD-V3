'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Copy,
  Filter,
  IdCard,
  MapPin,
  PencilLine,
  School,
  Search,
  Tag,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import type { Member } from '@/lib/types';
import { ACCESS_STATUS_LABELS } from '@/lib/types';
import { cadastrosRepetidos } from '@/lib/domain/inconsistencias';
import { perfilDoLider, SELO_EXPLICACAO, type Selo } from '@/lib/domain/perfil-do-lider';
import { buscarPessoa } from '@/lib/domain/busca-de-pessoas';
import { camposFaltantes } from '@/lib/domain/member-completeness';
import { dadosParaConferir } from '@/lib/domain/conferencia';
import { recruiterText } from '@/lib/domain/recruitment';
import { formatDate, formatLongDate } from '@/lib/utils/date';
import { formatPhone } from '@/lib/utils/phone';
import { formatNumber, pluralize } from '@/lib/utils/text';
import { cn } from '@/lib/utils/cn';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useSession } from '@/components/layout/SessionProvider';
import { EditarTagModal, NomeComTag, TagDoLider } from './TagDoLider';
import { TagDaReferencia } from './TagDaReferencia';
import { OndeAEquipeVota, type RecorteDaEquipe } from './OndeAEquipeVota';
import { BotaoVoltar } from '@/components/ui/BotaoVoltar';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import {
  indiceDeLocais,
  localDaPessoa,
  numeroEleitoral,
  ondeAEquipeVota,
  type LocalDeVotacao,
} from '@/lib/domain/onde-a-equipe-vota';

const TOM_DO_SELO: Record<Selo, string> = {
  Motor: 'bg-success-50 text-success-700',
  Constante: 'bg-accent-50 text-accent-700',
  Esfriando: 'bg-warning-50 text-warning-600',
  Parado: 'bg-danger-50 text-danger-700',
  'Sem Equipe': 'bg-ink-100 text-ink-700',
};

/**
 * O painel de um Lider: quanto trouxe, em que ritmo, onde, e em que estado
 * esta a Equipe dele.
 *
 * Abre quando se clica em um Lider — na lista do time ou no ranking. Tudo
 * sai da lista que a pagina ja tem: nenhuma consulta a mais. Cada pessoa da
 * Equipe abre a propria ficha, e "Ver na lista" filtra a lista do time pela
 * Equipe dele.
 *
 * Abre na TELA INTEIRA, com o voltar vermelho, e mostra onde a Equipe vota:
 * a escola de cada pessoa (pela zona e secao, na tabela de locais do TSE) e
 * os graficos de escolas, zonas e secoes — tocar num deles recorta a lista.
 */
export function LiderPanel({
  lider,
  members,
  onClose,
  onOpenMember,
  onFiltrarEquipe,
  onBack,
  backLabel,
  inactive,
}: {
  lider: Member;
  members: Member[];
  onClose: () => void;
  onOpenMember: (member: Member) => void;
  /** Filtra a lista do time pela Equipe deste Lider. */
  onFiltrarEquipe?: () => void;
  /** Pilha de janelas (ver `NavegadorDePessoas`). */
  onBack?: () => void;
  backLabel?: string;
  inactive?: boolean;
}) {
  const repetidos = useMemo(() => cadastrosRepetidos(members), [members]);
  const p = useMemo(() => perfilDoLider(lider, members, repetidos), [lider, members, repetidos]);
  const [busca, setBusca] = useState('');
  const [aba, setAba] = useState<'todos' | 'conferir' | 'incompletos' | 'repetidos'>('todos');

  const idsConferir = useMemo(() => new Set(p.paraConferir.map((x) => x.member.id)), [p]);
  const idsIncompletos = useMemo(() => new Set(p.incompletos.map((x) => x.member.id)), [p]);
  const idsRepetidos = useMemo(() => new Set(p.repetidos.map((x) => x.member.id)), [p]);

  const equipeVisivel = useMemo(
    () =>
      p.equipe.filter((m) => {
        if (aba === 'conferir' && !idsConferir.has(m.id)) return false;
        if (aba === 'incompletos' && !idsIncompletos.has(m.id)) return false;
        if (aba === 'repetidos' && !idsRepetidos.has(m.id)) return false;
        return buscarPessoa(m, busca).achou;
      }),
    [p, aba, busca, idsConferir, idsIncompletos, idsRepetidos],
  );

  const { can } = useSession();
  // Lider que so existe na planilha do Sheets (052) nao tem onde guardar tag.
  const podeEditarTag = can('member.update') && !lider.fromSheet;
  const [editandoTag, setEditandoTag] = useState(false);

  const maiorSemana = Math.max(1, ...p.semanas.map((s) => s.quantidade));
  const acimaDaMedia = p.total - p.mediaDoTime;
  const primeiroNome = lider.name.trim().split(/\s+/)[0] ?? lider.name;

  /**
   * Onde a Equipe vota: as escolas das zonas da Equipe, pela tabela do TSE.
   * Uma consulta so, com as zonas de todo mundo; a conta e feita aqui.
   */
  const zonasDaEquipe = useMemo(
    () => [...new Set(p.equipe.map((m) => numeroEleitoral(m.zone)).filter((z): z is number => z !== null))].sort((a, b) => a - b).join(','),
    [p.equipe],
  );
  const loaderDosLocais = useCallback(
    () =>
      zonasDaEquipe
        ? api<{ locais: LocalDeVotacao[] }>(`/api/clients/${encodeURIComponent(lider.clientId)}/locais-de-votacao?zonas=${zonasDaEquipe}`)
        : Promise.resolve({ locais: [] as LocalDeVotacao[] }),
    [lider.clientId, zonasDaEquipe],
  );
  const locais = useRepositoryQuery(loaderDosLocais);
  const indice = useMemo(() => indiceDeLocais(locais.data?.locais ?? []), [locais.data]);
  const ondeVota = useMemo(() => (locais.data || locais.error ? ondeAEquipeVota(p.equipe, indice) : null), [locais.data, locais.error, p.equipe, indice]);
  const [recorte, setRecorte] = useState<RecorteDaEquipe>(null);
  const passaNoRecorte = (m: Member) => {
    if (!recorte) return true;
    const zona = numeroEleitoral(m.zone);
    if (recorte.tipo === 'zona') return zona === recorte.zona;
    if (recorte.tipo === 'secao') return zona === recorte.zona && numeroEleitoral(m.section) === recorte.secao;
    return localDaPessoa(indice, m)?.id === recorte.id;
  };
  const equipeNaLista = equipeVisivel.filter(passaNoRecorte);
  const lista = useRef<HTMLElement>(null);
  const recortar = (r: RecorteDaEquipe) => {
    setRecorte(r);
    if (r) window.setTimeout(() => lista.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const cabecalho = (
    <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-navy-900 via-navy-800 to-[#1e3a8a] px-4 py-4 text-white sm:px-6">
      <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0" />
      <span aria-hidden="true" className="cmd-orbe pointer-events-none absolute -top-24 -right-10 size-72 rounded-full bg-gold-500/20 blur-3xl" />
      <div className="relative mx-auto flex max-w-[1500px] flex-wrap items-start gap-4">
        <BotaoVoltar onClick={onBack ?? onClose} rotulo={backLabel ?? 'Equipe'} />
        <Avatar name={lider.name} src={lider.photo} size="xl" className="rounded-card ring-2 ring-white/20" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.625rem] font-bold tracking-[0.16em] text-gold-400 uppercase">Painel do Líder</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h2 className="text-xl leading-tight font-bold wrap-break-word sm:text-2xl">{lider.name}</h2>
            <TagDoLider member={lider} className="px-2.5 py-1 text-xs" />
            <TagDaReferencia member={lider} className="px-2.5 py-1 text-xs" />
            <span className={cn('rounded-pill px-2.5 py-1 text-xs font-semibold', TOM_DO_SELO[p.selo])} title={SELO_EXPLICACAO[p.selo]}>
              {p.selo}
            </span>
            {lider.access === 'DISABLED' && !lider.fromSheet ? (
              <span className="rounded-pill bg-danger-50 px-2.5 py-1 text-xs font-semibold text-danger-700" title="Sem acesso ao painel e com o link de cadastro desligado">
                Desativado
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-white/75">
            {lider.phone ? formatPhone(lider.phone) : 'Sem telefone'}
            {lider.semDataDeCadastro ? null : ` · Líder desde ${formatLongDate(lider.createdAt)}`}
            {lider.zone || lider.section ? ` · vota na Zona ${lider.zone ?? '?'}, Seção ${lider.section ?? '?'}` : ''}
          </p>
          <p className="text-xs text-white/60">
            Trazido por {recruiterText(lider.recruitedBy)} ·{' '}
            <span className={lider.access === 'ACTIVE' ? 'text-success-400' : 'text-danger-200'}>{ACCESS_STATUS_LABELS[lider.access]}</span>
            {' · '}
            {SELO_EXPLICACAO[p.selo]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-center">
          {podeEditarTag ? (
            <button
              type="button"
              onClick={() => setEditandoTag(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-white/20 bg-white/10 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
            >
              <Tag aria-hidden="true" className="size-3.5" />
              {lider.tag ? 'Trocar a tag' : 'Colocar tag'}
            </button>
          ) : null}
          {onFiltrarEquipe && p.total > 0 ? (
            <button
              type="button"
              onClick={onFiltrarEquipe}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-white/20 bg-white/10 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
            >
              <Filter aria-hidden="true" className="size-3.5" />
              Ver a Equipe na lista
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenMember(lider)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-pill bg-gradient-to-r from-gold-400 to-gold-500 px-4 text-xs font-bold text-navy-900 shadow-[0_10px_24px_-10px_rgba(242,193,78,0.9)] transition-transform hover:-translate-y-0.5"
          >
            <IdCard aria-hidden="true" className="size-4" />
            Ficha do Líder
          </button>
        </div>
      </div>
    </header>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Líder · ${lider.name}`}
      size="tela"
      header={cabecalho}
      onBack={onBack}
      backLabel={backLabel}
      inactive={inactive}
    >
      <div className="mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6">
        {/* Os numeros */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Numero
            icone={<Users className="size-4" />}
            valor={formatNumber(p.total)}
            rotulo={pluralize(p.total, 'pessoa na Equipe', 'pessoas na Equipe')}
            nota={
              p.mediaDoTime
                ? `${acimaDaMedia >= 0 ? '+' : ''}${formatNumber(Math.round(acimaDaMedia * 10) / 10)} da média do time (${formatNumber(p.mediaDoTime)})`
                : undefined
            }
            destaque
          />
          <Numero
            icone={<Trophy className="size-4" />}
            valor={p.total ? `${p.posicao}º` : '—'}
            rotulo={`de ${formatNumber(p.totalDeLideres)} Líderes`}
            nota={p.total ? `${formatNumber(p.participacao)}% dos cadastros de Líderes` : undefined}
          />
          <Numero
            icone={p.variacao7 >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
            valor={formatNumber(p.ultimos7)}
            rotulo="nos últimos 7 dias"
            nota={`${p.variacao7 >= 0 ? '+' : ''}${p.variacao7}% sobre a semana anterior · ${formatNumber(p.ultimos30)} em 30 dias`}
          />
          <Numero
            icone={<CalendarClock className="size-4" />}
            valor={p.diasSemCadastrar === null ? '—' : p.diasSemCadastrar === 0 ? 'Hoje' : `${p.diasSemCadastrar}d`}
            rotulo={p.diasSemCadastrar === null ? 'nenhum cadastro ainda' : 'desde o último cadastro'}
            nota={p.ultimoCadastro ? formatDate(p.ultimoCadastro) : undefined}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* Ritmo */}
          <section className="rounded-card border border-line bg-surface p-4">
            <Titulo>Ritmo — últimas 12 semanas</Titulo>
            <div className="flex h-32 items-end gap-1.5">
              {p.semanas.map((s, i) => (
                <div key={s.inicio} className="flex flex-1 flex-col items-center gap-1" title={`Semana de ${formatDate(s.inicio)}: ${s.quantidade}`}>
                  <span className="text-[0.625rem] font-semibold text-ink-700 tabular-nums">{s.quantidade || ''}</span>
                  <span
                    className={cn('w-full rounded-t-[3px]', i === p.semanas.length - 1 ? 'bg-accent-600' : 'bg-navy-700')}
                    style={{ height: `${Math.max(s.quantidade ? 6 : 2, (s.quantidade / maiorSemana) * 96)}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[0.625rem] text-ink-400">
              <span>{formatDate(p.semanas[0]?.inicio)}</span>
              <span>esta semana</span>
            </div>
          </section>

          {/* Qualidade da Equipe */}
          <section className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-[auto_1fr]">
            <div className="flex items-center gap-3 rounded-card bg-ink-50 p-3 sm:flex-col sm:justify-center sm:px-5">
              <span className={cn('text-3xl font-bold tabular-nums', p.saude >= 90 ? 'text-success-700' : p.saude >= 70 ? 'text-warning-600' : 'text-danger-600')}>
                {p.saude}%
              </span>
              <span className="text-xs text-ink-500 sm:text-center">
                da Equipe
                <br className="hidden sm:block" /> em ordem
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Contador icone={<AlertTriangle className="size-4" />} tom="danger" valor={p.paraConferir.length} rotulo="para conferir" ativo={aba === 'conferir'} onClick={() => setAba(aba === 'conferir' ? 'todos' : 'conferir')} />
              <Contador icone={<PencilLine className="size-4" />} tom="warning" valor={p.incompletos.length} rotulo="incompletos" ativo={aba === 'incompletos'} onClick={() => setAba(aba === 'incompletos' ? 'todos' : 'incompletos')} />
              <Contador icone={<Copy className="size-4" />} tom="danger" valor={p.repetidos.length} rotulo="repetidos" ativo={aba === 'repetidos'} onClick={() => setAba(aba === 'repetidos' ? 'todos' : 'repetidos')} />
            </div>
          </section>
        </div>

        {/* Onde a Equipe vota: escolas, zonas e secoes */}
        <OndeAEquipeVota nome={primeiroNome} total={p.total} dados={ondeVota} carregando={locais.loading} recorte={recorte} onRecorte={recortar} />

        {p.faltasPorCampo.length || p.bairros.length ? (
          <section className="grid gap-4 sm:grid-cols-2">
            {p.faltasPorCampo.length ? (
              <div className="rounded-card border border-line bg-surface p-4">
                <Titulo>O que mais falta na Equipe</Titulo>
                <Barras itens={p.faltasPorCampo} cor="bg-warning-600" />
              </div>
            ) : null}
            {p.bairros.length ? (
              <div className="rounded-card border border-line bg-surface p-4">
                <Titulo>
                  <MapPin aria-hidden="true" className="mr-1 inline size-3.5" />
                  Onde a Equipe mora
                </Titulo>
                <Barras itens={p.bairros} cor="bg-accent-600" />
              </div>
            ) : null}
          </section>
        ) : null}

        {p.repetidos.some((r) => r.outrosResponsaveis.length) ? (
          <p className="flex items-start gap-2 rounded-control bg-warning-50 px-3 py-2 text-sm text-warning-600">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              {p.repetidos
                .filter((r) => r.outrosResponsaveis.length)
                .slice(0, 3)
                .map((r) => `${r.member.name} também foi cadastrado por ${r.outrosResponsaveis.join(' e ')}`)
                .join('; ')}
              . O ranking conta essas pessoas duas vezes.
            </span>
          </p>
        ) : null}

        {/* A Equipe: cada pessoa com a zona, a secao e a escola onde vota */}
        <section ref={lista} className="scroll-mt-4 overflow-hidden rounded-card border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <Titulo semMargem>
              {aba === 'todos'
                ? `A Equipe (${formatNumber(p.total)})`
                : aba === 'conferir'
                  ? 'Para conferir'
                  : aba === 'incompletos'
                    ? 'Incompletos'
                    : 'Repetidos'}
              {recorte ? <span className="ml-2 rounded-pill bg-navy-900 px-2 py-0.5 text-[0.625rem] font-semibold text-gold-400 normal-case">{recorte.rotulo}</span> : null}
              {aba !== 'todos' || recorte ? (
                <button
                  type="button"
                  onClick={() => {
                    setAba('todos');
                    setRecorte(null);
                  }}
                  className="ml-2 text-xs font-medium text-brand-700 normal-case hover:underline"
                >
                  ver todos
                </button>
              ) : null}
            </Titulo>
            {p.total > 6 ? (
              <label className="relative w-full sm:w-72">
                <span className="sr-only">Buscar na Equipe</span>
                <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome, telefone, CPF, seção..."
                  className="h-10 w-full rounded-pill border border-line bg-surface pr-3 pl-9 text-sm text-ink-900 outline-none focus:border-accent-600"
                />
              </label>
            ) : null}
          </div>

          {p.total === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-500">{lider.name} ainda não cadastrou ninguém.</p>
          ) : equipeNaLista.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-500">Ninguém aqui.</p>
          ) : (
            <>
              <div className="hidden grid-cols-[minmax(0,1.4fr)_7rem_4rem_4rem_minmax(0,1.6fr)_auto] gap-3 border-b border-line bg-ink-50 px-4 py-2 text-[0.6875rem] font-semibold tracking-wide text-ink-500 uppercase lg:grid">
                <span>Pessoa</span>
                <span>Telefone</span>
                <span>Zona</span>
                <span>Seção</span>
                <span>Escola onde vota</span>
                <span className="text-right">Situação</span>
              </div>
              <ul className="divide-y divide-line">
                {equipeNaLista.map((m) => {
                  const conferir = dadosParaConferir(m);
                  const faltas = camposFaltantes(m);
                  const local = localDaPessoa(indice, m);
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => onOpenMember(m)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-ink-50 lg:grid-cols-[minmax(0,1.4fr)_7rem_4rem_4rem_minmax(0,1.6fr)_auto]"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Avatar name={m.name} src={m.photo} size="sm" />
                          <span className="min-w-0">
                            <NomeComTag member={m} nomeClassName="text-sm font-medium text-ink-900" />
                            <span className="block text-xs text-ink-500 lg:hidden">
                              {m.phone ? formatPhone(m.phone) : 'sem telefone'} · Zona {m.zone || '—'} · Seção {m.section || '—'}
                            </span>
                            <span className="block text-xs text-ink-400">{m.semDataDeCadastro ? '' : formatDate(m.createdAt)}</span>
                          </span>
                        </span>
                        <span className="hidden text-xs text-ink-700 tabular-nums lg:block">{m.phone ? formatPhone(m.phone) : '—'}</span>
                        <span className="hidden text-sm font-semibold text-ink-900 tabular-nums lg:block">{m.zone || '—'}</span>
                        <span className="hidden text-sm font-semibold text-ink-900 tabular-nums lg:block">{m.section || '—'}</span>
                        <span className="col-span-2 min-w-0 lg:col-span-1">
                          {local ? (
                            <span className="flex min-w-0 items-start gap-1.5">
                              <School aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-accent-600" />
                              <span className="min-w-0">
                                <span className="block text-xs font-semibold wrap-break-word text-ink-900">{local.nome}</span>
                                {local.cidade ? <span className="block text-[0.6875rem] text-ink-500">{local.cidade}</span> : null}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs text-ink-400">
                              {locais.loading ? 'buscando…' : m.zone && m.section ? 'seção fora da tabela do TSE' : 'sem zona/seção'}
                            </span>
                          )}
                        </span>
                        <span className="col-start-2 row-start-1 flex shrink-0 flex-wrap justify-end gap-1 lg:col-start-auto lg:row-start-auto">
                          {idsRepetidos.has(m.id) ? <Badge tone="danger">Repetido</Badge> : null}
                          {conferir.length ? (
                            <Badge tone="danger" title={conferir.join(', ')}>
                              Conferir
                            </Badge>
                          ) : null}
                          {faltas.length ? (
                            <Badge tone="warning" title={`Falta ${faltas.join(', ')}`}>
                              Incompleto
                            </Badge>
                          ) : null}
                          {!conferir.length && !faltas.length && !idsRepetidos.has(m.id) ? <Badge tone="success">Em ordem</Badge> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>

      {podeEditarTag ? (
        <EditarTagModal open={editandoTag} lider={lider} tamanhoDaEquipe={p.total} onClose={() => setEditandoTag(false)} />
      ) : null}
    </Modal>
  );
}

function Titulo({ children, semMargem = false }: { children: ReactNode; semMargem?: boolean }) {
  return (
    <p className={cn('flex items-center text-xs font-semibold tracking-wide text-ink-500 uppercase', !semMargem && 'mb-2')}>
      {children}
    </p>
  );
}

function Numero({
  icone,
  valor,
  rotulo,
  nota,
  destaque = false,
}: {
  icone: ReactNode;
  valor: string;
  rotulo: string;
  nota?: string;
  destaque?: boolean;
}) {
  return (
    <div className={cn('rounded-card p-3', destaque ? 'bg-navy-900 text-white' : 'bg-ink-50')}>
      <span className={cn('flex items-center gap-1.5 text-xs', destaque ? 'text-navy-300' : 'text-ink-500')}>
        {icone}
        {rotulo}
      </span>
      <span className="mt-1 block text-2xl font-bold tabular-nums">{valor}</span>
      {nota ? <span className={cn('mt-0.5 block text-[0.6875rem]', destaque ? 'text-navy-300' : 'text-ink-400')}>{nota}</span> : null}
    </div>
  );
}

function Contador({
  icone,
  tom,
  valor,
  rotulo,
  ativo,
  onClick,
}: {
  icone: ReactNode;
  tom: 'danger' | 'warning';
  valor: number;
  rotulo: string;
  ativo: boolean;
  onClick: () => void;
}) {
  const cores = tom === 'danger' ? 'text-danger-700 bg-danger-50' : 'text-warning-600 bg-warning-50';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={valor === 0}
      aria-pressed={ativo}
      className={cn(
        'rounded-card border p-3 text-left transition-colors disabled:cursor-default disabled:opacity-60',
        ativo ? 'border-accent-600 ring-2 ring-accent-600/20' : 'border-line hover:border-accent-600',
      )}
    >
      <span className={cn('inline-flex size-7 items-center justify-center rounded-control', valor ? cores : 'bg-ink-100 text-ink-400')}>{icone}</span>
      <span className="mt-1 block text-xl font-bold text-ink-900 tabular-nums">{formatNumber(valor)}</span>
      <span className="block text-xs text-ink-500">{rotulo}</span>
    </button>
  );
}

function Barras({ itens, cor }: { itens: { rotulo: string; quantidade: number }[]; cor: string }) {
  const maior = Math.max(1, ...itens.map((i) => i.quantidade));
  return (
    <ul className="space-y-1.5">
      {itens.map((item) => (
        <li key={item.rotulo} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-2 text-sm">
          <span className="wrap-break-word text-ink-700 first-letter:uppercase">{item.rotulo}</span>
          <span className="h-2 overflow-hidden rounded-pill bg-ink-100">
            <span className={cn('block h-full rounded-pill', cor)} style={{ width: `${Math.max(4, (item.quantidade / maior) * 100)}%` }} />
          </span>
          <span className="text-right font-semibold text-ink-900 tabular-nums">{item.quantidade}</span>
        </li>
      ))}
    </ul>
  );
}
