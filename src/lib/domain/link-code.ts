/**
 * Codigo visual de um link.
 *
 * E o rotulo curto que aparece na estampa do banner, logo abaixo do nome do
 * time:
 *
 *     #TIME BEZERRA
 *          H03
 *
 * Serve para uma pessoa dizer de qual link ela veio sem precisar mostrar o
 * endereco: e uma etiqueta de leitura, nao uma credencial. Nada e liberado,
 * consultado ou autorizado por ele.
 *
 * O codigo e DERIVADO do proprio token, com uma conta determinista: o mesmo
 * link mostra sempre o mesmo codigo, e gerar um link novo — que troca o
 * token — muda o codigo junto. Por ser derivado, nao existe coluna, tabela
 * nem migration para isso, e nao ha o que ficar fora de sincronia.
 *
 * A conta NAO e reversivel de forma util (sao dois digitos para 160 bits de
 * token), entao o codigo nao revela o link.
 */

/**
 * Letra fixa do codigo.
 *
 * Ela nao varia: e a marca, e o que muda de um link para outro sao os dois
 * digitos. Por isso o codigo tem 100 valores possiveis (H00 a H99) e dois
 * links diferentes podem cair no mesmo — sem consequencia nenhuma, porque
 * quem identifica o link continua sendo o token, no servidor.
 */
const LETTER = 'H';

/**
 * FNV-1a de 32 bits.
 *
 * Escolhido por caber em uma funcao pura, rodar igual no servidor e no
 * navegador e nao precisar de `node:crypto` — este valor e decorativo, nao
 * protege nada.
 */
function hash32(value: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    // Multiplicacao pelo primo do FNV, em 32 bits sem sinal.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

/** A letra fixa e dois digitos, no formato `H03`. Nulo sem token. */
export function linkCode(token: string | null | undefined): string | null {
  if (!token) return null;

  const numero = (hash32(token) % 100).toString().padStart(2, '0');
  return `${LETTER}${numero}`;
}
