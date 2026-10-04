import {
  AcumuladorDeVotacao,
  LOTE_DE_CANDIDATOS,
  LOTE_DE_SECOES,
  PlanilhaInvalida,
  camposDaLinha,
  indiceDeColunas,
  separadorDe,
  type VotacaoDoCandidato,
} from '@/lib/domain/votacao-tse';
import { api } from '@/lib/repositories/http/api';
import { conteudoDaEntrada, ehZip, entradasDoZip } from '@/lib/utils/zip';

/**
 * Envio da votacao por secao do TSE, a partir do arquivo baixado do Portal
 * de Dados Abertos (o .zip como vem, ou o .csv de dentro dele).
 *
 * Tudo e lido AQUI, no navegador: o arquivo de um estado passa de centenas de
 * megas, e nenhum servidor recebe isso numa requisicao. O que sobe e o
 * resultado da leitura — as secoes e, de cada candidato, as secoes onde
 * teve voto —, em lotes pequenos.
 */

export interface Andamento {
  fase: 'lendo' | 'gravando';
  /** 0 a 1. */
  fracao: number;
  texto: string;
}

export interface ResumoDoEnvio {
  linhas: number;
  ignoradas: number;
  secoes: number;
  candidatos: number;
  /** "Deputado Estadual · 1º turno", os cargos que vieram. */
  cargos: string[];
}

/** Os bytes de cada CSV do arquivo (do zip, ou o proprio arquivo). */
async function fontes(arquivo: File): Promise<{ nome: string; tamanho: number; dados: ReadableStream<Uint8Array> }[]> {
  if (!(await ehZip(arquivo))) return [{ nome: arquivo.name, tamanho: arquivo.size, dados: arquivo.stream() }];

  const csvs = (await entradasDoZip(arquivo)).filter((e) => /\.(csv|txt)$/i.test(e.nome));
  if (csvs.length === 0) throw new PlanilhaInvalida('O .zip não tem nenhuma planilha (.csv) dentro.');
  return Promise.all(
    csvs.map(async (e) => ({ nome: e.nome, tamanho: e.original, dados: await conteudoDaEntrada(arquivo, e) })),
  );
}

/** Le os CSVs linha a linha e junta tudo no acumulador. */
async function ler(arquivo: File, aoAndar: (a: Andamento) => void): Promise<AcumuladorDeVotacao> {
  const lista = await fontes(arquivo);
  const total = lista.reduce((s, f) => s + f.tamanho, 0) || 1;
  let lidos = 0;
  let acumulador: AcumuladorDeVotacao | null = null;

  for (const fonte of lista) {
    // O TSE grava em latin1: lido como utf-8, todo acento viraria lixo.
    const texto = new TextDecoder('windows-1252');
    const leitor = fonte.dados.getReader();
    let resto = '';
    let separador = ';';
    let indice: ReturnType<typeof indiceDeColunas> | null = null;
    let ultimoAviso = 0;

    const linha = (l: string) => {
      if (!l.trim()) return;
      if (!indice) {
        separador = separadorDe(l);
        indice = indiceDeColunas(camposDaLinha(l, separador));
        acumulador ??= new AcumuladorDeVotacao(indice);
        return;
      }
      acumulador!.adicionar(camposDaLinha(l, separador));
    };

    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      lidos += value.byteLength;
      const partes = (resto + texto.decode(value, { stream: true })).split(/\r?\n/);
      resto = partes.pop() ?? '';
      for (const p of partes) linha(p);

      const agora = Date.now();
      if (agora - ultimoAviso > 250) {
        ultimoAviso = agora;
        aoAndar({ fase: 'lendo', fracao: Math.min(1, lidos / total), texto: `Lendo a planilha… ${Math.round((lidos / total) * 100)}%` });
      }
    }
    linha(resto + texto.decode());
  }

  if (!acumulador) throw new PlanilhaInvalida('A planilha está vazia.');
  return acumulador;
}

/** Lotes de candidatos que cabem numa requisicao (os grandes vao sozinhos). */
function lotesDeCandidatos(candidatos: VotacaoDoCandidato[]): VotacaoDoCandidato[][] {
  const TETO = 40_000; // secoes por lote: cerca de 1 MB de corpo
  const lotes: VotacaoDoCandidato[][] = [];
  let atual: VotacaoDoCandidato[] = [];
  let peso = 0;
  for (const c of candidatos) {
    if (atual.length && (atual.length >= LOTE_DE_CANDIDATOS || peso + c.secoes.length > TETO)) {
      lotes.push(atual);
      atual = [];
      peso = 0;
    }
    atual.push(c);
    peso += c.secoes.length;
  }
  if (atual.length) lotes.push(atual);
  return lotes;
}

export async function importarVotacao(arquivo: File, aoAndar: (a: Andamento) => void): Promise<ResumoDoEnvio> {
  const acumulador = await ler(arquivo, aoAndar);
  const { secoes, candidatos } = acumulador.resultado();
  if (candidatos.length === 0) throw new PlanilhaInvalida('Nenhum voto encontrado na planilha.');

  const lotes: { tipo: 'secoes' | 'candidatos'; linhas: unknown[] }[] = [];
  for (let i = 0; i < secoes.length; i += LOTE_DE_SECOES) lotes.push({ tipo: 'secoes', linhas: secoes.slice(i, i + LOTE_DE_SECOES) });
  for (const lote of lotesDeCandidatos(candidatos)) lotes.push({ tipo: 'candidatos', linhas: lote });

  for (let i = 0; i < lotes.length; i += 1) {
    aoAndar({ fase: 'gravando', fracao: i / lotes.length, texto: `Gravando… ${i + 1} de ${lotes.length}` });
    await api('/api/votacao', { method: 'POST', body: lotes[i] });
  }

  const cargos = [...new Set(candidatos.map((c) => `${c.cargo} · ${c.turno}º turno`))];
  return {
    linhas: acumulador.linhas,
    ignoradas: acumulador.ignoradas,
    secoes: secoes.length,
    candidatos: candidatos.filter((c) => c.tipo === 'CANDIDATO').length,
    cargos,
  };
}
