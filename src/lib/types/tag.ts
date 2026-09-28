import type { IsoDate } from './common';
import type { TeamTier } from './user';

/**
 * Tags das pessoas do time (migration 048).
 *
 * Um catalogo do sistema — "Coordenador Delta Operacional", por exemplo — que
 * o ADMIN geral cria, edita e apaga, e coloca em quantas pessoas quiser. A
 * tag e uma DESIGNACAO: nivel, cadastros, link e acesso da pessoa continuam
 * os mesmos.
 */

export const TAG_COLORS = ['navy', 'blue', 'green', 'orange', 'violet', 'rose', 'amber', 'slate'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export interface Tag {
  id: string;
  name: string;
  /** Simbolo curto da insignia (ex.: "Δ"). Opcional. */
  symbol: string | null;
  color: TagColor;
  description: string | null;
}

/** A tag no catalogo, com quantas pessoas a carregam hoje. */
export interface TagDoCatalogo extends Tag {
  /** Pessoas com a tag, em todos os times. */
  pessoas: number;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** A tag em uma pessoa: de onde ela veio e desde quando. */
export interface MemberTag extends Tag {
  since: IsoDate;
  /** Quem colocou, pelo nome gravado no momento. */
  byName: string | null;
  /** O nivel que a pessoa tinha quando recebeu a tag. */
  fromTier: TeamTier;
}

export interface TagInput {
  name: string;
  symbol: string | null;
  color: TagColor;
  description: string | null;
}

/** Uma linha do historico de tags de uma pessoa. */
export interface EventoDeTag {
  acao: 'ADDED' | 'REMOVED' | 'TAG_DELETED';
  tagId: string | null;
  tagName: string;
  nivel: TeamTier;
  por: string;
  em: IsoDate;
}
