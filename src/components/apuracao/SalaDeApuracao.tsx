'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Award,
  Check,
  Crown,
  Flag,
  Plus,
  UserRound,
  Star,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  seriesDaNoite,
  vantagem,
  variacoes,
  type CandidatoNaApuracao,
  type MudancaNaApuracao,
  type ResultadoDoCargo,
  type RetratoDaApuracao,
  type SituacaoNaApuracao,
} from '@/lib/domain/apuracao';
import { chaveDoFavorito, type CandidatoDaVotacao } from '@/lib/domain/votacao-tse';
import { ALAGOAS_CENTER } from '@/lib/domain/demo-catalog';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';
import { Contador } from '@/components/ui/Contador';
import { SearchInput } from '@/components/ui/SearchInput';
import { Spinner } from '@/components/ui/Spinner';
import { AndamentoAoVivo } from '@/components/dashboard/votacao/VotacaoTse';
import { textoDoAndamento, useVotacaoAoVivo, type SituacaoAoVivo } from '@/components/dashboard/votacao/use-votacao-ao-vivo';
import { useSession } from '@/components/layout/SessionProvider';
import { corDoCandidato } from '@/components/dashboard/votacao/cores';
import { EscolhaDoMunicipio } from '@/components/dashboard/votacao/EscolhaDoMunicipio';
import type { EstadoDoMapa, PedidoDeVotacao } from '@/components/dashboard/MobilizationMap';
import { createPortal } from 'react-dom';
import { FotoDoCandidato } from './FotoDoCandidato';
import { GraficoDaNoite } from './GraficoDaNoite';
import {
  BandejaDoMapa,
  CentralDoTime,
  chaveDoMarcado,
  type CandidatoMarcado,
  type TimeDaSala,
} from './CentralDoTime';

/**
 * Sala de Apuracao: o resultado da eleicao ao vivo, cargo por cargo.
 *
 * Tudo vem do TSE pela coleta ao vivo (o mesmo relogio do mapa): fotos
 * oficiais, votos, porcentagem dos validos, situacao (eleito, 2o turno),
 * secoes totalizadas, comparecimento, brancos e nulos. A cada versao nova do
 * TSE, a tela mostra o que andou (votos a mais, quem subiu), redesenha a
 * linha da noite e narra as viradas na linha do tempo.
 *
 * Os favoritos (os mesmos do seletor do mapa) ficam no topo.
 *
 * O TIME NO MAPA: escolhido o time, o mapa dele abre aqui mesmo, com "Onde
 * voce tem mais votos". Cada candidato do resultado pode ser MARCADO (ate
 * quatro); a bandeja de baixo manda os marcados para o mapa, e cada um
 * aparece com a sua cor, escola por escola, contra a estimativa do time.
 */

interface EventoDaApuracao extends MudancaNaApuracao {
  em: string;
  horaTse: string | null;
  cargo: number;
}

interface Sala {
  uf: string;
  ano: number;
  turno: number;
  cargos: ResultadoDoCargo[];
  historico: Record<number, RetratoDaApuracao[]>;
  eventos: EventoDaApuracao[];
  favoritos: string[];
  boletins: SituacaoAoVivo;
}

type Variacao = Map<string, { votos: number; posicoes: number }>;

/** Marcar candidatos para o mapa: a posicao (a cor) e o botao. */
interface Marcacao {
  indice: (cargo: number, numero: string) => number;
  alternar: (r: ResultadoDoCargo, c: CandidatoNaApuracao) => void;
}

/** O ultimo time aberto na Sala: conveniencia deste navegador. */
const CHAVE_DO_TIME = 'cmd:sala:time';

/**
 * A escolha de cada time na Sala, lembrada neste navegador: os candidatos
 * marcados na bandeja e os que estavam no mapa (com o municipio). Voltar a
 * Sala — ou recarregar a pagina — devolve tudo como estava, sem escolher os
 * candidatos de novo.
 */
const CHAVE_DA_ESCOLHA = 'cmd:sala:escolha';

interface EscolhaGuardada {
  marcados: CandidatoMarcado[];
  mapa: { candidatos: CandidatoDaVotacao[]; municipios: string[]; estado?: EstadoDoMapa } | null;
}

function lerEscolhas(): Record<string, EscolhaGuardada> {
  try {
    const salvo = JSON.parse(window.localStorage.getItem(CHAVE_DA_ESCOLHA) ?? '{}') as unknown;
    return salvo && typeof salvo === 'object' ? (salvo as Record<string, EscolhaGuardada>) : {};
  } catch {
    return {};
  }
}

function guardarEscolha(time: string, escolha: EscolhaGuardada) {
  try {
    const todas = lerEscolhas();
    if (escolha.marcados.length === 0 && !escolha.mapa) delete todas[time];
    else todas[time] = escolha;
    window.localStorage.setItem(CHAVE_DA_ESCOLHA, JSON.stringify(todas));
  } catch {
    // Sem armazenamento (aba anonima, cota cheia): a escolha vale ate recarregar.
  }
}

const UF_NOME: Record<string, string> = { AL: 'Alagoas' };
const pct = (n: number, casas = 2) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
/** O Contador so corre inteiros: a porcentagem corre em centesimos. */
const centesimos = (n: number) => pct(n / 100);

/** Disputa em cards (poucos nomes, poucas vagas); o resto vira ranking. */
const ehDisputa = (r: ResultadoDoCargo) => r.vagas <= 2 && r.candidatos.length <= 16;

export function SalaDeApuracao() {
  const { user } = useSession();
  const podeEscolherTime = user?.role === 'ADMIN';
  // A versao anterior de cada cargo, para mostrar o que andou desde ela.
  const ultimo = useRef(new Map<number, ResultadoDoCargo>());
  const anterior = useRef(new Map<number, ResultadoDoCargo>());
  const loader = useCallback(
    () =>
      api<Sala>('/api/apuracao').then((sala) => {
        const deltas: Record<number, Variacao> = {};
        for (const r of sala.cargos) {
          const visto = ultimo.current.get(r.cargo);
          if (visto && visto.versao !== r.versao) anterior.current.set(r.cargo, visto);
          ultimo.current.set(r.cargo, r);
          deltas[r.cargo] = variacoes(anterior.current.get(r.cargo), r);
        }
        return { sala, deltas };
      }),
    [],
  );
  const { data, error, reload } = useRepositoryQuery(loader);
  // A apuracao anda enquanto a Sala esta aberta (o mesmo relogio do mapa).
  const aoVivo = useVotacaoAoVivo(true, reload);

  const sala = data?.sala ?? null;
  const [cargoEscolhido, setCargoEscolhido] = useState<number | null>(null);
  const cargoAtivo =
    sala?.cargos.find((c) => c.cargo === cargoEscolhido) ??
    sala?.cargos.find((c) => c.cargo === 3) ??
    sala?.cargos[0] ??
    null;

  // Favoritos: marcacao na hora, confirmada pelo servidor.
  const [marcados, setMarcados] = useState<string[] | null>(null);
  const favoritos = useMemo(() => new Set(marcados ?? sala?.favoritos ?? []), [marcados, sala]);
  const chave = (cargo: number, numero: string) =>
    chaveDoFavorito({ ano: sala?.ano ?? 0, uf: sala?.uf ?? '', cargoCodigo: cargo, numero });
  function alternarFavorito(cargo: number, numero: string) {
    if (!sala) return;
    const k = chave(cargo, numero);
    const antes = [...favoritos];
    const favorito = !favoritos.has(k);
    setMarcados(favorito ? [...antes, k] : antes.filter((x) => x !== k));
    api<{ favoritos: string[] }>('/api/votacao/favoritos', {
      method: 'POST',
      body: { ano: sala.ano, uf: sala.uf, cargoCodigo: cargo, numero, favorito },
    })
      .then((r) => setMarcados(r.favoritos))
      .catch(() => setMarcados(antes));
  }

  /* --- O time no mapa ------------------------------------------------- */

  const [time, setTime] = useState<TimeDaSala | null>(null);
  const escolherTime = useCallback(
    (novo: TimeDaSala | null) => {
      setTime((atual) =>
        atual && novo && atual.id === novo.id && atual.nome === novo.nome && atual.foto === novo.foto ? atual : novo,
      );
      if (!podeEscolherTime) return;
      try {
        if (novo) window.localStorage.setItem(CHAVE_DO_TIME, JSON.stringify(novo));
        else window.localStorage.removeItem(CHAVE_DO_TIME);
      } catch {
        // Sem armazenamento: o time vale ate recarregar.
      }
    },
    [podeEscolherTime],
  );
  // O ADMIN volta para o ultimo time que abriu.
  useEffect(() => {
    if (!podeEscolherTime) return;
    try {
      const salvo = JSON.parse(window.localStorage.getItem(CHAVE_DO_TIME) ?? 'null') as TimeDaSala | null;
      if (salvo?.id && salvo.nome) {
        const quadro = requestAnimationFrame(() => setTime((atual) => atual ?? salvo));
        return () => cancelAnimationFrame(quadro);
      }
    } catch {
      // Valor estragado ou sem armazenamento: comeca sem time.
    }
    return undefined;
  }, [podeEscolherTime]);

  const mapaRef = useRef<HTMLDivElement>(null);
  const [paraOMapa, setParaOMapa] = useState<CandidatoMarcado[]>([]);
  const [pedido, setPedido] = useState<PedidoDeVotacao | null>(null);
  /** Os marcados ja achados na votacao, esperando a escolha do municipio. */
  const [escolhendoMunicipio, setEscolhendoMunicipio] = useState<{ prontos: CandidatoDaVotacao[]; faltam: string[] } | null>(null);
  /** As chaves que estao no mapa agora: a bandeja diz se ha algo novo para mandar. */
  const [noMapa, setNoMapa] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /** O que esta no mapa agora (candidatos e municipio): e o que volta ao reabrir a Sala. */
  const [ultimoNoMapa, setUltimoNoMapa] = useState<EscolhaGuardada['mapa']>(null);

  // A escolha de cada time: guardada a cada mudanca, devolvida ao voltar.
  const chaveDoTime = time?.id ?? (podeEscolherTime ? null : (user?.candidateId ?? 'time'));
  const restaurado = useRef<string | null>(null);
  useEffect(() => {
    if (!chaveDoTime || restaurado.current === chaveDoTime) return;
    const escolha = lerEscolhas()[chaveDoTime];
    const quadro = requestAnimationFrame(() => {
      restaurado.current = chaveDoTime;
      setParaOMapa(escolha?.marcados ?? []);
      setUltimoNoMapa(escolha?.mapa ?? null);
      if (escolha?.mapa?.candidatos.length) {
        setPedido({ candidatos: escolha.mapa.candidatos, vez: Date.now(), municipios: escolha.mapa.municipios, estado: escolha.mapa.estado });
        setNoMapa(escolha.mapa.candidatos.map((c) => chaveDoMarcado(c.cargoCodigo, c.numero)).join('|'));
      } else {
        setNoMapa('');
      }
    });
    return () => cancelAnimationFrame(quadro);
  }, [chaveDoTime]);
  useEffect(() => {
    if (!chaveDoTime || restaurado.current !== chaveDoTime) return;
    guardarEscolha(chaveDoTime, { marcados: paraOMapa, mapa: ultimoNoMapa });
  }, [chaveDoTime, paraOMapa, ultimoNoMapa]);
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 6000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const marcacao: Marcacao = {
    indice: (cargo, numero) => paraOMapa.findIndex((m) => m.chave === chaveDoMarcado(cargo, numero)),
    alternar: (r, c) => {
      const chaveNova = chaveDoMarcado(r.cargo, c.numero);
      // Sem limite: quantos candidatos quiser, cada um na sua cor.
      setParaOMapa((atual) =>
        atual.some((m) => m.chave === chaveNova)
          ? atual.filter((m) => m.chave !== chaveNova)
          : [
              ...atual,
              {
                chave: chaveNova,
                cargo: r.cargo,
                numero: c.numero,
                nome: c.nome,
                nomeDoCargo: r.nomeDoCargo,
                sqcand: c.sqcand,
                ano: sala?.ano ?? new Date().getFullYear(),
              },
            ],
      );
    },
  };

  const irParaOMapa = () => {
    const alvo = mapaRef.current ?? document.getElementById('mapa-do-time');
    alvo?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /**
   * Manda os marcados para o mapa: cada um vira a votacao dele, secao por
   * secao. Antes, a pergunta: qual municipio? (passo 2, como na central).
   */
  async function verNoMapa() {
    if (!time) {
      setAviso('Escolha um time primeiro: é o mapa dele que mostra os votos.');
      document.getElementById('mapa-do-time')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (enviando) return;
    setEnviando(true);
    try {
      const { candidatos } = await api<{ candidatos: CandidatoDaVotacao[] }>('/api/votacao');
      const turno = sala?.turno ?? 0;
      const achados = paraOMapa.map(
        (m) =>
          candidatos
            .filter((c) => c.cargoCodigo === m.cargo && c.numero === m.numero)
            // O turno da apuracao primeiro; sem ele, o mais recente.
            .sort((a, b) => Number(b.turno === turno) - Number(a.turno === turno) || b.turno - a.turno)[0] ?? null,
      );
      const prontos = achados.filter((c): c is CandidatoDaVotacao => c !== null);
      const faltam = paraOMapa.filter((_, i) => achados[i] === null).map((m) => m.nome.split(' ')[0]);
      if (prontos.length === 0) {
        setAviso('Ainda não chegaram os votos por seção desses candidatos. O mapa se atualiza sozinho conforme o TSE publica.');
        return;
      }
      setEscolhendoMunicipio({ prontos, faltam });
    } catch {
      setAviso('Não foi possível carregar a votação por seção. Tente de novo em instantes.');
    } finally {
      setEnviando(false);
    }
  }

  /** Municipio escolhido: a pagina desce ate o mapa, que abre ja no recorte. */
  function abrirNoMapa(municipios: string[]) {
    if (!escolhendoMunicipio) return;
    const { prontos, faltam } = escolhendoMunicipio;
    setEscolhendoMunicipio(null);
    // A espera aparece no proprio mapa enquanto a votacao de cada um chega.
    setPedido({ candidatos: prontos, vez: Date.now(), municipios });
    setUltimoNoMapa({ candidatos: prontos, municipios });
    setNoMapa(prontos.map((c) => chaveDoMarcado(c.cargoCodigo, c.numero)).join('|'));
    if (faltam.length) setAviso(`Ainda sem votos por seção: ${faltam.join(', ')}. Os outros já estão no mapa.`);
    requestAnimationFrame(irParaOMapa);
  }

  const fecharEscolhaDoMunicipio = useCallback(() => setEscolhendoMunicipio(null), []);

  /** Os filtros, o placar e a escola aberta no mapa: guardados com os candidatos. */
  const estadoDoMapa = useCallback(
    (estado: EstadoDoMapa) => setUltimoNoMapa((atual) => (atual ? { ...atual, municipios: estado.filtros.cities, estado } : atual)),
    [],
  );

  /** O mapa mudou a escolha por dentro (o placar, o seletor dele): a bandeja acompanha. */
  const candidatosDoMapa = useCallback((lista: CandidatoDaVotacao[]) => {
    setParaOMapa(
      lista.map((c) => ({
        chave: chaveDoMarcado(c.cargoCodigo, c.numero),
        cargo: c.cargoCodigo,
        numero: c.numero,
        nome: c.nome,
        nomeDoCargo: c.cargo,
        sqcand: c.sqcand ?? null,
        ano: c.ano,
      })),
    );
    setNoMapa(lista.map((c) => chaveDoMarcado(c.cargoCodigo, c.numero)).join('|'));
    setUltimoNoMapa((atual) => (lista.length ? { candidatos: lista, municipios: atual?.municipios ?? [] } : null));
  }, []);

  const jaNoMapa = paraOMapa.length > 0 && paraOMapa.map((m) => m.chave).join('|') === noMapa;

  return (
    <div
      className={cn('space-y-5', paraOMapa.length > 0 && 'pb-28 sm:pb-24')}
    >
      <Cabecalho
        sala={sala}
        cargo={cargoAtivo}
        aoVivo={aoVivo}
      />

      <CentralDoTime
        podeEscolher={podeEscolherTime}
        timeDaSessao={podeEscolherTime ? null : (user?.candidateId ?? null)}
        time={time}
        onTime={escolherTime}
        pedido={pedido}
        onCandidatosDoMapa={candidatosDoMapa}
        onEstadoDoMapa={estadoDoMapa}
        marcados={jaNoMapa ? [] : paraOMapa}
        fallbackCenter={sala?.uf === 'AL' || !sala ? ALAGOAS_CENTER : undefined}
        mapaRef={mapaRef}
      />

      {error ? (
        <p className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          Não foi possível carregar a Sala de Apuração. {error}
        </p>
      ) : sala === null ? (
        <div className="flex items-center justify-center gap-2 rounded-card border border-line bg-surface py-16 text-sm text-ink-500">
          <Spinner className="size-4" /> Abrindo a Sala de Apuração…
        </div>
      ) : sala.cargos.length === 0 ? null : (
        <>
          <Favoritos
            sala={sala}
            favoritos={favoritos}
            deltas={data?.deltas ?? {}}
            onEscolher={(cargo) => setCargoEscolhido(cargo)}
            onFavorito={alternarFavorito}
            marcacao={marcacao}
          />

          <AbasDosCargos cargos={sala.cargos} ativo={cargoAtivo?.cargo ?? null} onEscolher={setCargoEscolhido} />

          {cargoAtivo ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <section aria-label={`Resultado para ${cargoAtivo.nomeDoCargo}`} className="min-w-0 space-y-4">
                {ehDisputa(cargoAtivo) ? (
                  <Disputa
                    r={cargoAtivo}
                    deltas={data?.deltas[cargoAtivo.cargo] ?? new Map()}
                    favorito={(n) => favoritos.has(chave(cargoAtivo.cargo, n))}
                    onFavorito={(n) => alternarFavorito(cargoAtivo.cargo, n)}
                    marcacao={marcacao}
                  />
                ) : (
                  <Ranking
                    key={cargoAtivo.cargo}
                    r={cargoAtivo}
                    deltas={data?.deltas[cargoAtivo.cargo] ?? new Map()}
                    favorito={(n) => favoritos.has(chave(cargoAtivo.cargo, n))}
                    onFavorito={(n) => alternarFavorito(cargoAtivo.cargo, n)}
                    marcacao={marcacao}
                  />
                )}
                <Cartao
                  titulo="A noite da apuração"
                  icone={<Activity className="size-4" />}
                  extra={<span className="text-xs text-ink-500">% dos válidos conforme as seções são totalizadas</span>}
                >
                  <GraficoDaNoite series={seriesDaNoite(sala.historico[cargoAtivo.cargo] ?? [], cargoAtivo)} />
                </Cartao>
              </section>

              <aside className="min-w-0 space-y-5 xl:sticky xl:top-4 xl:self-start">
                <LinhaDoTempo eventos={sala.eventos} cargos={sala.cargos} />
              </aside>
            </div>
          ) : null}
        </>
      )}

      <BandejaDoMapa
        marcados={paraOMapa}
        time={time}
        enviando={enviando}
        aviso={aviso}
        jaNoMapa={jaNoMapa}
        onTirar={(k) => setParaOMapa((atual) => atual.filter((m) => m.chave !== k))}
        onVerNoMapa={() => (jaNoMapa ? irParaOMapa() : void verNoMapa())}
      />

      {escolhendoMunicipio
        ? createPortal(
            <div className="fixed inset-0 z-50">
              <EscolhaDoMunicipio
                candidatos={escolhendoMunicipio.prontos}
                rotuloDoVoltar="Sala de Apuração"
                passo={null}
                onVoltar={fecharEscolhaDoMunicipio}
                onConfirmar={abrirNoMapa}
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Cabecalho: o estado da apuracao
   ------------------------------------------------------------------------- */

function Cabecalho({
  sala,
  cargo,
  aoVivo,
}: {
  sala: Sala | null;
  cargo: ResultadoDoCargo | null;
  aoVivo: ReturnType<typeof useVotacaoAoVivo>;
}) {
  const secoes = cargo?.secoes.pct ?? 0;
  const final = cargo?.final ?? false;
  return (
    <header className="relative overflow-hidden rounded-card bg-gradient-to-br from-navy-900 via-navy-800 to-brand-800 p-5 text-white shadow-card sm:p-6">
      <span aria-hidden="true" className="pointer-events-none absolute -top-28 -right-20 size-80 rounded-full bg-gold-500/20 blur-3xl" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-16 size-72 rounded-full bg-brand-500/25 blur-3xl" />

      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.16em] text-white/75 uppercase">
            {final ? (
              <>
                <Flag aria-hidden="true" className="size-3.5 text-gold-400" /> Totalização final
              </>
            ) : (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-success-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-success-400" />
                </span>
                Ao vivo
              </>
            )}
          </p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Sala de Apuração</h1>
          <p className="mt-1 text-sm text-white/75">
            Eleições {sala?.ano ?? 2026} · {sala ? (UF_NOME[sala.uf] ?? sala.uf) : '—'} · {sala?.turno ?? 1}º turno
            {cargo?.atualizadoTse ? ` · atualizado pelo TSE às ${cargo.atualizadoTse.split(' ')[1] ?? cargo.atualizadoTse}` : ''}
          </p>

          {cargo ? (
            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { rotulo: 'Comparecimento', valor: cargo.eleitorado.pctComparecimento, nota: `${formatNumber(cargo.eleitorado.comparecimento)} eleitores` },
                { rotulo: 'Abstenção', valor: cargo.eleitorado.pctAbstencao, nota: `${formatNumber(cargo.eleitorado.abstencao)} eleitores` },
                { rotulo: 'Brancos', valor: cargo.votos.pctBrancos, nota: `${formatNumber(cargo.votos.brancos)} votos` },
                { rotulo: 'Nulos', valor: cargo.votos.pctNulos, nota: `${formatNumber(cargo.votos.nulos)} votos` },
              ].map((k, i) => (
                <div
                  key={k.rotulo}
                  className="animate-fade-up rounded-control border border-white/10 bg-white/5 px-3 py-2"
                  style={{ animationDelay: `${80 + i * 60}ms` }}
                >
                  <dt className="text-[0.6875rem] font-medium tracking-wide text-white/65 uppercase">{k.rotulo}</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    <Contador valor={Math.round(k.valor * 100)} formatar={centesimos} />
                  </dd>
                  <dd className="text-[0.6875rem] text-white/55">{k.nota}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className="flex flex-col items-center gap-3 pb-5">
          <AnelDeSecoes pct={secoes} totalizadas={cargo?.secoes.totalizadas ?? 0} total={cargo?.secoes.total ?? 0} />

        </div>
      </div>

      <div className="relative mt-4 rounded-control bg-white/95 px-3 py-1.5">
        <AndamentoAoVivo
          className="mb-0"
          texto={
            textoDoAndamento(aoVivo.situacao) ??
            (sala?.cargos.length ? 'resultado do TSE em dia; os boletins por seção chegam aos poucos para o mapa' : null)
          }
          coletando={aoVivo.coletando}
          pausadoAte={aoVivo.situacao?.pausadoAte ?? null}
          erro={aoVivo.erro}
        />
      </div>
    </header>
  );
}

/** O anel das secoes totalizadas: a pergunta numero um da noite. */
function AnelDeSecoes({ pct: valor, totalizadas, total }: { pct: number; totalizadas: number; total: number }) {
  const raio = 52;
  const volta = 2 * Math.PI * raio;
  return (
    <div className="relative size-36" role="img" aria-label={`${pct(valor)} das seções totalizadas`}>
      <svg viewBox="0 0 128 128" className="size-full -rotate-90">
        <circle cx="64" cy="64" r={raio} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="10" />
        <circle
          cx="64"
          cy="64"
          r={raio}
          fill="none"
          stroke="url(#anel-ouro)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={volta}
          strokeDashoffset={volta * (1 - Math.min(100, valor) / 100)}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="anel-ouro" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f6c453" />
            <stop offset="100%" stopColor="#e0a426" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-bold tabular-nums">
          <Contador valor={Math.round(valor * 100)} formatar={centesimos} />
        </span>
        <span className="text-[0.625rem] font-medium tracking-wide text-white/70 uppercase">das seções</span>
      </div>
      {total ? (
        <p className="absolute inset-x-0 -bottom-5 text-center text-[0.625rem] whitespace-nowrap text-white/60 tabular-nums">
          {formatNumber(totalizadas)} de {formatNumber(total)} totalizadas
        </p>
      ) : null}
    </div>
  );
}


/* -------------------------------------------------------------------------
   Pecas
   ------------------------------------------------------------------------- */

function Cartao({ titulo, icone, children, extra }: { titulo: string; icone: ReactNode; children: ReactNode; extra?: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4 shadow-card">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <span className="text-brand-700">{icone}</span>
          {titulo}
        </h2>
        {extra}
      </header>
      {children}
    </section>
  );
}

const SITUACAO: Record<SituacaoNaApuracao, { texto: string; classe: string } | null> = {
  ELEITO: { texto: 'Eleito', classe: 'bg-gold-500 text-navy-900' },
  SEGUNDO_TURNO: { texto: '2º turno', classe: 'bg-brand-700 text-white' },
  SUPLENTE: { texto: 'Suplente', classe: 'bg-ink-100 text-ink-700' },
  NAO_ELEITO: { texto: 'Não eleito', classe: 'bg-ink-100 text-ink-500' },
  EM_APURACAO: null,
};

function SeloDaSituacao({ c }: { c: CandidatoNaApuracao }) {
  const s = SITUACAO[c.situacao];
  if (!s) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[0.6875rem] font-bold', s.classe)}>
      {c.situacao === 'ELEITO' ? <Award aria-hidden="true" className="size-3" /> : null}
      {/* "Eleito por QP", "Eleito por média": o texto do TSE quando diz mais. */}
      {c.situacao === 'ELEITO' && c.situacaoTse && c.situacaoTse !== 'Eleito' ? c.situacaoTse : s.texto}
    </span>
  );
}

function Andou({ v }: { v: { votos: number; posicoes: number } | undefined }) {
  if (!v) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold tabular-nums">
      {v.votos > 0 ? (
        <span key={v.votos} className="animate-fade-up rounded-pill bg-success-50 px-1.5 py-0.5 text-success-700">
          +{formatNumber(v.votos)}
        </span>
      ) : null}
      {v.posicoes > 0 ? (
        <span className="inline-flex items-center text-success-700" title={`Subiu ${v.posicoes}`}>
          <ArrowUp aria-hidden="true" className="size-3" />
          {v.posicoes}
        </span>
      ) : v.posicoes < 0 ? (
        <span className="inline-flex items-center text-danger-700" title={`Caiu ${-v.posicoes}`}>
          <ArrowDown aria-hidden="true" className="size-3" />
          {-v.posicoes}
        </span>
      ) : null}
    </span>
  );
}

function BotaoFavorito({ ativo, nome, onClick }: { ativo: boolean; nome: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      aria-label={ativo ? `Tirar ${nome} dos favoritos` : `Favoritar ${nome}`}
      title={ativo ? 'Tirar dos favoritos' : 'Favoritar'}
      className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-400 transition-transform hover:scale-110 hover:text-gold-600"
    >
      <Star aria-hidden="true" className={cn('size-5', ativo && 'fill-gold-500 text-gold-600')} />
    </button>
  );
}

/** Marca o candidato para o mapa, na cor que ele tera la. */
function MarcarParaMapa({
  r,
  c,
  marcacao,
  compacto = false,
}: {
  r: ResultadoDoCargo;
  c: CandidatoNaApuracao;
  marcacao: Marcacao;
  compacto?: boolean;
}) {
  const indice = marcacao.indice(r.cargo, c.numero);
  const marcado = indice >= 0;
  return (
    <button
      type="button"
      onClick={() => marcacao.alternar(r, c)}
      aria-pressed={marcado}
      title={marcado ? `Tirar ${c.nome} do mapa` : `Marcar ${c.nome} para ver no mapa`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-pill border text-[0.6875rem] font-semibold transition-all duration-200',
        compacto ? 'min-h-8 px-2' : 'min-h-8 px-2.5',
        marcado
          ? 'border-transparent text-white shadow-[0_6px_14px_-6px_rgba(15,30,53,0.6)]'
          : 'border-line bg-surface text-brand-800 hover:-translate-y-0.5 hover:border-accent-600 hover:bg-accent-50',
      )}
      style={marcado ? { background: corDoCandidato(indice) } : undefined}
    >
      {marcado ? (
        <Check aria-hidden="true" className="cmd-chip-entra size-3.5" strokeWidth={3} />
      ) : (
        <Plus aria-hidden="true" className="size-3.5" />
      )}
      <span className={cn(compacto && 'max-sm:sr-only')}>{marcado ? 'No mapa' : 'Marcar p/ mapa'}</span>
    </button>
  );
}

function AbasDosCargos({ cargos, ativo, onEscolher }: { cargos: ResultadoDoCargo[]; ativo: number | null; onEscolher: (c: number) => void }) {
  return (
    <nav aria-label="Cargos" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {cargos.map((c) => {
        const lider = c.candidatos[0];
        const ligado = c.cargo === ativo;
        return (
          <button
            key={c.cargo}
            type="button"
            aria-pressed={ligado}
            onClick={() => onEscolher(c.cargo)}
            className={cn(
              'flex min-w-48 shrink-0 items-center gap-2.5 rounded-card border px-3 py-2 text-left transition-all duration-200',
              ligado ? 'border-brand-700 bg-brand-700 text-white shadow-card' : 'border-line bg-surface text-ink-900 hover:-translate-y-0.5 hover:border-brand-300',
            )}
          >
            {lider ? <FotoDoCandidato cargo={c.cargo} sqcand={lider.sqcand} nome={lider.nome} tamanho="sm" /> : null}
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{c.nomeDoCargo}</span>
              <span className={cn('block wrap-break-word text-[0.6875rem]', ligado ? 'text-white/75' : 'text-ink-500')}>
                {lider ? `${lider.nome.split(' ')[0]} lidera · ${pct(lider.pct, 1)}` : 'sem votos ainda'}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------------------
   Disputa: Presidente, Governador, Senador
   ------------------------------------------------------------------------- */

function Disputa({
  r,
  deltas,
  favorito,
  onFavorito,
  marcacao,
}: {
  r: ResultadoDoCargo;
  deltas: Variacao;
  favorito: (numero: string) => boolean;
  onFavorito: (numero: string) => void;
  marcacao: Marcacao;
}) {
  const v = vantagem(r);
  const maior = Math.max(1, ...r.candidatos.map((c) => c.pct));
  const [lider] = r.candidatos;

  return (
    <div className="space-y-3">
      {lider && v && lider.votos > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-gold-100 bg-gold-50 px-4 py-2.5 text-sm text-ink-900">
          <Trophy aria-hidden="true" className="size-4 text-gold-700" />
          <span>
            <b>{lider.nome}</b> {r.final ? 'venceu' : 'lidera'} com vantagem de <b className="tabular-nums">{formatNumber(v.votos)}</b> votos (
            <span className="tabular-nums">{pct(v.pontos, 1).replace('%', ' p.p.')}</span>)
            {r.vagas > 1 ? ` · ${r.vagas} vagas: os ${r.vagas} mais votados são eleitos` : ''}
          </span>
        </div>
      ) : null}

      <ol className="space-y-2.5">
        {r.candidatos.map((c, i) => {
          const primeiro = i === 0 && c.votos > 0;
          const dentro = i < r.vagas;
          return (
            <li key={c.numero}>
              {i === r.vagas && r.vagas > 0 && r.candidatos.length > r.vagas ? (
                <div className="my-3 flex items-center gap-2 text-[0.6875rem] font-semibold tracking-wide text-ink-400 uppercase" aria-hidden="true">
                  <span className="h-px flex-1 border-t border-dashed border-ink-200" />
                  {r.vagas === 1 ? 'linha da vaga' : `linha das ${r.vagas} vagas`}
                  <span className="h-px flex-1 border-t border-dashed border-ink-200" />
                </div>
              ) : null}
              <article
                className={cn(
                  'group relative flex items-center gap-3 overflow-hidden rounded-card border bg-surface p-3 transition-all duration-500 sm:gap-4 sm:p-4',
                  primeiro ? 'border-gold-400 shadow-card ring-1 ring-gold-100' : 'border-line',
                  !dentro && 'opacity-90',
                )}
              >
                {primeiro ? (
                  <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-gold-400 to-gold-600" />
                ) : null}
                <span className="hidden w-5 shrink-0 text-center text-sm font-bold text-ink-400 tabular-nums sm:block">{c.posicao}º</span>
                <span className="relative self-start sm:self-center">
                  <FotoDoCandidato
                    cargo={r.cargo}
                    sqcand={c.sqcand}
                    nome={c.nome}
                    situacao={c.situacao}
                    tamanho={primeiro ? 'xl' : 'lg'}
                    className={primeiro ? 'max-sm:size-16 max-sm:text-lg' : undefined}
                  />
                  {primeiro ? (
                    <span className="absolute -top-2 -right-1 flex size-7 items-center justify-center rounded-full bg-gold-500 text-navy-900 shadow-card">
                      <Crown aria-hidden="true" className="size-4" />
                    </span>
                  ) : null}
                </span>

                <div className="min-w-0 flex-1 pr-8 sm:pr-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className={cn('font-semibold text-ink-900 sm:wrap-break-word', primeiro ? 'text-lg' : 'text-base')}>
                      <span className="text-ink-400 sm:hidden">{c.posicao}º </span>
                      {c.nome}
                    </h3>
                    <SeloDaSituacao c={c} />
                    <Andou v={deltas.get(c.numero)} />
                  </div>
                  <p className="text-xs text-ink-500">
                    {c.partido ?? 'Sem partido'} · {c.numero}
                    {c.companhia.length ? ` · ${c.companhia.map((x) => (x.tipo === 'v' ? `vice ${x.nome}` : x.nome)).join(', ')}` : ''}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-ink-100">
                      <div
                        className={cn(
                          'h-full rounded-pill transition-[width] duration-1000 ease-out',
                          primeiro ? 'bg-gradient-to-r from-gold-400 to-gold-600' : dentro ? 'bg-brand-600' : 'bg-navy-300',
                        )}
                        style={{ width: `${Math.max(1, (c.pct / maior) * 100)}%` }}
                      />
                    </div>
                  </div>
                  {/* No celular, a porcentagem desce para baixo da barra. */}
                  <p className="mt-2 flex items-baseline gap-2 sm:hidden">
                    <span className="text-2xl font-bold text-ink-900 tabular-nums">{pct(c.pct)}</span>
                    <span className="text-xs text-ink-500 tabular-nums">{formatNumber(c.votos)} votos</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <MarcarParaMapa r={r} c={c} marcacao={marcacao} />
                  </div>
                </div>

                <div className="hidden shrink-0 text-right sm:block">
                  <p className={cn('font-bold text-ink-900 tabular-nums', primeiro ? 'text-3xl' : 'text-2xl')}>
                    <Contador valor={Math.round(c.pct * 100)} formatar={centesimos} />
                  </p>
                  <p className="text-xs text-ink-500 tabular-nums">
                    <Contador valor={c.votos} /> votos
                  </p>
                </div>
                <span className="max-sm:absolute max-sm:top-2 max-sm:right-2">
                  <BotaoFavorito ativo={favorito(c.numero)} nome={c.nome} onClick={() => onFavorito(c.numero)} />
                </span>
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* -------------------------------------------------------------------------
   Ranking: Deputados
   ------------------------------------------------------------------------- */

const POR_PAGINA = 60;

function Ranking({
  r,
  deltas,
  favorito,
  onFavorito,
  marcacao,
}: {
  r: ResultadoDoCargo;
  deltas: Variacao;
  favorito: (numero: string) => boolean;
  onFavorito: (numero: string) => void;
  marcacao: Marcacao;
}) {
  const [busca, setBusca] = useState('');
  const [soFavoritos, setSoFavoritos] = useState(false);
  const [quantos, setQuantos] = useState(POR_PAGINA);
  const termo = busca
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  const lista = r.candidatos.filter(
    (c) =>
      (!soFavoritos || favorito(c.numero)) &&
      (!termo ||
        c.numero.startsWith(termo) ||
        c.nome
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .includes(termo) ||
        (c.partido ?? '').toLowerCase().includes(termo)),
  );
  const maior = Math.max(1, ...r.candidatos.map((c) => c.pct));
  const eleitos = r.candidatos.filter((c) => c.situacao === 'ELEITO').length;

  return (
    <Cartao
      titulo={`${r.nomeDoCargo} · ${formatNumber(r.candidatos.length)} candidatos · ${r.vagas} vagas`}
      icone={<Trophy className="size-4" />}
      extra={eleitos ? <span className="text-xs font-semibold text-gold-700">{eleitos} eleitos</span> : null}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput id="busca-apuracao" value={busca} onChange={setBusca} label="Buscar candidato" placeholder="Nome, número ou partido" className="min-w-56 flex-1" />
        <button
          type="button"
          aria-pressed={soFavoritos}
          onClick={() => setSoFavoritos((s) => !s)}
          className={cn(
            'inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold',
            soFavoritos ? 'border-gold-600 bg-gold-500 text-navy-900' : 'border-line bg-surface text-ink-700 hover:bg-ink-50',
          )}
        >
          <Star aria-hidden="true" className={cn('size-3.5', soFavoritos && 'fill-current')} /> Favoritos
        </button>
      </div>

      <ol className="divide-y divide-line">
        {lista.slice(0, quantos).map((c) => (
          <li key={c.numero} className="flex items-center gap-3 py-2.5">
            <span
              className={cn(
                'w-8 shrink-0 text-center text-xs font-bold tabular-nums',
                c.posicao <= 3 ? 'text-gold-700' : 'text-ink-400',
              )}
            >
              {c.posicao}º
            </span>
            <FotoDoCandidato cargo={r.cargo} sqcand={c.sqcand} nome={c.nome} situacao={c.situacao} tamanho="md" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="wrap-break-word text-sm font-semibold text-ink-900">{c.nome}</span>
                <SeloDaSituacao c={c} />
                <Andou v={deltas.get(c.numero)} />
              </div>
              <p className="text-xs text-ink-500">
                {c.partido ?? 'Sem partido'} · {c.numero}
              </p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-ink-100">
                <div className="h-full rounded-pill bg-brand-600 transition-[width] duration-1000 ease-out" style={{ width: `${Math.max(1, (c.pct / maior) * 100)}%` }} />
              </div>
            </div>
            <MarcarParaMapa r={r} c={c} marcacao={marcacao} compacto />
            <div className="w-24 shrink-0 text-right">
              <p className="text-sm font-bold text-ink-900 tabular-nums">{pct(c.pct)}</p>
              <p className="text-[0.6875rem] text-ink-500 tabular-nums">{formatNumber(c.votos)} votos</p>
            </div>
            <BotaoFavorito ativo={favorito(c.numero)} nome={c.nome} onClick={() => onFavorito(c.numero)} />
          </li>
        ))}
      </ol>
      {lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-500">
          {soFavoritos ? 'Nenhum favorito neste cargo. Toque na estrela para favoritar.' : 'Ninguém encontrado com essa busca.'}
        </p>
      ) : null}
      {lista.length > quantos ? (
        <button
          type="button"
          onClick={() => setQuantos((q) => q + POR_PAGINA)}
          className="mt-3 w-full rounded-control border border-line py-2 text-xs font-semibold text-brand-800 hover:bg-brand-50"
        >
          Mostrar mais {formatNumber(Math.min(POR_PAGINA, lista.length - quantos))} de {formatNumber(lista.length - quantos)}
        </button>
      ) : null}
    </Cartao>
  );
}

/* -------------------------------------------------------------------------
   Favoritos e linha do tempo
   ------------------------------------------------------------------------- */

function Favoritos({
  sala,
  favoritos,
  deltas,
  onEscolher,
  onFavorito,
  marcacao,
}: {
  sala: Sala;
  favoritos: Set<string>;
  deltas: Record<number, Variacao>;
  onEscolher: (cargo: number) => void;
  onFavorito: (cargo: number, numero: string) => void;
  marcacao: Marcacao;
}) {
  const meus = sala.cargos.flatMap((r) =>
    r.candidatos
      .filter((c) => favoritos.has(chaveDoFavorito({ ano: sala.ano, uf: sala.uf, cargoCodigo: r.cargo, numero: c.numero })))
      .map((c) => ({ r, c })),
  );
  if (meus.length === 0) return null;

  return (
    <section aria-label="Seus favoritos" className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <UserRound aria-hidden="true" className="size-4 text-gold-600" /> Seus candidatos
      </h2>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
        {meus.map(({ r, c }) => (
          <article
            key={`${r.cargo}:${c.numero}`}
            className="relative flex w-64 shrink-0 items-center gap-3 rounded-card border border-gold-100 bg-gradient-to-br from-surface to-gold-50 p-3 shadow-card"
          >
            <FotoDoCandidato cargo={r.cargo} sqcand={c.sqcand} nome={c.nome} situacao={c.situacao} tamanho="lg" />
            <button type="button" onClick={() => onEscolher(r.cargo)} className="min-w-0 flex-1 pr-6 text-left">
              <p className="wrap-break-word text-sm font-semibold text-ink-900">{c.nome}</p>
              <p className="text-[0.6875rem] text-ink-500">
                {r.nomeDoCargo} · {c.posicao}º de {formatNumber(r.candidatos.length)}
              </p>
              <p className="mt-0.5 text-lg font-bold text-ink-900 tabular-nums">
                <Contador valor={Math.round(c.pct * 100)} formatar={centesimos} />
              </p>
              <p className="flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-ink-500 tabular-nums">
                {formatNumber(c.votos)} votos <Andou v={deltas[r.cargo]?.get(c.numero)} />
              </p>
              <span className="mt-1 inline-block">
                <SeloDaSituacao c={c} />
              </span>
            </button>
            <span className="absolute right-2 bottom-2">
              <MarcarParaMapa r={r} c={c} marcacao={marcacao} compacto />
            </span>
            <span className="absolute top-1 right-1">
              <BotaoFavorito ativo nome={c.nome} onClick={() => onFavorito(r.cargo, c.numero)} />
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

const ICONE_DO_EVENTO: Record<MudancaNaApuracao['tipo'], ReactNode> = {
  LIDERANCA: <Crown className="size-3.5" />,
  ULTRAPASSAGEM: <ArrowUp className="size-3.5" />,
  ELEITO: <Award className="size-3.5" />,
  SEGUNDO_TURNO: <Flag className="size-3.5" />,
  MARCO: <Activity className="size-3.5" />,
};

function LinhaDoTempo({ eventos, cargos }: { eventos: EventoDaApuracao[]; cargos: ResultadoDoCargo[] }) {
  return (
    <Cartao titulo="Linha do tempo" icone={<Zap className="size-4" />}>
      {eventos.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-500">
          As viradas da noite aparecem aqui: troca de liderança, ultrapassagens, eleitos e marcos da apuração.
        </p>
      ) : (
        <ol className="relative max-h-[26rem] space-y-3 overflow-y-auto pl-8 before:absolute before:inset-y-1 before:left-[0.875rem] before:w-px before:bg-line">
          {eventos.map((e, i) => {
            const r = cargos.find((c) => c.cargo === e.cargo);
            const c = e.numero ? r?.candidatos.find((x) => x.numero === e.numero) : undefined;
            return (
              <li key={`${e.em}-${i}`} className="relative animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <span
                  className={cn(
                    'absolute top-1 -left-[1.625rem] flex size-5 items-center justify-center rounded-full ring-4 ring-surface',
                    e.tipo === 'ELEITO' ? 'bg-gold-500 text-navy-900' : e.tipo === 'MARCO' ? 'bg-ink-100 text-ink-700' : 'bg-brand-700 text-white',
                  )}
                >
                  {ICONE_DO_EVENTO[e.tipo]}
                </span>
                <div className="flex items-center gap-2">
                  {c && r ? <FotoDoCandidato cargo={r.cargo} sqcand={c.sqcand} nome={c.nome} tamanho="sm" /> : null}
                  <div className="min-w-0">
                    <p className="text-xs text-ink-900">{e.texto}</p>
                    <p className="text-[0.625rem] text-ink-500 tabular-nums">
                      {e.horaTse ?? new Date(e.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Cartao>
  );
}
