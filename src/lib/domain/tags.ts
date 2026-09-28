import type { MemberTag, TagColor, TagInput, TeamTier } from '@/lib/types';
import { TAG_COLORS } from '@/lib/types';

/**
 * Tags das pessoas do time — regras puras, sem banco nem tela.
 *
 * Uma tag e uma DESIGNACAO dada pelo ADMIN geral, como "Coordenador Delta
 * Operacional". Nao e uma troca de nivel: a pessoa continua onde estava na
 * hierarquia, com os cadastros que trouxe, o link, o acesso e o historico.
 * Ela ganha a tag — e a tag diz de onde ela veio.
 */

/** A tag que ja nasce no catalogo (migration 048). */
export const TAG_DELTA = 'Coordenador Delta Operacional';

export const NOME_DA_COR: Record<TagColor, string> = {
  navy: 'Marinho e ouro',
  blue: 'Azul',
  green: 'Verde',
  orange: 'Laranja',
  violet: 'Roxo',
  rose: 'Rosa',
  amber: 'Âmbar',
  slate: 'Grafite',
};

/** Simbolos sugeridos no editor. Qualquer texto de ate 3 caracteres vale. */
export const SIMBOLOS_SUGERIDOS = ['Δ', 'Ω', 'Σ', 'Φ', 'Ψ', 'α', 'β', '◆', '▲', '●', '01', 'C'] as const;

export function ehCorDeTag(valor: unknown): valor is TagColor {
  return typeof valor === 'string' && (TAG_COLORS as readonly string[]).includes(valor);
}

const NIVEL: Record<TeamTier, string> = { LIDER: 'Líder', EQUIPE: 'Equipe' };

/** "Era Equipe", "Era Líder". */
export function origemDaTag(tag: Pick<MemberTag, 'fromTier'>): string {
  return `Era ${NIVEL[tag.fromTier]}`;
}

/** "Era Equipe · desde 27/09/2026 · por Ana". */
export function resumoDaTag(tag: Pick<MemberTag, 'fromTier' | 'since' | 'byName'>): string {
  const desde = new Date(tag.since).toLocaleDateString('pt-BR');
  return [origemDaTag(tag), `desde ${desde}`, tag.byName ? `por ${tag.byName}` : null]
    .filter(Boolean)
    .join(' · ');
}

/** Espacos repetidos viram um; vazio vira nulo. */
function limpo(valor: string | null | undefined, max: number): string | null {
  const texto = (valor ?? '').replace(/\s+/g, ' ').trim();
  return texto ? texto.slice(0, max) : null;
}

/**
 * A tag pronta para gravar, ou o motivo de nao poder.
 *
 * O simbolo conta por caractere visivel (Δ e um so), e nao por unidade de
 * codigo — o banco confere com `char_length`, que conta do mesmo jeito.
 */
export function normalizarTag(
  entrada: Partial<TagInput>,
): { ok: true; tag: TagInput } | { ok: false; motivo: string } {
  const name = limpo(entrada.name, 60);
  if (!name) return { ok: false, motivo: 'Dê um nome para a tag.' };

  const simbolo = limpo(entrada.symbol, 12);
  const symbol = simbolo ? Array.from(simbolo).slice(0, 3).join('') : null;

  const color = ehCorDeTag(entrada.color) ? entrada.color : 'navy';
  const description = limpo(entrada.description, 240);
  return { ok: true, tag: { name, symbol, color, description } };
}

/** Comparacao de nomes sem diferenca de maiuscula, acento ou espaco. */
export function mesmoNomeDeTag(a: string, b: string): boolean {
  const chave = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  return chave(a) === chave(b);
}

/** As tags do time, com quantas pessoas carregam cada uma, da mais usada. */
export function tagsDoTime(
  pessoas: ReadonlyArray<{ tags?: MemberTag[] }>,
): Array<{ tag: MemberTag; pessoas: number }> {
  const porId = new Map<string, { tag: MemberTag; pessoas: number }>();
  for (const pessoa of pessoas) {
    for (const tag of pessoa.tags ?? []) {
      const atual = porId.get(tag.id);
      if (atual) atual.pessoas += 1;
      else porId.set(tag.id, { tag, pessoas: 1 });
    }
  }
  return [...porId.values()].sort(
    (a, b) => b.pessoas - a.pessoas || a.tag.name.localeCompare(b.tag.name, 'pt-BR'),
  );
}
