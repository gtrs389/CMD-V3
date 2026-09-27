import type { Member } from '@/lib/types';

/**
 * Tag do Lider (migration 048).
 *
 * O ADMIN geral coloca uma tag curta no Lider — "ZONA NORTE", "IGREJA" — e
 * cada pessoa da Equipe dele aparece com a mesma tag ao lado do nome.
 *
 * So o Lider guarda a tag. A da Equipe e lida do Lider na hora, pelo
 * servidor (`recruitedBy.tag`): trocar a tag do Lider muda a Equipe inteira,
 * e passar alguem para outro Lider troca a tag junto, sem copia nenhuma para
 * ficar em desacordo.
 */

/** Tamanho maximo, o mesmo do `check` da migration 048. */
export const TAG_MAX = 24;

/**
 * Tag pronta para gravar: sem espaco sobrando, em maiusculas e no tamanho
 * maximo. Vazia vira nulo — e assim que se tira a tag de um Lider.
 *
 * Maiusculas porque a tag e uma etiqueta de grupo, lida de relance na lista:
 * "Zona norte", "zona Norte" e "ZONA NORTE" seriam tres grupos na tela e um
 * so na cabeca de quem cadastrou.
 */
export function normalizarTag(valor: string | null | undefined): string | null {
  const limpa = (valor ?? '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
  return limpa ? limpa.slice(0, TAG_MAX).trim() : null;
}

/**
 * A tag que aparece ao lado do nome da pessoa.
 *
 *   Lider   a propria tag;
 *   Equipe  a tag do Lider que a cadastrou.
 *
 * Nula quando o Lider nao tem tag, ou quando quem cadastrou nao e um Lider
 * (cadastro antigo, anterior aos niveis).
 */
export function tagDaPessoa(member: Pick<Member, 'tier' | 'tag' | 'recruitedBy'>): string | null {
  if (member.tier === 'LIDER') return member.tag ?? null;
  return member.recruitedBy?.tag ?? null;
}
