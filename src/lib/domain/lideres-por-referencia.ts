import type { Member } from '@/lib/types';
import { SEM_REFERENCIA, chaveDaReferencia, opcoesDeReferencia, type OpcaoDeFiltro } from './filtros-da-equipe';

/**
 * PDF "Líderes por referência": as regras puras.
 *
 * Quem entra (so os Lideres do time), com que referencia (a forma mais
 * escrita dela, para "ROBERVAL" e "Roberval" sairem iguais), em que ordem
 * (alfabetica, pelo nome) e quais referencias a pessoa escolheu levar.
 */

export interface LiderComReferencia {
  id: string;
  nome: string;
  /** O rotulo da referencia, ou nulo sem referencia. */
  referencia: string | null;
  /** A chave da referencia (`SEM_REFERENCIA` sem ela): e o que se escolhe. */
  chave: string;
}

export interface GrupoDeReferencia {
  chave: string;
  rotulo: string;
  lideres: LiderComReferencia[];
}

/** Ordem alfabetica do portugues: sem diferenciar acento nem maiuscula. */
export function emOrdemAlfabetica(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true });
}

/** As referencias dos Lideres, em ordem alfabetica, e "Sem referência" por ultimo. */
export function referenciasDosLideres(members: readonly Member[]): OpcaoDeFiltro[] {
  const lideres = members.filter((m) => m.tier === 'LIDER');
  const opcoes = opcoesDeReferencia(lideres);
  const com = opcoes.filter((o) => o.valor !== SEM_REFERENCIA).sort((a, b) => emOrdemAlfabetica(a.rotulo, b.rotulo));
  const semQuantos = lideres.filter((m) => !chaveDaReferencia(m)).length;
  // Nenhum Lider com referencia: "Sem referência" ainda aparece, para o PDF
  // poder sair com todos eles.
  return semQuantos > 0 ? [...com, { valor: SEM_REFERENCIA, rotulo: 'Sem referência', quantidade: semQuantos }] : com;
}

/** Todos os Lideres do time, com a referencia de cada um, em ordem alfabetica. */
export function lideresComReferencia(members: readonly Member[]): LiderComReferencia[] {
  const rotulos = new Map(referenciasDosLideres(members).map((o) => [o.valor, o.rotulo]));
  return members
    .filter((m) => m.tier === 'LIDER')
    .map((m) => {
      const chave = chaveDaReferencia(m) || SEM_REFERENCIA;
      return {
        id: m.id,
        nome: m.name.replace(/\s+/g, ' ').trim(),
        referencia: chave === SEM_REFERENCIA ? null : (rotulos.get(chave) ?? (m.reference ?? '').trim()),
        chave,
      };
    })
    .sort((a, b) => emOrdemAlfabetica(a.nome, b.nome) || a.id.localeCompare(b.id));
}

/** So os Lideres das referencias escolhidas, na mesma ordem. */
export function lideresDasReferencias(
  lideres: readonly LiderComReferencia[],
  escolhidas: ReadonlySet<string>,
): LiderComReferencia[] {
  return lideres.filter((l) => escolhidas.has(l.chave));
}

/**
 * Um grupo por referencia, em ordem alfabetica ("Sem referência" por
 * ultimo), com os Lideres de cada uma em ordem alfabetica.
 */
export function agruparPorReferencia(lideres: readonly LiderComReferencia[]): GrupoDeReferencia[] {
  const grupos = new Map<string, GrupoDeReferencia>();
  for (const l of lideres) {
    const grupo = grupos.get(l.chave) ?? { chave: l.chave, rotulo: l.referencia ?? 'Sem referência', lideres: [] };
    grupo.lideres.push(l);
    grupos.set(l.chave, grupo);
  }
  return [...grupos.values()].sort(
    (a, b) =>
      Number(a.chave === SEM_REFERENCIA) - Number(b.chave === SEM_REFERENCIA) || emOrdemAlfabetica(a.rotulo, b.rotulo),
  );
}

/** "lideres-por-referencia-roberval-e-mais-2.pdf" */
export function nomeDoPdfDeLideres(rotulos: readonly string[]): string {
  const limpo = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const base = 'lideres-por-referencia';
  if (rotulos.length === 0) return `${base}.pdf`;
  const primeira = limpo(rotulos[0]) || 'referencia';
  return rotulos.length === 1 ? `${base}-${primeira}.pdf` : `${base}-${primeira}-e-mais-${rotulos.length - 1}.pdf`;
}
