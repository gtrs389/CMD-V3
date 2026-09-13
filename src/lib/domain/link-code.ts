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
 * A conta NAO e reversivel de forma util (sao tres caracteres para 160 bits
 * de token), entao o codigo nao revela o link. Colisao entre dois links
 * diferentes e possivel e nao tem consequencia nenhuma: quem identifica o
 * link continua sendo o token, no servidor.
 */

/** Alfabeto do codigo: sem I e O, que se confundem com 1 e 0 impressos. */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

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

/** Uma letra e dois digitos, no formato `H03`. Nulo sem token. */
export function linkCode(token: string | null | undefined): string | null {
  if (!token) return null;

  const hash = hash32(token);
  const letra = LETTERS[hash % LETTERS.length];
  const numero = (Math.floor(hash / LETTERS.length) % 100).toString().padStart(2, '0');

  return `${letra}${numero}`;
}
