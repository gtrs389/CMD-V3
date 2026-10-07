'use client';

import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import {
  BarChart3,
  BookmarkCheck,
  BookmarkX,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  MapPin,
  School,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react';
import type { Member } from '@/lib/types';
import { equipePorReferencia, type GrupoDaReferencia } from '@/lib/domain/equipe-por-referencia';
import {
  indiceDeLocais,
  numeroEleitoral,
  ondeAEquipeVota,
  type LocalDeVotacao,
  type OndeAEquipeVota,
} from '@/lib/domain/onde-a-equipe-vota';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { Spinner } from '@/components/ui/Spinner';
import { SEM_REFERENCIA } from '@/lib/domain/filtros-da-equipe';
import { corDoCandidato } from '@/components/dashboard/votacao/cores';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';
import { TagDoLider } from './TagDoLider';
import { TierBadge } from './TierBadge';
import { dadosParaConferir } from '@/lib/domain/conferencia';
import { camposFaltantes } from '@/lib/domain/member-completeness';

/** Vermelho de "Sem referência": o mesmo da tag. */
const VERMELHO = '#b42318';
/** Pessoas da Equipe que aparecem de cara em cada Lider; o resto num toque. */
const EQUIPE_DE_CARA = 12;

/**
 * "Por referência": o time agrupado pela referencia dos Lideres.
 *
 * Em cima, a parte de cada referencia no time numa barra so (tocar leva ao
 * grupo). Embaixo, um cartao por referencia — Lideres, Equipe, quanto do
 * time — que abre os Lideres dela, cada um com a Equipe dele. A Equipe
 * herda a referencia do Lider. Busca e filtros da lista continuam valendo.
 *
 * Cada referencia mostra tambem ONDE a gente dela vota: as escolas (pela
 * zona e secao de cada pessoa, na tabela de locais do TSE), com as secoes
 * de cada uma. Uma consulta so, com as zonas de todo mundo do recorte.
 */
export function EquipePorReferencia({
  pessoas,
  time,
  onAbrirPessoa,
  onAbrirLider,
}: {
  /** O recorte da lista (busca e filtros). */
  pessoas: Member[];
  /** O time inteiro: de onde se acha o Lider de cada pessoa. */
  time: Member[];
  onAbrirPessoa: (m: Member) => void;
  onAbrirLider: (m: Member) => void;
}) {
  const grupos = useMemo(() => equipePorReferencia(pessoas, time), [pessoas, time]);

  // As escolas: os locais do TSE das zonas do recorte, numa consulta so.
  const clientId = time[0]?.clientId ?? pessoas[0]?.clientId ?? null;
  const zonas = useMemo(
    () =>
      [...new Set(pessoas.map((m) => numeroEleitoral(m.zone)).filter((z): z is number => z !== null))]
        .sort((a, b) => a - b)
        .slice(0, 40)
        .join(','),
    [pessoas],
  );
  const loaderDosLocais = useCallback(
    () =>
      clientId && zonas
        ? api<{ locais: LocalDeVotacao[] }>(`/api/clients/${encodeURIComponent(clientId)}/locais-de-votacao?zonas=${zonas}`)
        : Promise.resolve({ locais: [] as LocalDeVotacao[] }),
    [clientId, zonas],
  );
  const locais = useRepositoryQuery(loaderDosLocais);
  const indice = useMemo(() => indiceDeLocais(locais.data?.locais ?? []), [locais.data]);
  /** Onde a gente de cada referencia vota (Lideres do recorte + Equipe). */
  const escolasDe = useMemo(() => {
    const m = new Map<string, OndeAEquipeVota>();
    if (!locais.data && !locais.error) return m;
    for (const g of grupos) {
      const gente = g.lideres.flatMap((l) => [...(l.lider && l.liderNoRecorte ? [l.lider] : []), ...l.equipe]);
      m.set(g.chave, ondeAEquipeVota(gente, indice));
    }
    return m;
  }, [grupos, indice, locais.data, locais.error]);
  const totalGeral = Math.max(1, grupos.reduce((t, g) => t + g.total, 0));
  const totalDeLideres = grupos.reduce((t, g) => t + g.totalDeLideres, 0);
  const maior = Math.max(1, ...grupos.map((g) => g.total));
  // Com poucas referencias, todas abertas; com muitas, so a maior.
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(grupos.length <= 3 ? grupos.map((g) => g.chave) : grupos.slice(0, 1).map((g) => g.chave)));
  const cor = (g: GrupoDaReferencia, i: number) => (g.chave === SEM_REFERENCIA ? VERMELHO : corDoCandidato(i));
  const alternar = (chave: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  const irPara = (chave: string) => {
    setAbertos((atual) => new Set(atual).add(chave));
    window.setTimeout(() => document.getElementById(`ref-${chave}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const todasAbertas = grupos.every((g) => abertos.has(g.chave));

  if (grupos.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* A FOTO DO TIME: a parte de cada referencia, numa barra so. */}
      <section aria-label="O time por referência" className="overflow-hidden rounded-card bg-gradient-to-br from-navy-900 via-navy-800 to-[#1e3a8a] p-4 text-white shadow-card sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.625rem] font-bold tracking-[0.16em] text-gold-400 uppercase">O time por referência</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatNumber(grupos.filter((g) => g.chave !== SEM_REFERENCIA).length)}{' '}
              <span className="text-sm font-medium text-white/70">
                {grupos.filter((g) => g.chave !== SEM_REFERENCIA).length === 1 ? 'referência' : 'referências'} ·{' '}
                {formatNumber(totalDeLideres)} {totalDeLideres === 1 ? 'líder' : 'líderes'} · {formatNumber(totalGeral)}{' '}
                {totalGeral === 1 ? 'pessoa' : 'pessoas'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAbertos(todasAbertas ? new Set() : new Set(grupos.map((g) => g.chave)))}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-white/20 bg-white/10 px-3 text-xs font-semibold transition-colors hover:bg-white/20"
          >
            {todasAbertas ? <ChevronsDownUp aria-hidden="true" className="size-4" /> : <ChevronsUpDown aria-hidden="true" className="size-4" />}
            {todasAbertas ? 'Fechar todas' : 'Abrir todas'}
          </button>
        </div>
        <div className="mt-4 flex h-4 overflow-hidden rounded-pill bg-white/10" aria-hidden="true">
          {grupos.map((g, i) => (
            <button
              key={g.chave}
              type="button"
              tabIndex={-1}
              onClick={() => irPara(g.chave)}
              title={`${g.rotulo}: ${formatNumber(g.total)} pessoas`}
              className="h-full transition-[filter] hover:brightness-125"
              style={{ flex: `${g.total} 0 0`, background: cor(g, i), boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.35)' }}
            />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {grupos.map((g, i) => (
            <li key={g.chave}>
              <button
                type="button"
                onClick={() => irPara(g.chave)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-pill border border-white/15 bg-white/5 px-2.5 text-xs font-semibold transition-colors hover:bg-white/15"
              >
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: cor(g, i) }} />
                {g.rotulo}
                <span className="text-white/60 tabular-nums">{Math.round((g.total / totalGeral) * 100)}%</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* UM CARTAO POR REFERENCIA */}
      {grupos.map((g, i) => {
        const aberto = abertos.has(g.chave);
        const c = cor(g, i);
        const sem = g.chave === SEM_REFERENCIA;
        return (
          <section
            key={g.chave}
            id={`ref-${g.chave}`}
            aria-label={`Referência ${g.rotulo}`}
            className="cmd-cascata scroll-mt-4 overflow-hidden rounded-card border bg-surface shadow-card"
            style={{ borderColor: `${c}55`, '--cmd-atraso': `${Math.min(i, 10) * 40}ms` } as CSSProperties}
          >
            <button
              type="button"
              onClick={() => alternar(g.chave)}
              aria-expanded={aberto}
              className="group relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-ink-50/60 sm:px-5"
            >
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5" style={{ background: c }} />
              <span className="flex size-11 items-center justify-center rounded-2xl text-white shadow-card" style={{ background: c }}>
                {sem ? <BookmarkX aria-hidden="true" className="size-5" /> : <BookmarkCheck aria-hidden="true" className="size-5" />}
              </span>
              <span className="min-w-0">
                <span className={cn('block text-base leading-tight font-bold wrap-break-word', sem ? 'text-danger-700' : 'text-ink-900')}>{g.rotulo}</span>
                <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-500">
                  <span className="inline-flex items-center gap-1">
                    <UserRound aria-hidden="true" className="size-3.5" />
                    <b className="text-ink-900 tabular-nums">{formatNumber(g.totalDeLideres)}</b> {g.totalDeLideres === 1 ? 'líder' : 'líderes'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users aria-hidden="true" className="size-3.5" />
                    <b className="text-ink-900 tabular-nums">{formatNumber(g.totalDaEquipe)}</b> {g.totalDaEquipe === 1 ? 'liderado' : 'liderados'}
                  </span>
                  {escolasDe.get(g.chave) ? (
                    <span className="inline-flex items-center gap-1">
                      <School aria-hidden="true" className="size-3.5" />
                      <b className="text-ink-900 tabular-nums">{formatNumber(escolasDe.get(g.chave)!.escolas.length)}</b>{' '}
                      {escolasDe.get(g.chave)!.escolas.length === 1 ? 'escola' : 'escolas'}
                    </span>
                  ) : null}
                  {g.cadastrosRepetidos ? (
                    <span
                      className="inline-flex items-center gap-1 text-warning-600"
                      title="A mesma pessoa cadastrada mais de uma vez aparece uma vez só, com a marca de repetido"
                    >
                      <Copy aria-hidden="true" className="size-3.5" />
                      <b className="tabular-nums">{formatNumber(g.cadastrosRepetidos)}</b>{' '}
                      {g.cadastrosRepetidos === 1 ? 'cadastro repetido contado uma vez' : 'cadastros repetidos contados uma vez'}
                    </span>
                  ) : null}
                </span>
                <span className="mt-2 block h-2 overflow-hidden rounded-pill bg-ink-100">
                  <span className="cmd-barra-viva block h-full rounded-pill" style={{ width: `${Math.max(3, (g.total / maior) * 100)}%`, background: c }} />
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-right tabular-nums">
                  <span className="block text-2xl leading-none font-bold text-ink-900">{formatNumber(g.total)}</span>
                  <span className="block text-[0.6875rem] text-ink-500">{Math.round((g.total / totalGeral) * 100)}% do time</span>
                </span>
                <ChevronDown aria-hidden="true" className={cn('size-5 text-ink-400 transition-transform duration-300', aberto && 'rotate-180')} />
              </span>
            </button>

            {aberto ? (
              <EscolasDaReferencia rotulo={g.rotulo} cor={c} dados={escolasDe.get(g.chave) ?? null} carregando={locais.loading} total={g.total} />
            ) : null}
            {aberto ? (
              <ul className="animate-fade-in divide-y divide-line border-t border-line">
                {g.lideres.map((l) => (
                  <LinhaDoLider key={l.lider?.id ?? 'orfaos'} linha={l} cor={c} maior={Math.max(1, ...g.lideres.map((x) => x.equipe.length))} onAbrirPessoa={onAbrirPessoa} onAbrirLider={onAbrirLider} />
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

/** Quantas escolas aparecem antes do "ver todas". */
const ESCOLAS_DE_CARA = 6;

/**
 * Onde a gente de uma referencia vota: as escolas, da que tem mais gente
 * para a que tem menos, cada uma com a barra na cor da referencia, a parte
 * do grupo e as secoes com mais gente; em cima, as zonas.
 */
function EscolasDaReferencia({
  rotulo,
  cor,
  dados,
  carregando,
  total,
}: {
  rotulo: string;
  cor: string;
  dados: OndeAEquipeVota | null;
  carregando: boolean;
  total: number;
}) {
  const [todas, setTodas] = useState(false);
  if (!dados) {
    return carregando ? (
      <p className="flex items-center gap-2 border-t border-line px-4 py-3 text-xs text-ink-500 sm:px-5">
        <Spinner className="size-3.5" /> Buscando as escolas de cada seção…
      </p>
    ) : null;
  }
  const maior = Math.max(1, ...dados.escolas.map((e) => e.total));
  const visiveis = todas ? dados.escolas : dados.escolas.slice(0, ESCOLAS_DE_CARA);
  const localizados = dados.escolas.reduce((t, e) => t + e.total, 0);

  return (
    <section aria-label={`Escolas de ${rotulo}`} className="animate-fade-in border-t border-line bg-ink-50/40 px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-bold text-ink-900">
          <span className="flex size-7 items-center justify-center rounded-lg text-white" style={{ background: cor }}>
            <School aria-hidden="true" className="size-4" />
          </span>
          Onde a gente de {rotulo} vota
        </h4>
        <p className="text-[0.6875rem] text-ink-500">
          {formatNumber(dados.escolas.length)} {dados.escolas.length === 1 ? 'escola' : 'escolas'} · {formatNumber(localizados)} de{' '}
          {formatNumber(total)} com a escola identificada
          {dados.semZonaSecao ? ` · ${formatNumber(dados.semZonaSecao)} sem zona/seção` : ''}
          {dados.semLocal ? ` · ${formatNumber(dados.semLocal)} com seção fora da tabela do TSE` : ''}
        </p>
      </div>

      {dados.zonas.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Zonas">
          {dados.zonas.map((z) => (
            <li key={z.zona} className="inline-flex items-center gap-1 rounded-pill bg-navy-900 px-2 py-0.5 text-[0.6875rem] font-bold text-white">
              Zona {z.zona}
              <span className="rounded-pill bg-white/20 px-1 tabular-nums">{formatNumber(z.total)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {dados.escolas.length === 0 ? (
        <p className="mt-3 text-xs text-ink-500">Nenhuma escola identificada: falta zona e seção nos cadastros.</p>
      ) : (
        <ol className="mt-3 grid gap-2 lg:grid-cols-2">
          {visiveis.map((e, i) => (
            <li
              key={e.local.id}
              className="cmd-cascata rounded-control border border-line bg-surface p-2.5"
              style={{ '--cmd-atraso': `${Math.min(i, 8) * 35}ms` } as CSSProperties}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold text-white tabular-nums"
                  style={{ background: i < 3 ? cor : '#94a3b8' }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug font-semibold wrap-break-word text-ink-900">{e.local.nome}</p>
                  <p className="flex items-center gap-1 text-[0.6875rem] text-ink-500">
                    <MapPin aria-hidden="true" className="size-3 shrink-0" />
                    <span className="truncate">{[e.local.endereco, e.local.cidade].filter(Boolean).join(' · ') || `Zona ${e.local.zona}`}</span>
                  </p>
                </div>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block text-base leading-none font-bold text-ink-900">{formatNumber(e.total)}</span>
                  <span className="block text-[0.625rem] text-ink-500">{Math.round((e.total / Math.max(1, total)) * 100)}% do grupo</span>
                </span>
              </div>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-pill bg-ink-100">
                <span className="cmd-barra-viva block h-full rounded-pill" style={{ width: `${Math.max(4, (e.total / maior) * 100)}%`, background: cor }} />
              </span>
              <span className="mt-2 flex flex-wrap gap-1">
                <span className="text-[0.625rem] font-semibold text-ink-500">Zona {e.local.zona} ·</span>
                {e.secoes.slice(0, 8).map((s) => (
                  <span
                    key={s.secao}
                    className="inline-flex items-center gap-0.5 rounded-pill border border-line bg-ink-50 px-1.5 text-[0.625rem] font-semibold text-ink-700 tabular-nums"
                  >
                    Seção {s.secao}
                    <span className="rounded-pill bg-navy-900 px-1 text-[0.5625rem] text-white">{s.total}</span>
                  </span>
                ))}
                {e.secoes.length > 8 ? <span className="text-[0.625rem] text-ink-500">+{e.secoes.length - 8} seções</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
      {dados.escolas.length > ESCOLAS_DE_CARA ? (
        <button
          type="button"
          onClick={() => setTodas((t) => !t)}
          className="mt-2.5 inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-line bg-surface px-3 text-xs font-semibold text-accent-700 hover:border-accent-600"
        >
          {todas ? 'Mostrar menos' : `Ver todas as ${formatNumber(dados.escolas.length)} escolas`}
          <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', todas && 'rotate-180')} />
        </button>
      ) : null}
    </section>
  );
}

function LinhaDoLider({
  linha,
  cor,
  maior,
  onAbrirPessoa,
  onAbrirLider,
}: {
  linha: GrupoDaReferencia['lideres'][number];
  cor: string;
  maior: number;
  onAbrirPessoa: (m: Member) => void;
  onAbrirLider: (m: Member) => void;
}) {
  const [toda, setToda] = useState(false);
  // "Agora" fixado ao abrir: a conta dos dias nao muda a cada pintura.
  const [agora] = useState(() => Date.now());
  const { lider, equipe } = linha;
  const visiveis = toda ? equipe : equipe.slice(0, EQUIPE_DE_CARA);
  // Previa das metricas do Lider: quanto da Equipe esta em ordem e ha quanto
  // tempo ele nao cadastra. O painel completo abre no botao.
  const emOrdem = equipe.filter((m) => dadosParaConferir(m).length === 0 && camposFaltantes(m).length === 0).length;
  const saude = equipe.length ? Math.round((emOrdem / equipe.length) * 100) : null;
  const ultimo = equipe.filter((m) => !m.semDataDeCadastro).reduce<number | null>((maisNovo, m) => {
    const t = new Date(m.createdAt).getTime();
    return Number.isNaN(t) ? maisNovo : maisNovo === null || t > maisNovo ? t : maisNovo;
  }, null);
  const dias = ultimo === null ? null : Math.max(0, Math.floor((agora - ultimo) / 86_400_000));
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-3">
        {lider ? (
          <button type="button" onClick={() => onAbrirLider(lider)} className="group flex min-w-0 flex-1 items-center gap-3 text-left" title="Abrir o painel do Líder">
            <Avatar name={lider.name} src={lider.photo} size="md" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold wrap-break-word text-ink-900 group-hover:text-brand-700 group-hover:underline">{lider.name}</span>
                <TierBadge tier="LIDER" />
                <MarcaDeRepetido outros={linha.repetidos[lider.id]} />
                <TagDoLider member={lider} />
                {!linha.liderNoRecorte ? <span className="rounded-pill bg-ink-100 px-1.5 py-0.5 text-[0.625rem] font-semibold text-ink-500">fora do filtro</span> : null}
              </span>
              <span className="mt-1.5 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-ink-100">
                  <span className="block h-full rounded-pill" style={{ width: `${equipe.length ? Math.max(4, (equipe.length / maior) * 100) : 0}%`, background: cor }} />
                </span>
              </span>
              {/* A previa das metricas: saude da Equipe e ritmo. */}
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.6875rem] text-ink-500">
                {saude !== null ? (
                  <span className="inline-flex items-center gap-1" title="Pessoas da Equipe sem nada para conferir nem faltando">
                    <ShieldCheck aria-hidden="true" className={cn('size-3.5', saude >= 90 ? 'text-success-600' : saude >= 70 ? 'text-warning-600' : 'text-danger-600')} />
                    <b className={cn('tabular-nums', saude >= 90 ? 'text-success-700' : saude >= 70 ? 'text-warning-600' : 'text-danger-700')}>{saude}%</b> em ordem
                  </span>
                ) : null}
                {dias !== null ? (
                  <span className="inline-flex items-center gap-1" title="Desde o último cadastro da Equipe">
                    <CalendarClock aria-hidden="true" className={cn('size-3.5', dias <= 7 ? 'text-success-600' : dias <= 30 ? 'text-warning-600' : 'text-danger-600')} />
                    {dias === 0 ? 'cadastrou hoje' : `último cadastro há ${formatNumber(dias)} ${dias === 1 ? 'dia' : 'dias'}`}
                  </span>
                ) : equipe.length === 0 ? (
                  <span className="inline-flex items-center gap-1 text-danger-700">
                    <CalendarClock aria-hidden="true" className="size-3.5" />
                    ainda sem Equipe
                  </span>
                ) : null}
              </span>
            </span>
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full border-2 border-dashed border-ink-200 text-ink-400">
              <Users aria-hidden="true" className="size-5" />
            </span>
            <span className="text-sm text-ink-500">Equipe sem Líder identificado no time</span>
          </span>
        )}
        <span className="flex items-center gap-2">
          <span className="text-right tabular-nums">
            <span className="block text-lg leading-none font-bold text-ink-900">{formatNumber(equipe.length)}</span>
            <span className="block text-[0.6875rem] text-ink-500">{equipe.length === 1 ? 'liderado' : 'liderados'}</span>
          </span>
          {lider ? (
            <button
              type="button"
              onClick={() => onAbrirLider(lider)}
              aria-label={`Ver as métricas do Líder ${lider.name}`}
              title="Abrir o painel do Líder: ritmo, Equipe, escolas, zonas e seções"
              className="group inline-flex min-h-10 items-center gap-2 rounded-pill bg-navy-900 py-1 pr-3.5 pl-1 text-xs font-bold text-white shadow-[0_10px_22px_-12px_rgba(15,30,53,0.9)] transition-all hover:-translate-y-0.5 hover:bg-navy-800"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-gold-400 text-navy-900 transition-transform group-hover:scale-110">
                <BarChart3 aria-hidden="true" className="size-4" />
              </span>
              Ver métricas
              <ChevronRight aria-hidden="true" className="size-3.5 text-gold-400 transition-transform group-hover:translate-x-0.5" />
            </button>
          ) : null}
        </span>
      </div>

      {equipe.length ? (
        <ul className="mt-2.5 flex flex-wrap gap-1.5 sm:pl-[3.75rem]">
          {visiveis.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onAbrirPessoa(m)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-line bg-surface py-0.5 pr-2.5 pl-0.5 text-left text-xs text-ink-700 transition-colors hover:border-brand-700 hover:text-brand-700"
                title={`Abrir a ficha de ${m.name}${m.zone || m.section ? ` · Zona ${m.zone ?? '?'}, Seção ${m.section ?? '?'}` : ''}`}
              >
                <Avatar name={m.name} src={m.photo} size="xs" />
                <span className="min-w-0 wrap-break-word font-medium">{m.name}</span>
                <MarcaDeRepetido outros={linha.repetidos[m.id]} />
              </button>
            </li>
          ))}
          {equipe.length > EQUIPE_DE_CARA ? (
            <li>
              <button
                type="button"
                onClick={() => setToda((v) => !v)}
                className="inline-flex min-h-7 items-center gap-1 rounded-pill bg-accent-50 px-2.5 text-xs font-semibold text-accent-700 hover:bg-accent-100"
              >
                {toda ? 'Mostrar menos' : `Ver mais ${formatNumber(equipe.length - EQUIPE_DE_CARA)}`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * A pessoa cadastrada mais de uma vez: aparece uma vez so, com "2×" e, ao
 * passar o mouse, quem mais a cadastrou.
 */
function MarcaDeRepetido({ outros }: { outros?: string[] }) {
  if (!outros?.length) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-pill bg-warning-50 px-1.5 text-[0.625rem] font-bold text-warning-600 ring-1 ring-warning-600/30 ring-inset tabular-nums"
      title={`Cadastrada ${outros.length + 1} vezes. Também por: ${outros.join('; ')}`}
    >
      <Copy aria-hidden="true" className="size-2.5" />
      {outros.length + 1}×
    </span>
  );
}
