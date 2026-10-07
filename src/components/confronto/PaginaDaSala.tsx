'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowRight, Bookmark, Clock, Map as MapaIcone, MapPin, Search, Swords, Trash2, Trophy, Users, X } from 'lucide-react';
import { parteDaEsquerda, type EscolaNaSala } from '@/lib/domain/sala-de-confronto';
import { fotoDoCandidatoUrl, type CandidatoDaVotacao } from '@/lib/domain/votacao-tse';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { cn } from '@/lib/utils/cn';
import { formatNumber, initials } from '@/lib/utils/text';
import { Contador } from '@/components/ui/Contador';
import { FotoDoCandidato } from '@/components/apuracao/FotoDoCandidato';
import { corDoCandidato } from '@/components/dashboard/votacao/cores';
import { AZUL, VERMELHO } from './Arena';
import { ConfrontoDaEscola } from './ConfrontoDaEscola';

/**
 * Sala de Confronto: a pagina.
 *
 * Primeiro, o QUARTEL — todas as escolas que o time mandou para a sala (do
 * Raio-X de cada escola, "Enviar para sala de confronto"), cada uma num
 * cartao com os candidatos de cada lado, o placar da ultima leitura, as
 * zonas, as secoes e os Lideres. Tocar a escola abre o confronto dela, ao
 * vivo. `?escola=<id>` abre direto (o Raio-X leva para la depois de enviar).
 */

type Filtro = 'todas' | 'duelo' | 'sem' | 'vencendo' | 'perdendo';

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function PaginaDaSala() {
  const loader = useCallback(() => api<{ escolas: EscolaNaSala[] }>('/api/confrontos'), []);
  const { data, error, loading, reload } = useRepositoryQuery(loader);
  /** As mudancas feitas aqui (adversarios, Lideres, placar), por cima do que veio do servidor. */
  const [mudadas, setMudadas] = useState<Record<string, EscolaNaSala>>({});
  const [tiradas, setTiradas] = useState<ReadonlySet<string>>(() => new Set());
  const escolas = useMemo(
    () => (data?.escolas ?? []).filter((e) => !tiradas.has(e.id)).map((e) => mudadas[e.id] ?? e),
    [data, mudadas, tiradas],
  );

  // A escola aberta mora no endereco: o voltar do navegador volta para a lista.
  const [aberta, setAberta] = useState<string | null>(null);
  useEffect(() => {
    const ler = () => setAberta(new URLSearchParams(window.location.search).get('escola'));
    const quadro = requestAnimationFrame(ler);
    window.addEventListener('popstate', ler);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener('popstate', ler);
    };
  }, []);
  const abrir = useCallback((id: string | null) => {
    setAberta(id);
    window.history.pushState(null, '', id ? `?escola=${encodeURIComponent(id)}` : window.location.pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  const mudou = useCallback((e: EscolaNaSala) => setMudadas((atual) => ({ ...atual, [e.id]: e })), []);

  const registro = aberta ? (escolas.find((e) => e.id === aberta) ?? null) : null;

  async function tirar(e: EscolaNaSala) {
    if (!window.confirm(`Tirar "${e.titulo}" da Sala de Confronto?`)) return;
    setTiradas((atual) => new Set(atual).add(e.id));
    try {
      await api(`/api/confrontos/${e.id}`, { method: 'DELETE' });
    } catch {
      setTiradas((atual) => {
        const novo = new Set(atual);
        novo.delete(e.id);
        return novo;
      });
    }
  }

  if (aberta && registro) {
    return <ConfrontoDaEscola key={registro.id} registro={registro} onVoltar={() => abrir(null)} onMudou={mudou} />;
  }

  return (
    <div className="space-y-4">
      <Quartel escolas={escolas} carregando={loading && !data} />
      {error ? (
        <ErroDaSala mensagem={error} onTentar={reload} />
      ) : aberta && data && !registro ? (
        <p className="rounded-control border-l-4 border-gold-500 bg-gold-50 px-3 py-2 text-sm text-ink-900">
          Essa escola não está mais na sala.{' '}
          <button type="button" className="font-semibold text-accent-700 underline" onClick={() => abrir(null)}>
            Ver todas
          </button>
        </p>
      ) : null}
      {data ? <ListaDaSala escolas={escolas} onAbrir={abrir} onTirar={tirar} /> : !error ? <ListaCarregando /> : null}
    </div>
  );
}

/** O topo da pagina: o titulo e os numeros da sala inteira. */
function Quartel({ escolas, carregando }: { escolas: EscolaNaSala[]; carregando: boolean }) {
  const emDuelo = escolas.filter((e) => e.direita.length > 0);
  const secoes = escolas.reduce((t, e) => t + (e.resumo.secoes ?? 0), 0);
  const zonas = new Set(escolas.flatMap((e) => e.resumo.zonas ?? []));
  const lideres = escolas.reduce((t, e) => t + (e.resumo.lideres ?? 0), 0);
  const vencendo = emDuelo.filter((e) => (e.resumo.esquerda ?? 0) > (e.resumo.direita ?? 0)).length;
  const perdendo = emDuelo.filter((e) => (e.resumo.esquerda ?? 0) < (e.resumo.direita ?? 0)).length;
  const numeros = [
    { rotulo: 'Escolas na sala', valor: escolas.length, icone: <Swords className="size-4" /> },
    { rotulo: 'Zonas', valor: zonas.size, icone: <MapPin className="size-4" /> },
    { rotulo: 'Seções em jogo', valor: secoes, icone: <MapaIcone className="size-4" /> },
    { rotulo: 'Líderes envolvidos', valor: lideres, icone: <Users className="size-4" /> },
  ];
  return (
    <header className="relative animate-fade-up overflow-hidden rounded-card bg-gradient-to-r from-[#0d1f4d] via-navy-900 to-[#4a0d16] px-4 py-6 text-white shadow-overlay sm:px-6">
      <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0" />
      <span aria-hidden="true" className="cmd-orbe pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-[#2a78d6]/35 blur-3xl" />
      <span aria-hidden="true" className="cmd-orbe pointer-events-none absolute -right-16 -bottom-28 size-80 rounded-full bg-[#e5484d]/35 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-5">
        <span className="relative flex size-16 shrink-0 items-center justify-center">
          <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-gold-400/20 [animation-duration:2.6s]" />
          <span className="relative flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-navy-900 shadow-[0_0_40px_-6px_rgba(242,193,78,0.8)]">
            <Swords aria-hidden="true" className="size-8" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-bold tracking-[0.18em] text-gold-400 uppercase">Estimativa × apuração × adversários</p>
          <h1 className="text-2xl leading-tight font-black sm:text-3xl">Sala de Confronto</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/70">
            As escolas que você mandou para o duelo. Toque numa escola: o seu lado contra quem você chamar, zona por zona, seção por seção e líder por líder.
          </p>
        </div>
        {emDuelo.length ? (
          <div className="rounded-card bg-white/[0.07] px-4 py-3 text-center ring-1 ring-white/10">
            <p className="text-[0.625rem] font-semibold tracking-wider text-white/55 uppercase">Escolas em duelo</p>
            <p className="mt-1 flex items-baseline justify-center gap-2 text-3xl font-black tabular-nums">
              <span className="text-[#7fb6ff]">{vencendo}</span>
              <span className="text-base text-white/40">×</span>
              <span className="text-[#ff8a8e]">{perdendo}</span>
            </p>
            <p className="text-[0.6875rem] text-white/55">vencendo × perdendo</p>
          </div>
        ) : null}
      </div>
      <dl className="relative mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {numeros.map((n, i) => (
          <div
            key={n.rotulo}
            className="cmd-cascata rounded-control bg-white/[0.07] px-3 py-2.5 ring-1 ring-white/10"
            style={{ '--cmd-atraso': `${120 + i * 60}ms` } as CSSProperties}
          >
            <dt className="flex items-center gap-1.5 text-[0.625rem] font-semibold tracking-wider text-white/55 uppercase">
              <span className="text-gold-400">{n.icone}</span>
              {n.rotulo}
            </dt>
            <dd className="mt-0.5 text-2xl font-black tabular-nums">{carregando ? '—' : <Contador valor={n.valor} />}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

function ListaDaSala({
  escolas,
  onAbrir,
  onTirar,
}: {
  escolas: EscolaNaSala[];
  onAbrir: (id: string) => void;
  onTirar: (e: EscolaNaSala) => void;
}) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [agora] = useState(() => Date.now());
  const termo = semAcento(busca.trim());
  const vence = (e: EscolaNaSala) => (e.resumo.esquerda ?? 0) > (e.resumo.direita ?? 0);
  const perde = (e: EscolaNaSala) => (e.resumo.esquerda ?? 0) < (e.resumo.direita ?? 0);
  const contagem: Record<Filtro, number> = {
    todas: escolas.length,
    duelo: escolas.filter((e) => e.direita.length > 0).length,
    sem: escolas.filter((e) => e.direita.length === 0).length,
    vencendo: escolas.filter((e) => e.direita.length > 0 && vence(e)).length,
    perdendo: escolas.filter((e) => e.direita.length > 0 && perde(e)).length,
  };
  const visiveis = escolas
    .filter((e) =>
      filtro === 'duelo'
        ? e.direita.length > 0
        : filtro === 'sem'
          ? e.direita.length === 0
          : filtro === 'vencendo'
            ? e.direita.length > 0 && vence(e)
            : filtro === 'perdendo'
              ? e.direita.length > 0 && perde(e)
              : true,
    )
    .filter((e) => !termo || semAcento(`${e.titulo} ${e.cidade ?? ''} ${e.scopeName ?? ''} ${(e.resumo.zonas ?? []).join(' ')}`).includes(termo));
  const variosTimes = new Set(escolas.map((e) => e.scope)).size > 1;

  if (escolas.length === 0) return <SalaVazia />;

  return (
    <section aria-label="Escolas na sala" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-0 flex-1 basis-64 items-center">
          <span className="sr-only">Buscar escola</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-ink-400" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar escola, cidade ou zona"
            className="min-h-10 w-full rounded-pill border border-line bg-surface pr-9 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:border-accent-600 focus:ring-4 focus:ring-accent-100 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {busca ? (
            <button
              type="button"
              onClick={() => setBusca('')}
              aria-label="Limpar busca"
              className="absolute right-1.5 flex size-7 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
        </label>
        <div role="group" aria-label="Quais escolas" className="flex flex-wrap gap-1 rounded-[1.25rem] border border-line bg-ink-50 p-0.5">
          {(
            [
              ['todas', 'Todas'],
              ['duelo', 'Em duelo'],
              ['sem', 'Sem adversário'],
              ['vencendo', 'Vencendo'],
              ['perdendo', 'Perdendo'],
            ] as [Filtro, string][]
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={filtro === valor}
              onClick={() => setFiltro(valor)}
              className={cn(
                'min-h-9 rounded-pill px-3 text-xs font-semibold transition-colors',
                filtro === valor ? 'bg-navy-900 text-white shadow-card' : 'text-ink-700 hover:text-ink-900',
              )}
            >
              {rotulo} <span className={cn('tabular-nums', filtro === valor ? 'text-gold-400' : 'text-ink-400')}>{contagem[valor]}</span>
            </button>
          ))}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-card border-2 border-dashed border-line px-4 py-10 text-center text-sm text-ink-500">Nenhuma escola neste filtro.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {visiveis.map((e, i) => (
            <CartaoDaEscola key={e.id} escola={e} indice={i} agora={agora} mostrarTime={variosTimes} onAbrir={() => onAbrir(e.id)} onTirar={() => onTirar(e)} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** "há 5 min", "há 3 h", "há 2 dias". */
function haQuanto(iso: string, agora: number): string {
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

/** As fotos de um lado, encavaladas, no anel da cor de cada um. */
function Rostos({ candidatos, desde, direita = false }: { candidatos: CandidatoDaVotacao[]; desde: number; direita?: boolean }) {
  const mostrar = candidatos.slice(0, 4);
  return (
    <span className={cn('flex items-center -space-x-2.5', direita && 'flex-row-reverse space-x-reverse')}>
      {mostrar.map((c, i) => (
        <span
          key={c.id}
          title={`${c.nome} (${c.numero}) · ${c.cargo}`}
          className="rounded-full ring-2 ring-offset-2 ring-offset-navy-900"
          style={{ '--tw-ring-color': corDoCandidato(desde + i) } as CSSProperties}
        >
          <FotoDoCandidato cargo={c.cargoCodigo} sqcand={c.sqcand ?? null} src={fotoDoCandidatoUrl(c)} nome={c.nome} tamanho="sm" className="ring-0" />
        </span>
      ))}
      {candidatos.length > mostrar.length ? (
        <span className="flex size-9 items-center justify-center rounded-full bg-white/15 text-[0.6875rem] font-bold ring-2 ring-navy-900">
          +{candidatos.length - mostrar.length}
        </span>
      ) : null}
    </span>
  );
}

function CartaoDaEscola({
  escola: e,
  indice,
  agora,
  mostrarTime,
  onAbrir,
  onTirar,
}: {
  escola: EscolaNaSala;
  indice: number;
  agora: number;
  mostrarTime: boolean;
  onAbrir: () => void;
  onTirar: () => void;
}) {
  const r = e.resumo;
  const emDuelo = e.direita.length > 0 && r.direita !== undefined;
  const esquerda = r.esquerda ?? (r.apurado ?? []).reduce((t, n) => t + n, 0);
  const parte = emDuelo ? parteDaEsquerda({ totalEsquerda: esquerda, totalDireita: r.direita ?? 0 }) : 100;
  const resultado = !emDuelo ? null : esquerda > (r.direita ?? 0) ? 'vence' : esquerda < (r.direita ?? 0) ? 'perde' : 'empata';
  return (
    <li className="cmd-cascata" style={{ '--cmd-atraso': `${Math.min(indice, 12) * 50}ms` } as CSSProperties}>
      <article className="group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-overlay">
        {/* A arena em miniatura: os rostos de cada lado e o placar. */}
        <button type="button" onClick={onAbrir} className="relative block overflow-hidden bg-gradient-to-r from-[#0d1f4d] via-navy-900 to-[#4a0d16] px-4 py-3 text-left text-white">
          <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0 opacity-60" />
          <span className="relative flex items-center justify-between gap-3">
            <Rostos candidatos={e.esquerda} desde={0} />
            <span className="flex flex-col items-center">
              {emDuelo ? (
                <span className="flex items-baseline gap-1.5 text-xl font-black tabular-nums">
                  <span className="text-[#7fb6ff]">{formatNumber(esquerda)}</span>
                  <span className="text-xs text-white/40">×</span>
                  <span className="text-[#ff8a8e]">{formatNumber(r.direita ?? 0)}</span>
                </span>
              ) : (
                <span className="flex size-9 items-center justify-center rounded-full bg-gold-400 text-navy-900 transition-transform duration-300 group-hover:rotate-12">
                  <Swords aria-hidden="true" className="size-4.5" />
                </span>
              )}
              <span className="text-[0.5625rem] font-semibold tracking-wider text-white/55 uppercase">{emDuelo ? 'votos' : 'sem adversário'}</span>
            </span>
            {e.direita.length ? (
              <Rostos candidatos={e.direita} desde={e.esquerda.length} direita />
            ) : (
              <span className="flex size-9 items-center justify-center rounded-full border-2 border-dashed border-white/30 text-lg font-bold text-white/50">?</span>
            )}
          </span>
          <span className="relative mt-2.5 flex h-1.5 overflow-hidden rounded-pill bg-white/10">
            <span className="h-full transition-[width] duration-1000" style={{ width: `${parte}%`, background: AZUL }} />
            {emDuelo ? <span className="h-full flex-1" style={{ background: VERMELHO }} /> : null}
          </span>
        </button>

        <div className="flex flex-1 flex-col gap-2.5 p-4">
          <div className="flex items-start justify-between gap-2">
            <button type="button" onClick={onAbrir} className="min-w-0 text-left">
              <h2 className="text-base leading-snug font-bold wrap-break-word text-ink-900 group-hover:text-accent-700">{e.titulo}</h2>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                <MapPin aria-hidden="true" className="size-3 shrink-0" />
                {[e.cidade, e.uf].filter(Boolean).join('/') || 'Local de votação'}
              </p>
            </button>
            {resultado ? (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-pill px-2 py-0.5 text-[0.625rem] font-bold tracking-wide text-white uppercase',
                  resultado === 'vence' ? 'bg-[#2a78d6]' : resultado === 'perde' ? 'bg-[#e5484d]' : 'bg-ink-500',
                )}
              >
                {resultado === 'vence' ? <Trophy aria-hidden="true" className="size-3" /> : null}
                {resultado === 'vence' ? 'vencendo' : resultado === 'perde' ? 'perdendo' : 'empate'}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1.5 text-[0.6875rem]">
            {(r.zonas ?? []).map((z) => (
              <span key={z} className="rounded-pill bg-navy-900 px-2 py-0.5 font-bold text-white">
                Zona {z}
              </span>
            ))}
            <span className="rounded-pill bg-ink-100 px-2 py-0.5 font-semibold text-ink-700 tabular-nums">
              {formatNumber(r.secoes ?? 0)} {r.secoes === 1 ? 'seção' : 'seções'}
            </span>
            <span className="rounded-pill bg-ink-100 px-2 py-0.5 font-semibold text-ink-700 tabular-nums">
              {formatNumber(r.estimativa ?? 0)} do time
            </span>
            {emDuelo && r.vitorias ? (
              <span className="rounded-pill bg-gold-50 px-2 py-0.5 font-semibold text-gold-700 tabular-nums">
                seções {r.vitorias.esquerda} × {r.vitorias.direita}
              </span>
            ) : null}
            {mostrarTime && e.scopeName ? (
              <span className="rounded-pill border border-line px-2 py-0.5 font-semibold text-ink-700">{e.scopeName}</span>
            ) : null}
            {e.recorte.rotulo ? (
              <span className="inline-flex items-center gap-1 rounded-pill bg-gold-50 px-2 py-0.5 font-semibold text-gold-700 ring-1 ring-gold-500/40">
                <Bookmark aria-hidden="true" className="size-2.5" /> {e.recorte.rotulo}
              </span>
            ) : null}
          </div>

          {/* Os Lideres selecionados no envio (ou na sala). */}
          <div className="flex items-center gap-2">
            {e.lideres.length ? (
              <>
                <span className="flex -space-x-1.5">
                  {e.lideres.slice(0, 5).map((l) => (
                    <span
                      key={l.id}
                      title={l.nome}
                      className="flex size-7 items-center justify-center rounded-full bg-gold-500 text-[0.5625rem] font-bold text-navy-900 ring-2 ring-surface"
                    >
                      {initials(l.nome)}
                    </span>
                  ))}
                </span>
                <span className="min-w-0 truncate text-xs text-ink-700">
                  {e.lideres.length === 1 ? e.lideres[0].nome : `${e.lideres.length} líderes marcados`}
                </span>
              </>
            ) : (
              <span className="text-xs text-ink-500">
                <Users aria-hidden="true" className="mr-1 inline size-3.5" />
                {formatNumber(r.lideres ?? 0)} {r.lideres === 1 ? 'líder' : 'líderes'} nesta escola
              </span>
            )}
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
            <p className="flex min-w-0 items-center gap-1 text-[0.6875rem] text-ink-500">
              <Clock aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">
                {e.enviadoPor ? `${e.enviadoPor.split(' ')[0]} · ` : ''}
                {haQuanto(e.atualizadoEm, agora)}
              </span>
            </p>
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onTirar}
                aria-label={`Tirar ${e.titulo} da sala`}
                title="Tirar da sala"
                className="flex size-9 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-danger-50 hover:text-danger-700"
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                onClick={onAbrir}
                className="group/b inline-flex min-h-9 items-center gap-1.5 rounded-pill bg-gradient-to-r from-danger-600 via-[#e0457b] to-danger-600 bg-[length:200%_100%] px-3.5 text-xs font-bold text-white shadow-[0_8px_18px_-10px_rgba(220,38,38,0.9)] transition-all duration-500 hover:bg-right"
              >
                <Swords aria-hidden="true" className="size-3.5" /> Abrir confronto
                <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover/b:translate-x-0.5" />
              </button>
            </span>
          </div>
        </div>
      </article>
    </li>
  );
}

/** Sala vazia: como mandar a primeira escola. */
function SalaVazia() {
  return (
    <div className="rounded-card border-2 border-dashed border-line bg-surface px-4 py-12 text-center">
      <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-danger-600 to-[#e0457b] text-white shadow-[0_12px_26px_-12px_rgba(220,38,38,0.9)]">
        <Swords aria-hidden="true" className="size-8" />
      </span>
      <p className="mt-4 text-lg font-bold text-ink-900">A sala ainda está vazia</p>
      <ol className="mx-auto mt-3 max-w-md space-y-1.5 text-left text-sm text-ink-700">
        {[
          'No mapa, escolha os candidatos e toque numa escola para abrir o Raio-X.',
          'Se quiser, marque um ou mais líderes no Raio-X.',
          'Toque em "Enviar para sala de confronto": a escola aparece aqui.',
        ].map((t, i) => (
          <li key={t} className="flex gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[0.625rem] font-bold text-gold-400">{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>
      <Link
        href="/dashboard"
        className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-pill bg-navy-900 px-4 text-sm font-semibold text-white hover:bg-navy-800"
      >
        <MapaIcone aria-hidden="true" className="size-4" /> Ir para o mapa
      </Link>
    </div>
  );
}

function ListaCarregando() {
  return (
    <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3" aria-label="Carregando a sala">
      {[0, 1, 2].map((i) => (
        <li key={i} className="h-64 animate-pulse rounded-card border border-line bg-surface">
          <div className="h-20 rounded-t-card bg-navy-900/80" />
        </li>
      ))}
    </ul>
  );
}

/** Erro ao ler a sala: quase sempre a migration 060 que falta no Supabase. */
function ErroDaSala({ mensagem, onTentar }: { mensagem: string; onTentar: () => void }) {
  const migration = /migration|estrutura do banco/i.test(mensagem);
  return (
    <div role="alert" className="rounded-card border border-danger-600/30 bg-danger-50 p-4 text-sm text-danger-700">
      <p className="font-bold">{migration ? 'Falta preparar o banco para a Sala de Confronto.' : 'Não foi possível abrir a sala.'}</p>
      <p className="mt-1">
        {migration ? (
          <>
            Execute no SQL Editor do Supabase o arquivo <code className="rounded bg-white px-1">supabase/migrations/060_sala_de_confronto.sql</code> e
            recarregue a página.
          </>
        ) : (
          mensagem
        )}
      </p>
      <button type="button" onClick={onTentar} className="mt-3 min-h-9 rounded-pill bg-danger-600 px-4 text-xs font-bold text-white">
        Tentar de novo
      </button>
    </div>
  );
}
