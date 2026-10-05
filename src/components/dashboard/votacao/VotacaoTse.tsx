'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Check, Star, Upload, Vote, X } from 'lucide-react';
import {
  cargosDaVotacao,
  chaveDoFavorito,
  filtrarCandidatos,
  fotoDoCandidatoUrl,
  type CandidatoDaVotacao,
} from '@/lib/domain/votacao-tse';
import { FotoDoCandidato } from '@/components/apuracao/FotoDoCandidato';
import { CORES_DOS_CANDIDATOS, MAXIMO_DE_CANDIDATOS } from './cores';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { textoDoAndamento, useVotacaoAoVivo } from './use-votacao-ao-vivo';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { importarVotacao, type Andamento, type ResumoDoEnvio } from './importar-votacao';

/**
 * "Votacao 2026": escolher QUALQUER candidato e ver, no mapa, onde ele teve
 * voto — escola, zona e secao —, pelo resultado oficial do TSE.
 *
 * A lista vem inteira de uma vez (sao alguns milhares de nomes, sem as
 * secoes) e e filtrada aqui: digitar nao espera o servidor.
 *
 * O ADMIN geral tambem envia a planilha aqui mesmo, no rodape da janela.
 */

/** Quantos nomes a lista mostra de cada vez: a busca acha o resto. */
const NA_TELA = 80;

export function BotaoDaVotacao({
  selecionados,
  onChange,
  onClear,
  podeEnviar,
  className,
}: {
  /** Ate quatro candidatos de uma vez (a dobradinha, por exemplo). */
  selecionados: CandidatoDaVotacao[];
  onChange: (candidatos: CandidatoDaVotacao[]) => void;
  onClear: () => void;
  podeEnviar: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const selecionado = selecionados[0] ?? null;

  return (
    <>
      <div className={cn('inline-flex items-center', className)}>
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-pressed={selecionado !== null}
          className={cn(
            'inline-flex min-h-9 items-center gap-1.5 border px-3 text-xs font-semibold transition-colors',
            selecionado ? 'rounded-l-pill border-accent-600 bg-accent-500 text-navy-900' : 'rounded-pill',
            !selecionado && 'border-line bg-surface text-ink-700 hover:bg-ink-50',
          )}
        >
          <Vote aria-hidden="true" className="size-3.5" />
          {selecionados.length > 1
            ? `Votação: ${selecionados.length} candidatos`
            : selecionado
              ? `Votação: ${selecionado.nome}`
              : 'Votação 2026 (TSE)'}
        </button>
        {selecionado ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Voltar ao mapa da campanha"
            title="Voltar ao mapa da campanha"
            className="inline-flex min-h-9 items-center rounded-r-pill border border-l-0 border-accent-600 bg-accent-500 px-2 text-navy-900 hover:bg-accent-400"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        ) : null}
      </div>

      {aberto ? (
        <SeletorDaVotacao
          podeEnviar={podeEnviar}
          selecionados={selecionados}
          onClose={() => setAberto(false)}
          onConfirm={(lista) => {
            onChange(lista);
            setAberto(false);
          }}
        />
      ) : null}
    </>
  );
}

function SeletorDaVotacao({
  podeEnviar,
  selecionados,
  onClose,
  onConfirm,
}: {
  podeEnviar: boolean;
  selecionados: CandidatoDaVotacao[];
  onClose: () => void;
  onConfirm: (candidatos: CandidatoDaVotacao[]) => void;
}) {
  /** A escolha em andamento: so vai para o mapa no "Ver no mapa". */
  const [escolhidos, setEscolhidos] = useState<CandidatoDaVotacao[]>(selecionados);
  const cheio = escolhidos.length >= MAXIMO_DE_CANDIDATOS;
  function alternar(c: CandidatoDaVotacao) {
    setEscolhidos((atual) =>
      atual.some((x) => x.id === c.id) ? atual.filter((x) => x.id !== c.id) : atual.length >= MAXIMO_DE_CANDIDATOS ? atual : [...atual, c],
    );
  }
  const loader = useCallback(() => api<{ candidatos: CandidatoDaVotacao[]; favoritos?: string[] }>('/api/votacao'), []);
  const { data, error, reload } = useRepositoryQuery(loader);
  const lista = data?.candidatos ?? null;
  const erro = error ? 'Não foi possível carregar a votação.' : null;
  // Com a janela aberta, a apuracao anda: boletim novo recarrega a lista.
  const { situacao, coletando, erro: erroAoVivo } = useVotacaoAoVivo(true, reload);
  const andamento = textoDoAndamento(situacao);
  const [turno, setTurno] = useState<number | null>(null);
  const [cargo, setCargo] = useState<number | null>(null);
  const [busca, setBusca] = useState('');
  const [todos, setTodos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [soFavoritos, setSoFavoritos] = useState(false);

  /**
   * Favoritos da pessoa (migration 057). A marcacao aparece na hora; a
   * resposta do servidor confirma, e uma falha desfaz.
   */
  const [marcados, setMarcados] = useState<string[] | null>(null);
  const favoritos = useMemo(() => new Set(marcados ?? data?.favoritos ?? []), [marcados, data]);
  const [erroFavorito, setErroFavorito] = useState<string | null>(null);

  function alternarFavorito(c: CandidatoDaVotacao) {
    const chave = chaveDoFavorito(c);
    const antes = [...favoritos];
    const favorito = !favoritos.has(chave);
    setMarcados(favorito ? [...antes, chave] : antes.filter((k) => k !== chave));
    setErroFavorito(null);
    api<{ favoritos: string[] }>('/api/votacao/favoritos', {
      method: 'POST',
      body: { ano: c.ano, uf: c.uf, cargoCodigo: c.cargoCodigo, numero: c.numero, favorito },
    })
      .then((r) => setMarcados(r.favoritos))
      .catch((e: unknown) => {
        setMarcados(antes);
        setErroFavorito(e instanceof Error ? e.message : 'Não foi possível salvar o favorito.');
      });
  }

  const turnos = useMemo(() => [...new Set((lista ?? []).map((c) => c.turno))].sort(), [lista]);
  const cargos = useMemo(() => cargosDaVotacao(lista ?? []), [lista]);
  // Comeca no 1o turno: sem isso, o mesmo nome apareceria duas vezes.
  const turnoAtivo = turno ?? turnos[0] ?? null;
  const achados = useMemo(
    () => filtrarCandidatos(lista ?? [], { turno: turnoAtivo, cargoCodigo: cargo, busca, todos, favoritos, soFavoritos }),
    [lista, turnoAtivo, cargo, busca, todos, favoritos, soFavoritos],
  );

  return (
    <Modal
      open
      onClose={onClose}
      busy={enviando}
      size="lg"
      title="Votação 2026 · resultado do TSE"
      description={`Escolha até ${MAXIMO_DE_CANDIDATOS} candidatos para ver no mapa onde cada um teve voto, contra a estimativa do time: escola, zona e seção.`}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" aria-label="Candidatos escolhidos">
            {escolhidos.length === 0 ? (
              <li className="text-xs text-ink-500">Nenhum candidato escolhido.</li>
            ) : (
              escolhidos.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => alternar(c)}
                    title={`Tirar ${c.nome}`}
                    className="inline-flex min-h-8 max-w-56 items-center gap-1.5 rounded-pill border border-line bg-surface py-0.5 pr-2 pl-0.5 text-xs font-semibold text-ink-900 hover:bg-ink-50"
                  >
                    <FotoDoCandidato cargo={c.cargoCodigo} sqcand={null} src={fotoDoCandidatoUrl(c)} nome={c.nome} tamanho="xs" />
                    <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: CORES_DOS_CANDIDATOS[i] }} />
                    <span className="truncate">{c.nome}</span>
                    <X aria-hidden="true" className="size-3 shrink-0 text-ink-400" />
                  </button>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            onClick={() => onConfirm(escolhidos)}
            disabled={escolhidos.length === 0 && selecionados.length === 0}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-control bg-navy-900 px-4 text-sm font-semibold text-gold-400 transition-colors hover:bg-navy-800 disabled:opacity-50"
          >
            <Vote aria-hidden="true" className="size-4" />
            {escolhidos.length === 0 ? 'Voltar ao mapa da campanha' : `Ver no mapa (${escolhidos.length})`}
          </button>
        </div>
      }
    >
      <AndamentoAoVivo
        texto={andamento}
        coletando={coletando}
        pausadoAte={situacao?.pausadoAte ?? null}
        erro={erroAoVivo}
      />

      {erro ? (
        <p className="rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">{erro}</p>
      ) : lista === null ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-500">
          <Spinner className="size-4" /> Carregando a votação…
        </div>
      ) : lista.length === 0 ? (
        <p className="rounded-control border border-line bg-ink-50 px-3 py-4 text-center text-sm text-ink-700">
          {erroAoVivo
            ? 'Nenhum boletim de urna ainda: a busca no TSE não está funcionando (veja o motivo acima).'
            : 'Ainda não chegou nenhum boletim de urna. A lista se atualiza sozinha a cada minuto, conforme o TSE publica as seções.'}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {turnos.length > 1
              ? turnos.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={turnoAtivo === t}
                    onClick={() => setTurno(t)}
                    className={cn(
                      'inline-flex min-h-9 items-center rounded-pill border px-3 text-xs font-medium',
                      turnoAtivo === t ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-surface text-ink-700',
                    )}
                  >
                    {t}º turno
                  </button>
                ))
              : null}
            <button
              type="button"
              aria-pressed={soFavoritos}
              onClick={() => setSoFavoritos((atual) => !atual)}
              className={cn(
                'inline-flex min-h-9 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold',
                soFavoritos ? 'border-gold-600 bg-gold-500 text-navy-900' : 'border-line bg-surface text-ink-700 hover:bg-ink-50',
              )}
            >
              <Star aria-hidden="true" className={cn('size-3.5', soFavoritos && 'fill-current')} />
              Favoritos ({favoritos.size})
            </button>
            <Select
              aria-label="Cargo"
              value={cargo === null ? '' : String(cargo)}
              onChange={(e) => setCargo(e.target.value ? Number(e.target.value) : null)}
              className="min-w-48 flex-1"
            >
              <option value="">Todos os cargos</option>
              {cargos.map((c) => (
                <option key={c.codigo} value={String(c.codigo)}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </div>

          <SearchInput
            id="busca-candidato"
            value={busca}
            onChange={setBusca}
            label="Buscar candidato"
            placeholder="Nome ou número do candidato"
          />

          <label className="flex items-center gap-2 text-xs text-ink-700">
            <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
            Mostrar também voto de legenda, branco e nulo
          </label>

          {erroFavorito ? (
            <p className="rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700" role="alert">
              {erroFavorito}
            </p>
          ) : null}
          {cheio ? (
            <p className="rounded-control border border-gold-500/40 bg-gold-50 px-3 py-2 text-xs text-gold-700">
              Já são {MAXIMO_DE_CANDIDATOS} candidatos: tire um para escolher outro.
            </p>
          ) : null}

          <ul className="max-h-[45vh] divide-y divide-line overflow-y-auto rounded-control border border-line">
            {achados.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-ink-500">
                {soFavoritos
                  ? 'Nenhum favorito aqui ainda. Toque na estrela ao lado de um candidato para favoritar.'
                  : 'Ninguém encontrado com essa busca.'}
              </li>
            ) : (
              achados.slice(0, NA_TELA).map((c) => {
                const favorito = favoritos.has(chaveDoFavorito(c));
                const posicao = escolhidos.findIndex((x) => x.id === c.id);
                const escolhido = posicao >= 0;
                return (
                  <li key={c.id} className={cn('flex items-center transition-colors', escolhido && 'bg-brand-50')}>
                    <button
                      type="button"
                      onClick={() => alternarFavorito(c)}
                      aria-pressed={favorito}
                      aria-label={favorito ? `Tirar ${c.nome} dos favoritos` : `Favoritar ${c.nome}`}
                      title={favorito ? 'Tirar dos favoritos' : 'Favoritar'}
                      className="flex size-11 shrink-0 items-center justify-center text-ink-400 transition-colors hover:text-gold-600"
                    >
                      <Star aria-hidden="true" className={cn('size-5', favorito && 'fill-gold-500 text-gold-600')} />
                    </button>
                    <button
                      type="button"
                      onClick={() => alternar(c)}
                      aria-pressed={escolhido}
                      disabled={!escolhido && cheio}
                      className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-3 text-left transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="flex min-w-14 justify-center rounded-control bg-ink-100 px-1.5 py-1 text-xs font-bold text-ink-700 tabular-nums">
                        {c.numero}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink-900">{c.nome}</span>
                        <span className="block text-xs text-ink-500">
                          {c.cargo} · {c.turno}º turno · {c.uf}
                        </span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="block text-sm font-bold text-brand-800">
                          {formatNumber(c.total)} <span className="text-xs font-normal text-ink-500">votos</span>
                        </span>
                        {/* O total oficial do TSE anda na frente durante a apuracao. */}
                        {c.totalOficial !== null && c.totalOficial > c.total ? (
                          <span className="block text-[0.6875rem] text-ink-500">
                            TSE no estado: {formatNumber(c.totalOficial)}
                          </span>
                        ) : null}
                      </span>
                      {/* A marca da escolha, na cor que o candidato tera no mapa e no PDF. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                          escolhido ? 'border-transparent text-white' : 'border-ink-200',
                        )}
                        style={escolhido ? { background: CORES_DOS_CANDIDATOS[posicao] } : undefined}
                      >
                        {escolhido ? <Check className="size-3.5" strokeWidth={3} /> : null}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          {achados.length > NA_TELA ? (
            <p className="text-xs text-ink-500">
              Mostrando os {NA_TELA} mais votados de {formatNumber(achados.length)}. Busque pelo nome ou número para achar os outros.
            </p>
          ) : null}
        </div>
      )}

      {podeEnviar ? <EnvioDaPlanilha onEnviando={setEnviando} onFim={reload} /> : null}
    </Modal>
  );
}

/** Rodape do ADMIN: enviar a planilha de votacao por secao do TSE. */
function EnvioDaPlanilha({ onEnviando, onFim }: { onEnviando: (sim: boolean) => void; onFim: () => void }) {
  const campo = useRef<HTMLInputElement>(null);
  const [andamento, setAndamento] = useState<Andamento | null>(null);
  const [resumo, setResumo] = useState<ResumoDoEnvio | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(arquivo: File) {
    setErro(null);
    setResumo(null);
    onEnviando(true);
    try {
      setResumo(await importarVotacao(arquivo, setAndamento));
      onFim();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler a planilha.');
    } finally {
      setAndamento(null);
      onEnviando(false);
      if (campo.current) campo.current.value = '';
    }
  }

  return (
    <section className="mt-4 space-y-2 border-t border-line pt-4">
      <h3 className="text-sm font-semibold text-ink-900">Enviar a votação do TSE</h3>
      <p className="text-xs text-ink-500">
        No Portal de Dados Abertos do TSE (dadosabertos.tse.jus.br), baixe <b>Resultados 2026 → Votação por seção
        eleitoral</b>, o arquivo de <b>AL</b>, e envie o .zip como veio. A planilha é lida aqui no navegador e pode levar
        alguns minutos. Enviar de novo (por exemplo, com o 2º turno) atualiza sem duplicar.
      </p>

      <input
        ref={campo}
        type="file"
        accept=".zip,.csv,.txt"
        className="sr-only"
        id="arquivo-votacao"
        disabled={andamento !== null}
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) void enviar(arquivo);
        }}
      />
      <label
        htmlFor="arquivo-votacao"
        className={cn(
          'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-control border border-brand-200 bg-surface px-3 text-sm font-semibold text-brand-800 hover:bg-brand-50',
          andamento && 'pointer-events-none opacity-60',
        )}
      >
        <Upload aria-hidden="true" className="size-4" />
        Escolher arquivo (.zip ou .csv)
      </label>

      {andamento ? (
        <div className="space-y-1" role="status">
          <p className="text-xs text-ink-700">{andamento.texto}</p>
          <div className="h-1.5 w-full overflow-hidden rounded-pill bg-ink-100">
            <div className="h-full rounded-pill bg-brand-600 transition-all" style={{ width: `${Math.round(andamento.fracao * 100)}%` }} />
          </div>
        </div>
      ) : null}

      {resumo ? (
        <p className="rounded-control border border-success-600/30 bg-success-50 px-3 py-2 text-xs text-success-700" role="status">
          Pronto: {formatNumber(resumo.candidatos)} candidatos em {formatNumber(resumo.secoes)} seções ({resumo.cargos.join(', ')}).
          {resumo.ignoradas > 0 ? ` ${formatNumber(resumo.ignoradas)} linhas incompletas foram ignoradas.` : ''}
        </p>
      ) : null}

      {erro ? (
        <p className="rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700" role="alert">
          {erro}
        </p>
      ) : null}
    </section>
  );
}

/** "● Ao vivo · 1.234 de 7.000 seções com boletim (18%) · atualizado às 19:42". */
export function AndamentoAoVivo({
  texto,
  coletando,
  pausadoAte,
  erro,
  className,
}: {
  texto: string | null;
  coletando: boolean;
  pausadoAte: string | null;
  /** Por que a busca falhou. Nunca fica escondido atras de "buscando...". */
  erro?: string | null;
  className?: string;
}) {
  if (erro && !pausadoAte) {
    return (
      <p
        className={cn('mb-3 rounded-control border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700', className)}
        role="alert"
      >
        <b>A busca ao vivo falhou.</b> {erro}
        {texto ? ` (${texto})` : ''}
      </p>
    );
  }
  return (
    <p className={cn('mb-3 flex items-center gap-2 text-xs text-ink-700', className)} role="status">
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-success-600" />
      </span>
      <span>
        <b>Ao vivo</b> ·{' '}
        {pausadoAte
          ? `o TSE pediu uma pausa; a coleta volta às ${new Date(pausadoAte).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
          : (texto ?? 'buscando os boletins de urna no TSE…')}
        {coletando && texto ? ' · buscando novos boletins…' : ''}
      </span>
    </p>
  );
}
