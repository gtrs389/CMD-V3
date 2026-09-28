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

/** Valor do filtro "sem tag". Minusculo: nenhuma tag gravada e minuscula. */
export const SEM_TAG = '__sem-tag__';

export interface OpcaoDeTag {
  /** A tag, ou `SEM_TAG`. */
  valor: string;
  rotulo: string;
  /** Quantas pessoas da lista aparecem com ela (Lider e Equipe juntos). */
  quantidade: number;
}

/**
 * As tags que existem na lista, para o filtro: cada uma com quantas pessoas
 * a mostram ao lado do nome, em ordem alfabetica, e "Sem tag" por ultimo.
 *
 * Sai da propria lista, e nao de um cadastro de tags: so aparece tag que
 * alguem de fato tem, e ela some sozinha quando o ultimo Lider a perde.
 */
export function opcoesDeTag(
  members: Pick<Member, 'tier' | 'tag' | 'recruitedBy'>[],
): OpcaoDeTag[] {
  const contagem = new Map<string, number>();
  let semTag = 0;
  for (const member of members) {
    const tag = tagDaPessoa(member);
    if (tag) contagem.set(tag, (contagem.get(tag) ?? 0) + 1);
    else semTag += 1;
  }
  if (contagem.size === 0) return [];

  const opcoes: OpcaoDeTag[] = [...contagem]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([tag, quantidade]) => ({ valor: tag, rotulo: tag, quantidade }));
  if (semTag > 0) opcoes.push({ valor: SEM_TAG, rotulo: 'Sem tag', quantidade: semTag });
  return opcoes;
}

/** A pessoa passa pelo filtro de tag? `todas` deixa todo mundo passar. */
export function passaNoFiltroDeTag(
  member: Pick<Member, 'tier' | 'tag' | 'recruitedBy'>,
  filtro: string,
): boolean {
  if (filtro === 'todas') return true;
  const tag = tagDaPessoa(member);
  return filtro === SEM_TAG ? tag === null : tag === filtro;
}
