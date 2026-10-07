'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Bookmark, BookmarkCheck, BookmarkX, Check, CheckCheck, ChevronDown, Filter, Grid3x3, MapPin, Search, Swords, Users, X } from 'lucide-react';
import type { MapOverviewPayload } from '@/lib/domain/map-pin';
import { lideresNoRaioX } from '@/lib/domain/confronto';
import { FotoDoCandidato } from '@/components/apuracao/FotoDoCandidato';
import {
  campanhaDoRecorte,
  escolaDaSala,
  montarDuelo,
  parteDaEsquerda,
  placarDosLideres,
  porZona,
  resumoDoDuelo,
  votacaoDoRecorte,
  votosNaEscola,
  referenciasDosLideres,
  type EscolaNaSala,
  type OpcaoDeReferencia,
  type PlacarDoLider,
  type ZonaNoDuelo,
} from '@/lib/domain/sala-de-confronto';
import { filtrarCandidatos, fotoDoCandidatoUrl, rotuloDoCandidato, type CandidatoDaVotacao, type VotacaoNoMapa } from '@/lib/domain/votacao-tse';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { cn } from '@/lib/utils/cn';
import { formatNumber, initials } from '@/lib/utils/text';
import { BotaoVoltar } from '@/components/ui/BotaoVoltar';
import { SeloDaReferencia } from '@/components/members/TagDaReferencia';
import { corDoCandidato } from '@/components/dashboard/votacao/cores';
import type { CandidatoNoRaioX } from '@/components/dashboard/votacao/RaioXDaEscola';
import {
  AZUL,
  CaboDeGuerra,
  Centro,
  ChamadaDoAdversario,
  Lado,
  Leituras,
  Ranking,
  SecaoPorSecao,
  Seletor,
  VERMELHO,
  type Filtro,
  type Lutador,
} from './Arena';
import { NeoDoConfronto } from './NeoDoConfronto';

/**
 * O confronto de UMA escola da sala, ao vivo.
 *
 * Nada aqui e foto do passado: a gente do time sai do mapa de agora (no
 * recorte do envio — Lider, referencia, secao), e os votos saem da votacao
 * de agora, candidato a candidato. A apuracao anda, o duelo anda junto.
 *
 * Do lado esquerdo, os candidatos que estavam no mapa no envio; do direito,
 * os adversarios chamados aqui (guardados na sala: quem abrir depois ve o
 * mesmo duelo). Embaixo do placar, as tres lentes que importam: ZONAS, o
 * PLACAR DE CADA LIDER (marque um ou mais) e SECAO POR SECAO, com quem
 * cadastrou cada uma.
 */
export function ConfrontoDaEscola({
  registro,
  onVoltar,
  onMudou,
}: {
  registro: EscolaNaSala;
  onVoltar: () => void;
  /** A escola mudou na sala (adversarios, Lideres, placar): a lista se atualiza. */
  onMudou: (escola: EscolaNaSala) => void;
}) {
  const mapaLoader = useCallback(
    () => api<MapOverviewPayload>(registro.scope ? `/api/mapa?clientId=${encodeURIComponent(registro.scope)}` : '/api/mapa'),
    [registro.scope],
  );
  const mapa = useRepositoryQuery<MapOverviewPayload>(mapaLoader);
  const listaLoader = useCallback(() => api<{ candidatos: CandidatoDaVotacao[] }>('/api/votacao'), []);
  const lista = useRepositoryQuery(listaLoader);

  const [adversarios, setAdversarios] = useState<CandidatoDaVotacao[]>(registro.direita);
  const [selecionados, setSelecionados] = useState<ReadonlySet<string>>(() => new Set(registro.lideres.map((l) => l.id)));
  const [votacoes, setVotacoes] = useState<Record<string, VotacaoNoMapa | 'erro'>>({});
  /** A gaveta de candidatos aberta: para o seu lado ou para o lado dos adversarios. */
  const [escolhendo, setEscolhendo] = useState<'esquerda' | 'direita' | null>(null);
  /** O seu lado tambem e editavel aqui: entra e sai quem voce quiser. */
  const [ladoEsquerdo, setLadoEsquerdo] = useState<CandidatoDaVotacao[]>(registro.esquerda);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [zona, setZona] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Os votos de cada candidato (dos dois lados), buscados uma vez cada.
  const pedidos = useRef(new Set<string>());
  const buscar = useCallback((id: string) => {
    if (pedidos.current.has(id)) return;
    pedidos.current.add(id);
    api<VotacaoNoMapa>(`/api/votacao/${encodeURIComponent(id)}`)
      .then((v) => setVotacoes((atual) => ({ ...atual, [id]: v })))
      .catch(() => {
        pedidos.current.delete(id);
        setVotacoes((atual) => ({ ...atual, [id]: 'erro' }));
      });
  }, []);
  useEffect(() => {
    for (const c of [...ladoEsquerdo, ...adversarios]) buscar(c.id);
  }, [ladoEsquerdo, adversarios, buscar]);

  /** Grava na sala e avisa a lista; se nao der, volta atras e diz por que. */
  const gravar = useCallback(
    (mudanca: { esquerda?: CandidatoDaVotacao[]; direita?: CandidatoDaVotacao[]; lideres?: { id: string; nome: string }[] }, desfazer: () => void) => {
      api<{ escola: EscolaNaSala }>(`/api/confrontos/${registro.id}`, { method: 'PATCH', body: mudanca })
        .then(({ escola }) => onMudou(escola))
        .catch((e) => {
          desfazer();
          setAviso(e instanceof Error ? e.message : 'Não foi possível salvar na sala.');
        });
    },
    [registro.id, onMudou],
  );

  const idsDaEsquerda = useMemo(() => new Set<string | undefined>(ladoEsquerdo.map((c) => c.id)), [ladoEsquerdo]);
  function adicionar(c: CandidatoDaVotacao) {
    if (idsDaEsquerda.has(c.id) || adversarios.some((a) => a.id === c.id)) return;
    const antes = adversarios;
    const depois = [...antes, c];
    setAdversarios(depois);
    if (votacoes[c.id] === 'erro') {
      setVotacoes((atual) => {
        const novo = { ...atual };
        delete novo[c.id];
        return novo;
      });
    }
    buscar(c.id);
    gravar({ direita: depois }, () => setAdversarios(antes));
  }
  function adicionarNoSeuLado(c: CandidatoDaVotacao) {
    if (ladoEsquerdo.some((a) => a.id === c.id)) return;
    if (adversarios.some((a) => a.id === c.id)) remover(c.id);
    const antes = ladoEsquerdo;
    const depois = [...antes, c];
    setLadoEsquerdo(depois);
    if (votacoes[c.id] === 'erro') {
      setVotacoes((atual) => {
        const novo = { ...atual };
        delete novo[c.id];
        return novo;
      });
    }
    buscar(c.id);
    gravar({ esquerda: depois }, () => setLadoEsquerdo(antes));
  }
  function tirarDoSeuLado(id: string) {
    if (ladoEsquerdo.length <= 1) return;
    const antes = ladoEsquerdo;
    const depois = antes.filter((a) => a.id !== id);
    setLadoEsquerdo(depois);
    gravar({ esquerda: depois }, () => setLadoEsquerdo(antes));
  }
  function remover(id: string) {
    const antes = adversarios;
    const depois = antes.filter((a) => a.id !== id);
    setAdversarios(depois);
    gravar({ direita: depois }, () => setAdversarios(antes));
  }

  // ---- A conta, toda pura (`sala-de-confronto.ts`).
  /**
   * Filtro por referencia, aqui dentro: so a gente dos Lideres das
   * referencias escolhidas (vazio: o recorte do envio). A estimativa, os
   * Lideres, as zonas e as secoes passam a contar so essa gente.
   */
  const [referencias, setReferencias] = useState<string[]>([]);
  const recorteDoEnvio = registro.recorte;
  const recorte = useMemo(
    () => (referencias.length ? { ...recorteDoEnvio, references: referencias } : recorteDoEnvio),
    [recorteDoEnvio, referencias],
  );
  const campanhaDoEnvio = useMemo(() => campanhaDoRecorte(mapa.data, recorteDoEnvio), [mapa.data, recorteDoEnvio]);
  const campanha = useMemo(
    () => (referencias.length ? campanhaDoRecorte(mapa.data, recorte) : campanhaDoEnvio),
    [referencias.length, mapa.data, recorte, campanhaDoEnvio],
  );
  const pinsDe = useCallback(
    (id: string) => {
      const v = votacoes[id];
      return v && v !== 'erro' ? votacaoDoRecorte([...v.noMapa, ...v.foraDoMapa], recorte) : null;
    },
    [votacoes, recorte],
  );
  const esquerdaPronta = ladoEsquerdo.every((c) => votacoes[c.id] !== undefined);
  const escola = useMemo(() => {
    if (!mapa.data || !esquerdaPronta) return null;
    const tse = ladoEsquerdo.map((c) => pinsDe(c.id)).filter((p): p is NonNullable<typeof p> => p !== null);
    return escolaDaSala(campanha, tse, { chave: registro.chave, pinos: registro.pinos });
  }, [mapa.data, esquerdaPronta, ladoEsquerdo, registro.chave, registro.pinos, campanha, pinsDe]);
  /** Sem a escola no recorte de hoje, o duelo ainda acontece pelo local do TSE. */
  const base = useMemo(
    () => escola ?? { chave: registro.chave, secoes: [], estimativa: 0, pinosDaCampanha: registro.pinos },
    [escola, registro.chave, registro.pinos],
  );
  const lideres = useMemo(
    () => (escola ? lideresNoRaioX(escola, campanha, mapa.data?.referencias).lideres : []),
    [escola, campanha, mapa.data?.referencias],
  );
  /** As referencias dos Lideres desta escola (no recorte do envio): as opcoes do filtro. */
  const opcoesDeReferencia = useMemo(() => {
    if (!mapa.data || !esquerdaPronta) return [];
    const tse = ladoEsquerdo.map((c) => pinsDe(c.id)).filter((p): p is NonNullable<typeof p> => p !== null);
    const daEscola = escolaDaSala(campanhaDoEnvio, tse, { chave: registro.chave, pinos: registro.pinos });
    return daEscola ? referenciasDosLideres(lideresNoRaioX(daEscola, campanhaDoEnvio, mapa.data.referencias).lideres) : [];
  }, [mapa.data, esquerdaPronta, ladoEsquerdo, registro.chave, registro.pinos, campanhaDoEnvio, pinsDe]);
  const lideresMarcados = useMemo(() => lideres.filter((l) => selecionados.has(l.id)), [lideres, selecionados]);

  const esquerda = useMemo(
    (): CandidatoNoRaioX[] =>
      ladoEsquerdo.map((c, i) => ({ id: c.id, nome: c.nome, rotulo: rotuloDoCandidato(c), cor: corDoCandidato(i), cargo: c.cargoCodigo, foto: fotoDoCandidatoUrl(c) })),
    [ladoEsquerdo],
  );
  const direita = useMemo(
    (): Lutador[] =>
      adversarios.map((c, i) => ({
        id: c.id,
        nome: c.nome,
        rotulo: rotuloDoCandidato(c),
        cor: corDoCandidato(ladoEsquerdo.length + i),
        cargo: c.cargoCodigo,
        foto: fotoDoCandidatoUrl(c),
        carregando: votacoes[c.id] === undefined,
        erro: votacoes[c.id] === 'erro',
      })),
    [adversarios, votacoes, ladoEsquerdo.length],
  );
  const prontos = direita.filter((c) => !c.carregando && !c.erro);

  const duelo = useMemo(() => {
    const votosDe = (id: string) => {
      const pins = pinsDe(id);
      return pins ? votosNaEscola(base, pins) : new Map();
    };
    const dir = adversarios.filter((a) => pinsDe(a.id) !== null).map((a) => votosDe(a.id));
    return montarDuelo(base, ladoEsquerdo.map((c) => votosDe(c.id)), dir, lideresMarcados);
  }, [base, ladoEsquerdo, adversarios, pinsDe, lideresMarcados]);
  const zonas = useMemo(() => porZona(duelo.secoes), [duelo.secoes]);
  const placares = useMemo(() => placarDosLideres(duelo.secoes, lideres, ladoEsquerdo.length), [duelo.secoes, lideres, ladoEsquerdo.length]);
  const temAdversario = prontos.length > 0;
  const pronto = Boolean(mapa.data) && esquerdaPronta;

  // O placar desta leitura volta para a lista (so quando muda: sem laco).
  const ultimo = useRef('');
  useEffect(() => {
    // Com o filtro de referencia ligado, o placar e de um recorte so: nao vai para a lista.
    if (!pronto || referencias.length || direita.some((c) => c.carregando)) return;
    const resumo = resumoDoDuelo(duelo, base, lideres.length);
    const chave = JSON.stringify(resumo);
    const antes = registro.resumo;
    const igual =
      antes.esquerda === resumo.esquerda &&
      antes.direita === resumo.direita &&
      antes.estimativa === resumo.estimativa &&
      antes.secoes === resumo.secoes &&
      antes.lideres === resumo.lideres &&
      JSON.stringify(antes.vitorias ?? null) === JSON.stringify(resumo.vitorias);
    if (igual || ultimo.current === chave) return;
    ultimo.current = chave;
    api<{ escola: EscolaNaSala }>(`/api/confrontos/${registro.id}`, { method: 'PATCH', body: { resumo } })
      .then(({ escola: salva }) => onMudou(salva))
      .catch(() => undefined);
  }, [pronto, referencias.length, direita, duelo, base, lideres.length, registro.id, registro.resumo, onMudou]);

  function alternarLider(id: string) {
    const antes = selecionados;
    const depois = new Set(antes);
    if (depois.has(id)) depois.delete(id);
    else depois.add(id);
    setSelecionados(depois);
    gravar({ lideres: lideres.filter((l) => depois.has(l.id)).map((l) => ({ id: l.id, nome: l.nome })) }, () => setSelecionados(antes));
  }
  function marcarTodos(todos: boolean) {
    const antes = selecionados;
    const depois = new Set(todos ? lideres.map((l) => l.id) : []);
    setSelecionados(depois);
    gravar({ lideres: todos ? lideres.map((l) => ({ id: l.id, nome: l.nome })) : [] }, () => setSelecionados(antes));
  }

  // Esc fecha a gaveta dos adversarios; sem ela, volta para a lista.
  const gaveta = useRef(false);
  useEffect(() => {
    gaveta.current = escolhendo !== null;
  }, [escolhendo]);
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (gaveta.current) setEscolhendo(null);
      else onVoltar();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [onVoltar]);

  const todosDaLista = useMemo(() => lista.data?.candidatos ?? [], [lista.data]);
  const baseDaEleicao = useMemo(() => todosDaLista.find((c) => idsDaEsquerda.has(c.id)) ?? ladoEsquerdo[0] ?? null, [todosDaLista, idsDaEsquerda, ladoEsquerdo]);
  const daEleicao = useMemo(
    () => (baseDaEleicao ? todosDaLista.filter((c) => c.ano === baseDaEleicao.ano && c.uf === baseDaEleicao.uf) : todosDaLista),
    [todosDaLista, baseDaEleicao],
  );
  const sugestoes = useMemo(() => {
    if (!baseDaEleicao) return [];
    return filtrarCandidatos(daEleicao, { turno: baseDaEleicao.turno, cargoCodigo: baseDaEleicao.cargoCodigo, busca: '' })
      .filter((c) => !idsDaEsquerda.has(c.id) && !adversarios.some((a) => a.id === c.id))
      .slice(0, 4);
  }, [baseDaEleicao, daEleicao, idsDaEsquerda, adversarios]);

  const onde = [registro.endereco, [registro.cidade, registro.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ');
  const zonasDoCabecalho = zonas.map((z) => z.zona).filter(Boolean);

  return (
    <div className="space-y-4">
      {/* CABECALHO: a escola, o time, o recorte e os tres numeros (zonas, secoes, Lideres). */}
      <header className="relative animate-fade-up overflow-hidden rounded-card bg-gradient-to-r from-[#0d1f4d] via-navy-900 to-[#4a0d16] px-4 py-4 text-white shadow-overlay sm:px-6 sm:py-5">
        <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0" />
        <span aria-hidden="true" className="cmd-orbe pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-[#2a78d6]/30 blur-3xl" />
        <span aria-hidden="true" className="cmd-orbe pointer-events-none absolute -right-16 -bottom-28 size-80 rounded-full bg-[#e5484d]/30 blur-3xl" />
        <div className="relative flex flex-wrap items-start gap-4">
          <BotaoVoltar onClick={onVoltar} rotulo="Escolas da sala" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-2.5 py-1 text-[0.6875rem] font-bold tracking-[0.16em] uppercase ring-1 ring-white/15">
                <Swords aria-hidden="true" className="size-3.5 text-gold-400" /> Confronto
              </p>
              {registro.scopeName ? (
                <span className="rounded-pill bg-white/10 px-2.5 py-1 text-[0.6875rem] font-semibold text-white/80 ring-1 ring-white/15">{registro.scopeName}</span>
              ) : null}
              {recorte.rotulo ? (
                <span className="inline-flex items-center gap-1 rounded-pill bg-gold-400/15 px-2.5 py-1 text-[0.6875rem] font-semibold text-gold-400 ring-1 ring-gold-400/40">
                  <Bookmark aria-hidden="true" className="size-3" /> {recorte.rotulo}
                </span>
              ) : null}
            </div>
            <h1 className="mt-2 text-xl leading-tight font-bold wrap-break-word sm:text-2xl">{registro.titulo}</h1>
            {onde ? (
              <p className="mt-0.5 flex items-start gap-1.5 text-sm text-white/70">
                <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span className="wrap-break-word">{onde}</span>
              </p>
            ) : null}
          </div>
          <dl className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:w-auto">
            {[
              { rotulo: zonasDoCabecalho.length === 1 ? 'Zona' : 'Zonas', valor: zonasDoCabecalho.length ? zonasDoCabecalho.join(', ') : '—' },
              { rotulo: 'Seções', valor: formatNumber(duelo.secoes.length) },
              { rotulo: 'Líderes', valor: lideresMarcados.length ? `${lideresMarcados.length}/${lideres.length}` : formatNumber(lideres.length) },
              { rotulo: 'Estimativa', valor: formatNumber(base.estimativa) },
            ].map((x) => (
              <div key={x.rotulo} className="rounded-control bg-white/[0.07] px-3 py-2 ring-1 ring-white/10 lg:min-w-[6.5rem]">
                <dt className="text-[0.625rem] font-semibold tracking-wider text-white/55 uppercase">{x.rotulo}</dt>
                <dd className="mt-0.5 text-lg leading-tight font-bold wrap-break-word tabular-nums">{x.valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {aviso ? (
        <p role="alert" className="flex items-center justify-between gap-2 rounded-control border border-danger-600/30 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {aviso}
          <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso" className="rounded-full p-1 hover:bg-danger-600/10">
            <X aria-hidden="true" className="size-4" />
          </button>
        </p>
      ) : null}

      {!pronto ? (
        <PreparandoArena erro={Boolean(mapa.error)} onTentar={mapa.reload} />
      ) : (
        <>
          {!escola ? (
            <p className="rounded-control border-l-4 border-gold-500 bg-gold-50 px-3 py-2 text-sm text-ink-900">
              Esta escola não tem mais gente do time no recorte do envio{recorte.rotulo ? ` (${recorte.rotulo})` : ''}. O duelo segue com os votos do TSE.
            </p>
          ) : null}

          <FiltroDeReferencia
            opcoes={opcoesDeReferencia}
            escolhidas={referencias}
            onEscolher={(chave) =>
              setReferencias((atual) => (atual.includes(chave) ? atual.filter((r) => r !== chave) : [...atual, chave]))
            }
            onLimpar={() => setReferencias([])}
          />

          {/* A ARENA */}
          <section
            aria-label="Placar do confronto"
            className="animate-fade-up overflow-hidden rounded-card bg-gradient-to-br from-navy-900 via-navy-800 to-[#2b0f1c] p-4 text-white shadow-overlay sm:p-5"
          >
            <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <Lado
                titulo="Seu lado"
                subtitulo="Os seus candidatos: adicione ou tire quem quiser"
                cor={AZUL}
                lutadores={esquerda}
                votos={duelo.esquerda}
                total={duelo.totalEsquerda}
                totalDaEscola={duelo.totalEsquerda + duelo.totalDireita}
                onRemover={ladoEsquerdo.length > 1 ? tirarDoSeuLado : undefined}
                onAdicionar={() => setEscolhendo('esquerda')}
                rotuloDeAdicionar="Adicionar candidato ao seu lado"
              />
              <Centro esquerda={duelo.totalEsquerda} direita={duelo.totalDireita} vitorias={duelo.vitorias} temAdversario={temAdversario} />
              <Lado
                titulo="Adversários"
                subtitulo="Quem vai para o confronto"
                cor={VERMELHO}
                lutadores={direita}
                votos={direita.map((c) => {
                  const i = prontos.findIndex((p) => p.id === c.id);
                  return i >= 0 ? duelo.direita[i] : 0;
                })}
                total={duelo.totalDireita}
                totalDaEscola={duelo.totalEsquerda + duelo.totalDireita}
                direita
                onRemover={remover}
                onAdicionar={() => setEscolhendo('direita')}
                vazio={
                  <ChamadaDoAdversario
                    sugestoes={sugestoes}
                    carregando={!lista.data && !lista.error}
                    onEscolher={adicionar}
                    onAbrir={() => setEscolhendo('direita')}
                  />
                }
              />
            </div>
            <CaboDeGuerra parte={parteDaEsquerda(duelo)} ativo={temAdversario} />
          </section>

          {temAdversario ? <Leituras duelo={duelo} lideres={lideresMarcados} /> : null}

          <PainelDasZonas zonas={zonas} zona={zona} onZona={setZona} temAdversario={temAdversario} esquerda={esquerda} direita={prontos} />

          <SecaoPorSecao
            secoes={duelo.secoes}
            esquerda={esquerda}
            direita={prontos}
            filtro={filtro}
            onFiltro={setFiltro}
            comLideres={lideresMarcados.length > 0}
            lideres={lideres}
            selecionados={selecionados}
            zona={zona}
            onZona={setZona}
            semAdversario={!temAdversario}
          />

          {temAdversario ? <Ranking esquerda={esquerda} votosEsquerda={duelo.esquerda} direita={prontos} votosDireita={duelo.direita} /> : null}

          {/* O NEO: o chat flutuante, que ja chega lendo a escola. */}
          <NeoDoConfronto titulo={registro.titulo} duelo={duelo} esquerda={esquerda} direita={prontos} lideres={lideres} />

          {/* Por ultimo, e fechado: abre no botao. */}
          <PlacarDosLideres
            placares={placares}
            selecionados={selecionados}
            onAlternar={alternarLider}
            onTodos={marcarTodos}
            temAdversario={temAdversario}
          />
        </>
      )}

      {escolhendo ? (
        <Seletor
          lista={daEleicao}
          base={baseDaEleicao}
          carregando={!lista.data && !lista.error}
          erro={Boolean(lista.error)}
          naEsquerda={escolhendo === 'esquerda' ? new Set(adversarios.map((a) => a.id)) : idsDaEsquerda}
          naDireita={escolhendo === 'esquerda' ? new Set(ladoEsquerdo.map((a) => a.id)) : new Set(adversarios.map((a) => a.id))}
          onAdicionar={escolhendo === 'esquerda' ? adicionarNoSeuLado : adicionar}
          onRemover={escolhendo === 'esquerda' ? tirarDoSeuLado : remover}
          onClose={() => setEscolhendo(null)}
        />
      ) : null}
    </div>
  );
}

/** Enquanto o mapa e os votos chegam: a arena se montando, e nao um vazio. */
function PreparandoArena({ erro, onTentar }: { erro: boolean; onTentar: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card bg-gradient-to-br from-navy-900 via-navy-800 to-[#2b0f1c] px-4 py-16 text-center text-white">
      {erro ? (
        <>
          <p className="text-base font-bold">Não foi possível carregar o mapa do time.</p>
          <button type="button" onClick={onTentar} className="min-h-10 rounded-pill bg-white px-4 text-sm font-bold text-navy-900">
            Tentar de novo
          </button>
        </>
      ) : (
        <>
          <span className="relative flex size-20 items-center justify-center">
            <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-gold-400/25" />
            <span className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-gold-400 to-gold-600 text-navy-900">
              <Swords aria-hidden="true" className="size-9 animate-pulse" />
            </span>
          </span>
          <p className="text-base font-bold">Preparando a arena…</p>
          <p className="text-sm text-white/60">a gente do time e os votos de cada candidato, seção por seção</p>
        </>
      )}
    </div>
  );
}

/**
 * Zona a zona: cada zona num cartao, com o placar dela, o cabo de guerra e
 * um quadradinho por secao (azul venceu, vermelho perdeu, cinza empate).
 * Tocar a zona filtra a lista de secoes logo abaixo.
 */
function PainelDasZonas({
  zonas,
  zona,
  onZona,
  temAdversario,
  esquerda,
  direita,
}: {
  zonas: ZonaNoDuelo[];
  zona: string | null;
  onZona: (zona: string | null) => void;
  temAdversario: boolean;
  /** Os candidatos de cada lado (na ordem dos votos das secoes): a foto e os votos de cada um na zona. */
  esquerda: CandidatoNoRaioX[];
  direita: CandidatoNoRaioX[];
}) {
  if (zonas.length === 0) return null;
  return (
    <section aria-label="Zona a zona" className="rounded-card border border-line bg-surface p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <span className="flex size-7 items-center justify-center rounded-lg bg-navy-900 text-gold-400">
            <MapPin aria-hidden="true" className="size-4" />
          </span>
          Zona a zona
        </h2>
        <p className="text-xs text-ink-500">Toque numa zona para ver só as seções dela</p>
      </header>
      <ul className={cn('grid gap-3', zonas.length > 1 && 'sm:grid-cols-2', zonas.length > 2 && 'xl:grid-cols-3')}>
        {zonas.map((z, i) => {
          const chave = z.zona ?? '?';
          const ativa = zona === chave;
          const total = z.totalEsquerda + z.totalDireita;
          const parte = total > 0 ? (z.totalEsquerda / total) * 100 : 50;
          return (
            <li key={chave} className="cmd-cascata" style={{ '--cmd-atraso': `${i * 70}ms` } as CSSProperties}>
              <button
                type="button"
                aria-pressed={ativa}
                onClick={() => onZona(ativa ? null : chave)}
                className={cn(
                  'w-full rounded-card border p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-card',
                  ativa ? 'border-gold-500 bg-gold-50 ring-2 ring-gold-400/50' : 'border-line bg-surface',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[0.625rem] font-semibold tracking-wider text-ink-500 uppercase">Zona</p>
                    <p className="text-3xl leading-none font-black text-navy-900 tabular-nums">{z.zona ?? '?'}</p>
                  </div>
                  <div className="text-right text-xs text-ink-500">
                    <p>
                      <b className="text-ink-900 tabular-nums">{z.secoes.length}</b> {z.secoes.length === 1 ? 'seção' : 'seções'}
                    </p>
                    <p>
                      <b className="text-ink-900 tabular-nums">{formatNumber(z.estimativa)}</b> do time
                      {z.dosLideres ? (
                        <>
                          {' · '}
                          <b className="text-gold-700 tabular-nums">★ {formatNumber(z.dosLideres)}</b>
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2 text-xl font-black tabular-nums">
                  <span style={{ color: AZUL }}>{formatNumber(z.totalEsquerda)}</span>
                  {temAdversario ? (
                    <>
                      <span className="text-sm font-bold text-ink-400">×</span>
                      <span style={{ color: VERMELHO }}>{formatNumber(z.totalDireita)}</span>
                      <span className="ml-auto text-xs font-semibold text-ink-500">
                        seções <b style={{ color: AZUL }}>{z.vitorias.esquerda}</b> × <b style={{ color: VERMELHO }}>{z.vitorias.direita}</b>
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-semibold text-ink-500">votos do seu lado</span>
                  )}
                </div>
                {temAdversario ? (
                  <div className="mt-2 flex h-2 overflow-hidden rounded-pill bg-ink-100">
                    <span className="h-full transition-[width] duration-1000 ease-out" style={{ width: `${parte}%`, background: AZUL }} />
                    <span className="h-full flex-1" style={{ background: total > 0 ? VERMELHO : undefined }} />
                  </div>
                ) : null}
                {/* Cada candidato na zona: a foto, o nome e os votos dele. */}
                <div className={cn('mt-3 grid gap-2', temAdversario && 'sm:grid-cols-2')}>
                  {[
                    { lado: 'esquerda' as const, candidatos: esquerda, votos: esquerda.map((_, k) => z.secoes.reduce((t, s) => t + (s.esquerda[k] ?? 0), 0)) },
                    ...(temAdversario
                      ? [{ lado: 'direita' as const, candidatos: direita, votos: direita.map((_, k) => z.secoes.reduce((t, s) => t + (s.direita[k] ?? 0), 0)) }]
                      : []),
                  ].map((grupo) => (
                    <ul
                      key={grupo.lado}
                      className="space-y-1.5 rounded-control p-2"
                      style={{ background: grupo.lado === 'esquerda' ? `${AZUL}0f` : `${VERMELHO}0f`, boxShadow: `inset 3px 0 0 ${grupo.lado === 'esquerda' ? AZUL : VERMELHO}` }}
                    >
                      {grupo.candidatos.map((c, k) => (
                        <li key={c.id ?? c.rotulo} className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-surface" style={{ '--tw-ring-color': c.cor } as CSSProperties}>
                            <FotoDoCandidato cargo={c.cargo} sqcand={null} src={c.foto} nome={c.nome} tamanho="sm" className="ring-0" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-900">{c.nome}</span>
                          <span className="text-base font-black tabular-nums" style={{ color: c.cor }}>
                            {formatNumber(grupo.votos[k] ?? 0)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ))}
                </div>
                {/* Um quadradinho por secao. */}
                <div className="mt-3 flex flex-wrap gap-1" aria-hidden="true">
                  {z.secoes.map((s) => (
                    <span
                      key={s.chave}
                      title={`Seção ${s.secao ?? '?'}: ${formatNumber(s.totalEsquerda)} × ${formatNumber(s.totalDireita)}`}
                      className={cn(
                        'flex h-5 min-w-7 items-center justify-center rounded px-1 text-[0.5625rem] font-bold tabular-nums',
                        !temAdversario
                          ? 'bg-navy-900 text-white'
                          : s.vencedor === 'ESQUERDA'
                            ? 'bg-[#2a78d6] text-white'
                            : s.vencedor === 'DIREITA'
                              ? 'bg-[#e5484d] text-white'
                              : 'bg-ink-200 text-ink-700',
                        s.dosLideres > 0 && 'ring-2 ring-gold-400 ring-offset-1',
                      )}
                    >
                      {s.secao ?? '?'}
                    </span>
                  ))}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * O placar de cada Lider: so nas secoes onde a gente dele vota, o seu lado
 * contra os adversarios, quantas secoes ele levou e quantos votos o seu lado
 * teve para cada pessoa que ele cadastrou. Marque um ou mais: a selecao fica
 * guardada na sala e acende a gente deles nas zonas e nas secoes.
 */
function PlacarDosLideres({
  placares,
  selecionados,
  onAlternar,
  onTodos,
  temAdversario,
}: {
  placares: PlacarDoLider[];
  selecionados: ReadonlySet<string>;
  onAlternar: (id: string) => void;
  onTodos: (todos: boolean) => void;
  temAdversario: boolean;
}) {
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState(false);
  const semAcento = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  const visiveis = placares.filter((p) => !busca || semAcento(p.lider.nome).includes(semAcento(busca)));
  const maior = Math.max(1, ...placares.map((p) => p.pessoas));
  const marcados = placares.filter((p) => selecionados.has(p.lider.id)).length;

  return (
    <section aria-label="Placar dos líderes" className="overflow-hidden rounded-card border border-line bg-surface">
      <header className={cn('flex flex-wrap items-center justify-between gap-3 px-4 py-3', aberta && 'border-b border-line')}>
        <button type="button" onClick={() => setAberta((a) => !a)} aria-expanded={aberta} className="flex min-w-0 items-center gap-2 text-left">
          <span className="flex size-7 items-center justify-center rounded-lg bg-navy-900 text-gold-400">
            <Users aria-hidden="true" className="size-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-ink-900">Placar dos líderes</span>
            <span className="block text-xs text-ink-500">
              {formatNumber(placares.length)} {placares.length === 1 ? 'líder' : 'líderes'} nesta escola
              {marcados ? (
                <>
                  {' · '}
                  <b className="text-gold-700">{marcados} marcados</b>
                </>
              ) : ' · marque um ou mais'}
            </span>
          </span>
        </button>
        {placares.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAberta((a) => !a)}
              aria-expanded={aberta}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-pill px-3.5 text-xs font-bold transition-colors',
                aberta ? 'border border-line text-ink-700 hover:bg-ink-50' : 'bg-navy-900 text-gold-400 hover:bg-navy-800',
              )}
            >
              {aberta ? 'Fechar o placar' : 'Abrir o placar dos líderes'}
              <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform duration-300', aberta && 'rotate-180')} />
            </button>
            {aberta && placares.length > 6 ? (
              <label className="relative flex items-center">
                <span className="sr-only">Buscar líder</span>
                <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 size-3.5 text-ink-400" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar líder"
                  className="min-h-8 w-40 rounded-pill border border-line bg-surface pr-3 pl-8 text-xs focus:border-accent-600 focus:outline-none"
                />
              </label>
            ) : null}
            {aberta && marcados < placares.length ? (
              <button
                type="button"
                onClick={() => onTodos(true)}
                className="inline-flex min-h-8 items-center gap-1 rounded-pill border border-line px-2.5 text-[0.6875rem] font-semibold text-ink-700 hover:border-gold-500 hover:bg-gold-50"
              >
                <CheckCheck aria-hidden="true" className="size-3.5" /> Todos
              </button>
            ) : null}
            {marcados ? (
              <button
                type="button"
                onClick={() => onTodos(false)}
                className="inline-flex min-h-8 items-center gap-1 rounded-pill border border-line px-2.5 text-[0.6875rem] font-semibold text-ink-700 hover:bg-ink-50"
              >
                <X aria-hidden="true" className="size-3.5" /> Limpar
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {!aberta ? null : placares.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-500">Nenhum líder do time cadastrou gente que vota nesta escola.</p>
      ) : (
        <ol className="grid divide-y divide-line lg:grid-cols-2 lg:divide-y-0">
          {visiveis.map((p, i) => {
            const ativo = selecionados.has(p.lider.id);
            const total = p.esquerda + p.direita;
            const parte = total > 0 ? (p.esquerda / total) * 100 : 50;
            return (
              <li key={p.lider.id} className="cmd-cascata border-line lg:border-b lg:odd:border-r" style={{ '--cmd-atraso': `${Math.min(i, 12) * 35}ms` } as CSSProperties}>
                <button
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => onAlternar(p.lider.id)}
                  className={cn(
                    'grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 text-left transition-colors',
                    ativo ? 'bg-gold-50 shadow-[inset_3px_0_0_var(--color-gold-500)]' : 'hover:bg-ink-50',
                  )}
                >
                  <span aria-hidden="true" className="relative">
                    <span
                      className={cn(
                        'flex size-10 items-center justify-center rounded-full text-xs font-bold',
                        ativo ? 'bg-gold-500 text-navy-900' : 'bg-navy-900 text-gold-400',
                      )}
                    >
                      {initials(p.lider.nome)}
                    </span>
                    <span
                      className={cn(
                        'absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-[5px] border-2 border-surface',
                        ativo ? 'bg-success-600 text-white' : 'bg-ink-200 text-transparent',
                      )}
                    >
                      <Check className="size-2.5" strokeWidth={4} />
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold wrap-break-word text-ink-900">{p.lider.nome}</span>
                      <SeloDaReferencia referencia={p.lider.referencia} compacto />
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-500">
                      cadastrou <b className="text-ink-900 tabular-nums">{formatNumber(p.lider.cadastrados)}</b>
                      {p.secoes.length ? ` em ${p.secoes.length} ${p.secoes.length === 1 ? 'seção' : 'seções'}` : ''}
                      {p.lider.cadastrados > p.pessoas ? ` · ${formatNumber(p.lider.cadastrados - p.pessoas)} sem seção` : ''}
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-pill bg-ink-100">
                      <span
                        className={cn('block h-full rounded-pill transition-[width] duration-700', ativo ? 'bg-gold-500' : 'bg-navy-800')}
                        style={{ width: `${Math.max(4, (p.pessoas / maior) * 100)}%` }}
                      />
                    </span>
                    {/* As secoes dele: a gente dele ali e quem levou a secao. */}
                    <span className="mt-2 flex flex-wrap gap-1">
                      {p.secoes.map(({ secao, pessoas }) => (
                        <span
                          key={secao.chave}
                          title={`Seção ${secao.secao ?? '?'} (zona ${secao.zona ?? '?'}): ${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'} dele · ${formatNumber(secao.totalEsquerda)} × ${formatNumber(secao.totalDireita)}`}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-pill border px-1.5 py-px text-[0.625rem] font-semibold tabular-nums',
                            !temAdversario
                              ? 'border-line bg-ink-50 text-ink-700'
                              : secao.vencedor === 'ESQUERDA'
                                ? 'border-[#2a78d6]/40 bg-[#2a78d6]/10 text-[#1d4f9a]'
                                : secao.vencedor === 'DIREITA'
                                  ? 'border-[#e5484d]/40 bg-[#e5484d]/10 text-[#a3242a]'
                                  : 'border-line bg-ink-50 text-ink-700',
                          )}
                        >
                          <Grid3x3 aria-hidden="true" className="size-2.5" />
                          {secao.secao ?? '?'}
                          <span className="rounded-pill bg-navy-900 px-1 text-[0.5625rem] text-white">{pessoas}</span>
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="text-right">
                    {temAdversario ? (
                      <>
                        <span className="block text-lg leading-none font-black tabular-nums">
                          <span style={{ color: AZUL }}>{formatNumber(p.esquerda)}</span>
                          <span className="mx-0.5 text-xs text-ink-400">×</span>
                          <span style={{ color: VERMELHO }}>{formatNumber(p.direita)}</span>
                        </span>
                        <span className="mt-1 block h-1.5 w-24 overflow-hidden rounded-pill bg-ink-100">
                          <span className="flex h-full">
                            <span style={{ width: `${parte}%`, background: AZUL }} />
                            <span className="flex-1" style={{ background: total > 0 ? VERMELHO : undefined }} />
                          </span>
                        </span>
                        <span className="mt-1 block text-[0.6875rem] text-ink-500 tabular-nums">
                          {p.vitorias}V · {p.derrotas}D
                        </span>
                      </>
                    ) : (
                      <span className="block text-lg leading-none font-black tabular-nums" style={{ color: AZUL }}>
                        {formatNumber(p.esquerda)}
                      </span>
                    )}
                    {p.conversao !== null ? (
                      <span
                        className={cn(
                          'mt-1 inline-block rounded-pill px-1.5 py-px text-[0.625rem] font-bold tabular-nums',
                          p.conversao >= 100 ? 'bg-success-50 text-success-700' : p.conversao >= 70 ? 'bg-gold-50 text-gold-700' : 'bg-danger-50 text-danger-700',
                        )}
                        title="Votos de cada candidato do seu lado (em média) nas seções dele, para cada pessoa que ele cadastrou ali"
                      >
                        {Math.round(p.conversao)}% de conversão
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/**
 * "Filtrar por referência", dentro da escola: um botao por referencia (com
 * quantos Lideres e quanta gente ela tem aqui). Escolher uma ou mais faz a
 * sala inteira contar so a gente delas.
 */
function FiltroDeReferencia({
  opcoes,
  escolhidas,
  onEscolher,
  onLimpar,
}: {
  opcoes: OpcaoDeReferencia[];
  escolhidas: string[];
  onEscolher: (chave: string) => void;
  onLimpar: () => void;
}) {
  if (opcoes.length === 0) return null;
  const nomes = opcoes.filter((o) => escolhidas.includes(o.chave)).map((o) => o.rotulo ?? 'Sem referência');
  return (
    <section aria-label="Filtrar por referência" className="rounded-card border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <span className="flex size-7 items-center justify-center rounded-lg bg-gold-400 text-navy-900">
            <Filter aria-hidden="true" className="size-4" />
          </span>
          Filtrar por referência
          {nomes.length ? (
            <span className="text-xs font-normal text-ink-500">
              · contando só a gente de <b className="text-gold-700">{nomes.join(', ')}</b>
            </span>
          ) : (
            <span className="text-xs font-normal text-ink-500">· toque numa ou mais</span>
          )}
        </p>
        {nomes.length ? (
          <button
            type="button"
            onClick={onLimpar}
            className="inline-flex min-h-8 items-center gap-1 rounded-pill border border-line px-2.5 text-[0.6875rem] font-semibold text-ink-700 hover:bg-ink-50"
          >
            <X aria-hidden="true" className="size-3.5" /> Todas as referências
          </button>
        ) : null}
      </div>
      <div role="group" aria-label="Referências" className="mt-2.5 flex flex-wrap gap-1.5">
        {opcoes.map((o) => {
          const ativa = escolhidas.includes(o.chave);
          const sem = o.rotulo === null;
          return (
            <button
              key={o.chave}
              type="button"
              aria-pressed={ativa}
              onClick={() => onEscolher(o.chave)}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold transition-all hover:-translate-y-0.5',
                ativa
                  ? sem
                    ? 'border-danger-600 bg-danger-600 text-white shadow-card'
                    : 'border-gold-500 bg-gold-400 text-navy-900 shadow-card'
                  : sem
                    ? 'border-dashed border-danger-600/50 bg-danger-50 text-danger-700'
                    : 'border-gold-500/40 bg-gold-50 text-gold-700',
              )}
            >
              {sem ? <BookmarkX aria-hidden="true" className="size-3.5" /> : <BookmarkCheck aria-hidden="true" className="size-3.5" />}
              {o.rotulo ?? 'Sem referência'}
              <span className={cn('rounded-pill px-1.5 text-[0.625rem] font-bold tabular-nums', ativa ? 'bg-white/30' : 'bg-white')}>
                {o.lideres} {o.lideres === 1 ? 'líder' : 'líderes'} · {formatNumber(o.pessoas)}
              </span>
              {ativa ? <Check aria-hidden="true" className="size-3.5" strokeWidth={3} /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
