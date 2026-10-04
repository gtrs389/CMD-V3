/**
 * Leitura de .zip no navegador, sem biblioteca.
 *
 * Feita para os arquivos do TSE: um CSV de centenas de megas dentro de um
 * .zip. Nada e carregado inteiro na memoria — o diretorio do zip e lido do
 * fim do arquivo, e cada CSV sai descompactado em pedacos
 * (DecompressionStream), na medida em que e lido.
 *
 * Suporta "guardado" (metodo 0) e "deflate" (metodo 8), que e o que todo
 * zip comum usa, e o formato zip64 dos arquivos acima de 4 GB.
 */

export interface EntradaDoZip {
  nome: string;
  metodo: number;
  compactado: number;
  original: number;
  /** Onde comeca o cabecalho local da entrada. */
  deslocamento: number;
}

export class ZipInvalido extends Error {}

const ASSINATURA_FIM = 0x06054b50;
const ASSINATURA_FIM_64 = 0x06064b50;
const ASSINATURA_LOCALIZADOR_64 = 0x07064b50;
const ASSINATURA_CENTRAL = 0x02014b50;

async function bytes(arquivo: Blob, inicio: number, fim: number): Promise<DataView> {
  return new DataView(await arquivo.slice(inicio, fim).arrayBuffer());
}

const u64 = (v: DataView, pos: number) => Number(v.getBigUint64(pos, true));

/** O arquivo comeca como zip? ("PK\x03\x04") */
export async function ehZip(arquivo: Blob): Promise<boolean> {
  if (arquivo.size < 4) return false;
  return (await bytes(arquivo, 0, 4)).getUint32(0, true) === 0x04034b50;
}

/** As entradas do zip, lidas do diretorio central (no fim do arquivo). */
export async function entradasDoZip(arquivo: Blob): Promise<EntradaDoZip[]> {
  // O registro de fim tem 22 bytes mais um comentario de ate 64 KB.
  const cauda = Math.min(arquivo.size, 22 + 65535 + 20);
  const inicioDaCauda = arquivo.size - cauda;
  const fim = await bytes(arquivo, inicioDaCauda, arquivo.size);

  let pos = -1;
  for (let i = cauda - 22; i >= 0; i -= 1) {
    if (fim.getUint32(i, true) === ASSINATURA_FIM) {
      pos = i;
      break;
    }
  }
  if (pos < 0) throw new ZipInvalido('O arquivo .zip está incompleto ou corrompido.');

  let total = fim.getUint16(pos + 10, true);
  let tamanhoDoDiretorio = fim.getUint32(pos + 12, true);
  let inicioDoDiretorio = fim.getUint32(pos + 16, true);

  // zip64: os campos acima vem saturados e o valor real esta em outro registro.
  if (pos >= 20 && fim.getUint32(pos - 20, true) === ASSINATURA_LOCALIZADOR_64) {
    const onde = u64(fim, pos - 20 + 8);
    const registro = await bytes(arquivo, onde, onde + 56);
    if (registro.getUint32(0, true) === ASSINATURA_FIM_64) {
      total = u64(registro, 32);
      tamanhoDoDiretorio = u64(registro, 40);
      inicioDoDiretorio = u64(registro, 48);
    }
  }

  const diretorio = await bytes(arquivo, inicioDoDiretorio, inicioDoDiretorio + tamanhoDoDiretorio);
  const nomes = new TextDecoder('utf-8');
  const entradas: EntradaDoZip[] = [];
  let p = 0;
  for (let i = 0; i < total; i += 1) {
    if (diretorio.getUint32(p, true) !== ASSINATURA_CENTRAL) break;
    const metodo = diretorio.getUint16(p + 10, true);
    let compactado = diretorio.getUint32(p + 20, true);
    let original = diretorio.getUint32(p + 24, true);
    const tamNome = diretorio.getUint16(p + 28, true);
    const tamExtra = diretorio.getUint16(p + 30, true);
    const tamComentario = diretorio.getUint16(p + 32, true);
    let deslocamento = diretorio.getUint32(p + 42, true);
    const nome = nomes.decode(new Uint8Array(diretorio.buffer, diretorio.byteOffset + p + 46, tamNome));

    // Campo extra zip64 (0x0001): so traz os valores que vieram saturados.
    let e = p + 46 + tamNome;
    const fimExtra = e + tamExtra;
    while (e + 4 <= fimExtra) {
      const id = diretorio.getUint16(e, true);
      const tam = diretorio.getUint16(e + 2, true);
      if (id === 0x0001) {
        let q = e + 4;
        if (original === 0xffffffff) {
          original = u64(diretorio, q);
          q += 8;
        }
        if (compactado === 0xffffffff) {
          compactado = u64(diretorio, q);
          q += 8;
        }
        if (deslocamento === 0xffffffff) deslocamento = u64(diretorio, q);
      }
      e += 4 + tam;
    }

    entradas.push({ nome, metodo, compactado, original, deslocamento });
    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return entradas;
}

/** O conteudo de uma entrada, descompactado aos pedacos. */
export async function conteudoDaEntrada(arquivo: Blob, entrada: EntradaDoZip): Promise<ReadableStream<Uint8Array>> {
  const local = await bytes(arquivo, entrada.deslocamento, entrada.deslocamento + 30);
  const inicio = entrada.deslocamento + 30 + local.getUint16(26, true) + local.getUint16(28, true);
  const dados = arquivo.slice(inicio, inicio + entrada.compactado).stream();
  if (entrada.metodo === 0) return dados;
  if (entrada.metodo === 8) return dados.pipeThrough(new DecompressionStream('deflate-raw'));
  throw new ZipInvalido(`O arquivo "${entrada.nome}" usa uma compactação que o navegador não abre.`);
}
