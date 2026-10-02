import { contandoUmaVez } from './inconsistencias';
import type { Member } from '@/lib/types';
import { normalizePhone } from '@/lib/utils/phone';
import { normalizeSearch } from '@/lib/utils/text';
import { recruiterText } from './recruitment';

/**
 * Listas "por quem cadastrou" — como a coordenacao corrige na pratica: cada
 * lideranca recebe a SUA lista.
 *
 * Os grupos vem de quem tem MAIS pendencias para quem tem menos (o
 * primeiro bloco e onde o trabalho esta), e dentro de cada grupo as pessoas
 * em ordem alfabetica.
 */

export interface GrupoPorResponsavel<T> {
  responsavel: string;
  itens: T[];
}

export function agruparPorResponsavel<T extends { cadastradoPor: string; nome: string }>(
  itens: readonly T[],
): GrupoPorResponsavel<T>[] {
  const grupos = new Map<string, GrupoPorResponsavel<T>>();
  for (const item of itens) {
    const chave = normalizeSearch(item.cadastradoPor);
    const grupo = grupos.get(chave) ?? { responsavel: item.cadastradoPor, itens: [] };
    grupo.itens.push(item);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, itens: [...g.itens].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) }))
    .sort(
      (a, b) =>
        b.itens.length - a.itens.length || a.responsavel.localeCompare(b.responsavel, 'pt-BR'),
    );
}

/** Uma barra do grafico por lideranca: quantas em cada categoria. */
export interface BarraPorResponsavel {
  responsavel: string;
  /** Na ordem das categorias. */
  quantidades: number[];
  total: number;
  /** Tamanho da base dessa lideranca, quando conhecido. */
  base: number | null;
}

/**
 * As barras do grafico: cada pessoa conta UMA vez por categoria em que
 * caiu. `categorias` diz, para cada item, em quais caiu (indices).
 */
export function barrasPorResponsavel<T extends { cadastradoPor: string }>(
  itens: readonly T[],
  totalDeCategorias: number,
  categorias: (item: T) => number[],
  base: Readonly<Record<string, number>> = {},
): BarraPorResponsavel[] {
  const porChave = new Map<string, BarraPorResponsavel>();
  for (const item of itens) {
    const chave = normalizeSearch(item.cadastradoPor);
    const barra = porChave.get(chave) ?? {
      responsavel: item.cadastradoPor,
      quantidades: Array.from({ length: totalDeCategorias }, () => 0),
      total: 0,
      base: base[item.cadastradoPor] ?? null,
    };
    for (const indice of categorias(item)) barra.quantidades[indice] += 1;
    barra.total += 1;
    porChave.set(chave, barra);
  }
  return [...porChave.values()].sort(
    (a, b) => b.total - a.total || a.responsavel.localeCompare(b.responsavel, 'pt-BR'),
  );
}

/**
 * Tamanho da base de cada responsavel, pelo mesmo texto que aparece em
 * "cadastrado por": e o denominador do "% da base" do grafico.
 */
export function basePorResponsavel(members: readonly Member[]): Record<string, number> {
  const base: Record<string, number> = {};
  // A mesma pessoa cadastrada duas vezes pelo mesmo responsavel conta uma.
  for (const member of contandoUmaVez(members)) {
    const quem = recruiterText(member.recruitedBy);
    base[quem] = (base[quem] ?? 0) + 1;
  }
  return base;
}

/**
 * Pessoas agrupadas pelo TELEFONE que dividem: o filtro "Telefone
 * compartilhado" se le por numero — quem sao as fichas por tras de cada um.
 * Numeros com mais fichas primeiro; dentro, ordem alfabetica.
 */
export function agruparPorTelefone<T extends { telefone: string; nome: string }>(
  itens: readonly T[],
): { telefone: string; itens: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const numero = normalizePhone(item.telefone ?? '');
    if (!numero) continue;
    grupos.set(numero, [...(grupos.get(numero) ?? []), item]);
  }
  return [...grupos.entries()]
    .map(([telefone, lista]) => ({
      telefone,
      itens: [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    }))
    .sort((a, b) => b.itens.length - a.itens.length || a.telefone.localeCompare(b.telefone));
}
