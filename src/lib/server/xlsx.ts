import 'server-only';
import { inflateRawSync } from 'node:zlib';

/**
 * Leitura de um arquivo .xlsx: as abas, na ordem, cada uma como linhas de
 * texto.
 *
 * Existe para a planilha do Google Sheets do time duplicado. O Google
 * exporta a planilha INTEIRA como .xlsx por um endereco publico — e o unico
 * jeito de ler TODAS as abas sem pedir uma chave de API a quem usa. O .xlsx
 * e um .zip com XMLs dentro; aqui ficam so as partes que um arquivo
 * exportado pelo Google usa: texto compartilhado, texto na celula, numero e
 * verdadeiro/falso. Formula vale pelo resultado ja calculado.
 *
 * Nenhuma dependencia nova: o descompactador e o `zlib` do proprio Node.
 */

export interface AbaDaPlanilha {
  titulo: string;
  /** Linhas como vieram, cada celula ja como texto. Colunas vazias viram ''. */
  linhas: string[][];
}

export class PlanilhaInvalidaError extends Error {
  constructor(message = 'O arquivo baixado não é uma planilha válida.') {
    super(message);
    this.name = 'PlanilhaInvalidaError';
  }
}

/* -------------------------------------------------------------------------
   ZIP
   ------------------------------------------------------------------------- */

/** Arquivos de dentro do .zip, pelo nome. So os pedidos sao descompactados. */
function lerZip(dados: Buffer, querer: (nome: string) => boolean): Map<string, Buffer> {
  // Fim do diretorio central: assinatura 0x06054b50, procurada de tras para
  // frente (depois dela so pode vir o comentario, de ate 64 KB).
  let fim = -1;
  for (let i = dados.length - 22; i >= Math.max(0, dados.length - 65_557); i -= 1) {
    if (dados.readUInt32LE(i) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new PlanilhaInvalidaError();

  const total = dados.readUInt16LE(fim + 10);
  let posicao = dados.readUInt32LE(fim + 16);
  const arquivos = new Map<string, Buffer>();

  for (let n = 0; n < total; n += 1) {
    if (posicao + 46 > dados.length || dados.readUInt32LE(posicao) !== 0x02014b50) {
      throw new PlanilhaInvalidaError();
    }
    const metodo = dados.readUInt16LE(posicao + 10);
    const compactado = dados.readUInt32LE(posicao + 20);
    const tamNome = dados.readUInt16LE(posicao + 28);
    const tamExtra = dados.readUInt16LE(posicao + 30);
    const tamComentario = dados.readUInt16LE(posicao + 32);
    const local = dados.readUInt32LE(posicao + 42);
    const nome = dados.toString('utf8', posicao + 46, posicao + 46 + tamNome);
    posicao += 46 + tamNome + tamExtra + tamComentario;

    if (!querer(nome)) continue;
    if (local + 30 > dados.length || dados.readUInt32LE(local) !== 0x04034b50) {
      throw new PlanilhaInvalidaError();
    }
    const inicio = local + 30 + dados.readUInt16LE(local + 26) + dados.readUInt16LE(local + 28);
    const bruto = dados.subarray(inicio, inicio + compactado);

    if (metodo === 0) arquivos.set(nome, Buffer.from(bruto));
    else if (metodo === 8) arquivos.set(nome, inflateRawSync(bruto));
    else throw new PlanilhaInvalidaError();
  }

  return arquivos;
}

/* -------------------------------------------------------------------------
   XML
   ------------------------------------------------------------------------- */

function decodificar(texto: string): string {
  return texto
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Atributos de uma tag, pelo nome local (sem prefixo `r:`). */
function atributos(tag: string): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const [, nome, valor] of tag.matchAll(/([\w:]+)="([^"]*)"/g)) {
    resultado[nome.includes(':') ? nome.split(':')[1] : nome] = decodificar(valor);
  }
  return resultado;
}

/** Todo o texto de `<t>` dentro de um trecho, ignorando a leitura fonetica. */
function textoDe(trecho: string): string {
  const semFonetica = trecho.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let texto = '';
  for (const [, valor] of semFonetica.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
    texto += decodificar(valor);
  }
  return texto;
}

/** "AB12" -> 27 (indice da coluna, a partir de zero). */
function indiceDaColuna(referencia: string): number {
  const letras = /^[A-Z]+/.exec(referencia)?.[0] ?? '';
  let indice = 0;
  for (const letra of letras) indice = indice * 26 + (letra.charCodeAt(0) - 64);
  return indice - 1;
}

/**
 * Numero como a planilha mostra.
 *
 * Telefone e titulo chegam como numero, e um numero grande pode vir em
 * notacao cientifica ("8.2999990001E10"). Inteiro vira os digitos inteiros;
 * fracionario fica como veio.
 */
function numero(bruto: string): string {
  if (!/e/i.test(bruto)) return bruto.endsWith('.0') ? bruto.slice(0, -2) : bruto;
  const valor = Number(bruto);
  if (!Number.isFinite(valor)) return bruto;
  return Number.isInteger(valor) ? BigInt(Math.round(valor)).toString() : String(valor);
}

/* -------------------------------------------------------------------------
   Formato de numero: o que a planilha MOSTRA, e nao o numero cru
   ------------------------------------------------------------------------- */

/**
 * Formato de exibicao de cada estilo de celula (`s` na celula -> codigo).
 *
 * E isto que guarda os zeros a esquerda. Um titulo digitado como numero e
 * formatado como "0000 0000 0000" aparece na planilha como "0240 5979 1708",
 * mas o arquivo guarda o NUMERO 24059791708 — sem o zero, com 11 digitos.
 * Lido cru, ele vira uma inconsistencia falsa ("titulo com 11 digitos").
 */
function lerFormatos(estilos: string | undefined): (string | null)[] {
  if (!estilos) return [];

  const codigos = new Map<string, string>();
  for (const [tag] of estilos.matchAll(/<numFmt\b[^>]*\/?>/g)) {
    const attrs = atributos(tag);
    if (attrs.numFmtId && attrs.formatCode !== undefined) codigos.set(attrs.numFmtId, attrs.formatCode);
  }

  const bloco = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos)?.[1] ?? '';
  const formatos: (string | null)[] = [];
  for (const [tag] of bloco.matchAll(/<xf\b[^>]*>/g)) {
    const id = atributos(tag).numFmtId ?? '0';
    // Formatos embutidos que so tem digitos: 1 = "0". O resto dos embutidos
    // (decimal, milhar, data, porcentagem) nao muda digito nenhum.
    formatos.push(codigos.get(id) ?? (id === '1' ? '0' : null));
  }
  return formatos;
}

/**
 * Aplica um formato SO de digitos ("0000 0000 0000", "000", "(00) 00000-0000")
 * a um inteiro, como a planilha faz na tela. Formato com qualquer outra coisa
 * — casa decimal, milhar, porcentagem, data, notacao cientifica — devolve
 * nulo, e vale o numero como veio.
 */
export function aplicarFormatoDeDigitos(inteiro: string, formato: string): string | null {
  // So a primeira secao (a dos positivos), sem cor nem condicao ([Red], [>0]).
  const secao = formato.split(';')[0].replace(/\[[^\]]*\]/g, '');

  // Quebra em marcadores de digito e texto literal.
  const partes: { tipo: 'zero' | 'opcional' | 'texto'; valor: string }[] = [];
  for (let i = 0; i < secao.length; i += 1) {
    const c = secao[i];
    if (c === '0') partes.push({ tipo: 'zero', valor: c });
    else if (c === '#') partes.push({ tipo: 'opcional', valor: c });
    else if (c === '"') {
      const fim = secao.indexOf('"', i + 1);
      if (fim === -1) return null;
      partes.push({ tipo: 'texto', valor: secao.slice(i + 1, fim) });
      i = fim;
    } else if (c === '\\') {
      partes.push({ tipo: 'texto', valor: secao[i + 1] ?? '' });
      i += 1;
    } else if (' -()/+_'.includes(c)) partes.push({ tipo: 'texto', valor: c });
    else return null; // . , % E e letras de data: nao e formato de digitos.
  }
  const marcadores = partes.filter((parte) => parte.tipo !== 'texto').length;
  if (marcadores === 0 || !/^\d+$/.test(inteiro)) return null;

  // Da direita para a esquerda, como a planilha: cada marcador pega um
  // digito; o "0" sem digito vira zero, o "#" sem digito some. Digito que
  // sobra fica todo no primeiro marcador.
  let digitos = inteiro === '0' ? '' : inteiro;
  const saida: string[] = [];
  let restantes = marcadores;
  for (let i = partes.length - 1; i >= 0; i -= 1) {
    const parte = partes[i];
    if (parte.tipo === 'texto') {
      saida.unshift(parte.valor);
      continue;
    }
    restantes -= 1;
    if (restantes === 0) {
      saida.unshift(digitos || (parte.tipo === 'zero' ? '0' : ''));
      digitos = '';
    } else if (digitos) {
      saida.unshift(digitos.slice(-1));
      digitos = digitos.slice(0, -1);
    } else if (parte.tipo === 'zero') saida.unshift('0');
  }
  return saida.join('');
}

function lerAba(xml: string, compartilhados: string[], formatos: (string | null)[] = []): string[][] {
  const linhas: string[][] = [];

  for (const [, atributosDaLinha, conteudo] of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const numeroDaLinha = Number(atributos(`<row ${atributosDaLinha}>`).r ?? linhas.length + 1) - 1;
    const celulas: string[] = [];

    for (const [, abertura, corpo = ''] of conteudo.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = atributos(`<c ${abertura}>`);
      const coluna = attrs.r ? indiceDaColuna(attrs.r) : celulas.length;
      const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];

      let valor = '';
      if (attrs.t === 's') valor = compartilhados[Number(v)] ?? '';
      else if (attrs.t === 'inlineStr') valor = textoDe(corpo);
      else if (attrs.t === 'b') valor = v === '1' ? 'VERDADEIRO' : 'FALSO';
      else if (attrs.t === 'str' || attrs.t === 'e') valor = decodificar(v ?? '');
      else if (v !== undefined) {
        valor = numero(decodificar(v));
        // Numero com formato de digitos: vale o que a planilha mostra.
        const formato = attrs.s !== undefined ? formatos[Number(attrs.s)] : null;
        if (formato) valor = aplicarFormatoDeDigitos(valor, formato) ?? valor;
      }

      while (celulas.length < coluna) celulas.push('');
      celulas[coluna] = valor.trim();
    }

    while (linhas.length < numeroDaLinha) linhas.push([]);
    linhas[numeroDaLinha] = celulas;
  }

  return linhas;
}

/**
 * Abas visiveis do .xlsx, na ordem em que aparecem na planilha.
 *
 * Aba oculta fica de fora: quem esconde uma aba no Sheets nao quer que ela
 * conte.
 */
export function lerXlsx(dados: Buffer): AbaDaPlanilha[] {
  if (dados.length < 4 || dados.readUInt32LE(0) !== 0x04034b50) throw new PlanilhaInvalidaError();

  const arquivos = lerZip(
    dados,
    (nome) =>
      nome === 'xl/workbook.xml' ||
      nome === 'xl/_rels/workbook.xml.rels' ||
      nome === 'xl/sharedStrings.xml' ||
      nome === 'xl/styles.xml' ||
      nome.startsWith('xl/worksheets/'),
  );

  const livro = arquivos.get('xl/workbook.xml')?.toString('utf8');
  const relacoes = arquivos.get('xl/_rels/workbook.xml.rels')?.toString('utf8');
  if (!livro || !relacoes) throw new PlanilhaInvalidaError();

  const alvos = new Map<string, string>();
  for (const [tag] of relacoes.matchAll(/<Relationship\b[^>]*>/g)) {
    const attrs = atributos(tag);
    if (!attrs.Id || !attrs.Target) continue;
    const alvo = attrs.Target.startsWith('/') ? attrs.Target.slice(1) : `xl/${attrs.Target}`;
    alvos.set(attrs.Id, alvo.replace(/\/\.\//g, '/'));
  }

  const formatos = lerFormatos(arquivos.get('xl/styles.xml')?.toString('utf8'));

  const compartilhados: string[] = [];
  const textos = arquivos.get('xl/sharedStrings.xml')?.toString('utf8') ?? '';
  for (const [, si] of textos.matchAll(/<si>([\s\S]*?)<\/si>/g)) compartilhados.push(textoDe(si));

  const abas: AbaDaPlanilha[] = [];
  for (const [tag] of livro.matchAll(/<sheet\b[^>]*>/g)) {
    const attrs = atributos(tag);
    if (attrs.state === 'hidden' || attrs.state === 'veryHidden') continue;
    const caminho = attrs.id ? alvos.get(attrs.id) : undefined;
    const xml = caminho ? arquivos.get(caminho)?.toString('utf8') : undefined;
    if (!xml) continue;
    abas.push({ titulo: (attrs.name ?? '').trim(), linhas: lerAba(xml, compartilhados, formatos) });
  }

  return abas;
}
