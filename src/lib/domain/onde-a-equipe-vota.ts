import type { Member } from '@/lib/types';

/**
 * Onde a Equipe de um Lider vota: a escola de cada pessoa (pela zona e
 * secao do cadastro, na tabela de locais do TSE) e, juntando todo mundo,
 * as escolas, as zonas e as secoes onde ele tem gente.
 *
 * Modulo puro: os locais chegam prontos (`/api/clients/[id]/locais-de-votacao`)
 * e a conta e feita na tela, com a Equipe que a pagina ja tem.
 */

/** Um local de votacao do TSE: a escola e as secoes que funcionam nela. */
export interface LocalDeVotacao {
  id: string;
  nome: string;
  endereco: string | null;
  cidade: string | null;
  zona: number;
  secoes: number[];
}

/** "0010" e "10" sao a mesma zona; vazio ou texto vira nulo. */
export function numeroEleitoral(valor: string | number | null | undefined): number | null {
  const n = Number(String(valor ?? '').trim().replace(/^0+(?=\d)/, ''));
  return Number.isInteger(n) && n > 0 ? n : null;
}

const chave = (zona: number, secao: number) => `${zona}/${secao}`;

/** Zona/secao -> local, montado uma vez para a Equipe inteira. */
export function indiceDeLocais(locais: readonly LocalDeVotacao[]): Map<string, LocalDeVotacao> {
  const indice = new Map<string, LocalDeVotacao>();
  for (const local of locais) for (const s of local.secoes) indice.set(chave(local.zona, s), local);
  return indice;
}

/** A escola de quem tem esta zona e secao, ou nulo. */
export function localDaPessoa(
  indice: ReadonlyMap<string, LocalDeVotacao>,
  pessoa: Pick<Member, 'zone' | 'section'>,
): LocalDeVotacao | null {
  const zona = numeroEleitoral(pessoa.zone);
  const secao = numeroEleitoral(pessoa.section);
  return zona && secao ? (indice.get(chave(zona, secao)) ?? null) : null;
}

export interface EscolaDaEquipe {
  local: LocalDeVotacao;
  total: number;
  /** As secoes da escola com gente da Equipe, da que tem mais para a que tem menos. */
  secoes: { secao: number; total: number }[];
}

export interface OndeAEquipeVota {
  escolas: EscolaDaEquipe[];
  zonas: { zona: number; total: number }[];
  secoes: { zona: number; secao: number; total: number; local: LocalDeVotacao | null }[];
  /** Sem zona ou sem secao no cadastro: nao da para saber onde vota. */
  semZonaSecao: number;
  /** Com zona e secao, mas a secao nao esta na tabela de locais. */
  semLocal: number;
}

export function ondeAEquipeVota(
  equipe: readonly Pick<Member, 'zone' | 'section'>[],
  indice: ReadonlyMap<string, LocalDeVotacao>,
): OndeAEquipeVota {
  const escolas = new Map<string, { local: LocalDeVotacao; total: number; secoes: Map<number, number> }>();
  const zonas = new Map<number, number>();
  const secoes = new Map<string, { zona: number; secao: number; total: number; local: LocalDeVotacao | null }>();
  let semZonaSecao = 0;
  let semLocal = 0;

  for (const pessoa of equipe) {
    const zona = numeroEleitoral(pessoa.zone);
    const secao = numeroEleitoral(pessoa.section);
    if (!zona || !secao) {
      semZonaSecao += 1;
      continue;
    }
    zonas.set(zona, (zonas.get(zona) ?? 0) + 1);
    const local = indice.get(chave(zona, secao)) ?? null;
    const k = chave(zona, secao);
    const linha = secoes.get(k) ?? { zona, secao, total: 0, local };
    linha.total += 1;
    secoes.set(k, linha);
    if (!local) {
      semLocal += 1;
      continue;
    }
    const escola = escolas.get(local.id) ?? { local, total: 0, secoes: new Map<number, number>() };
    escola.total += 1;
    escola.secoes.set(secao, (escola.secoes.get(secao) ?? 0) + 1);
    escolas.set(local.id, escola);
  }

  return {
    escolas: [...escolas.values()]
      .map((e) => ({
        local: e.local,
        total: e.total,
        secoes: [...e.secoes.entries()].map(([secao, total]) => ({ secao, total })).sort((a, b) => b.total - a.total || a.secao - b.secao),
      }))
      .sort((a, b) => b.total - a.total || a.local.nome.localeCompare(b.local.nome, 'pt-BR')),
    zonas: [...zonas.entries()].map(([zona, total]) => ({ zona, total })).sort((a, b) => b.total - a.total || a.zona - b.zona),
    secoes: [...secoes.values()].sort((a, b) => a.zona - b.zona || a.secao - b.secao),
    semZonaSecao,
    semLocal,
  };
}
