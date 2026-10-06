import type { Member } from '@/lib/types';
import { normalizeSearch } from '@/lib/utils/text';

/**
 * Filtros da lista da Equipe que olham os dados da planilha: REFERÊNCIA,
 * VERIFICADO POR FOTO, zona e de onde a pessoa veio.
 *
 * As opcoes saem da PROPRIA lista, com a contagem de cada uma: referencia
 * que ninguem tem nao aparece, e escolher uma opcao nunca da lista vazia sem
 * motivo. O valor "todas"/"todos" nao filtra nada.
 */

export const SEM_REFERENCIA = '__sem_referencia__';
export const SEM_ZONA = '__sem_zona__';

export interface OpcaoDeFiltro {
  valor: string;
  rotulo: string;
  quantidade: number;
}

/** "Roberval", "ROBERVAL " e "roberval" sao a mesma referencia. */
export function chaveDaReferencia(member: Pick<Member, 'reference'>): string {
  return normalizeSearch(member.reference ?? '');
}

/**
 * Referencias da lista, da mais comum para a menos comum, e "Sem
 * referencia" por ultimo. O rotulo e a forma mais escrita de cada uma.
 */
export function opcoesDeReferencia(members: readonly Member[]): OpcaoDeFiltro[] {
  const grupos = new Map<string, { formas: Map<string, number>; quantidade: number }>();
  let sem = 0;

  for (const member of members) {
    const chave = chaveDaReferencia(member);
    if (!chave) {
      sem += 1;
      continue;
    }
    const grupo = grupos.get(chave) ?? { formas: new Map(), quantidade: 0 };
    const forma = (member.reference ?? '').trim();
    grupo.formas.set(forma, (grupo.formas.get(forma) ?? 0) + 1);
    grupo.quantidade += 1;
    grupos.set(chave, grupo);
  }

  const opcoes = [...grupos.entries()]
    .map(([valor, grupo]) => ({
      valor,
      rotulo: [...grupo.formas.entries()].sort((a, b) => b[1] - a[1])[0][0],
      quantidade: grupo.quantidade,
    }))
    .sort((a, b) => b.quantidade - a.quantidade || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  if (opcoes.length > 0 && sem > 0) {
    opcoes.push({ valor: SEM_REFERENCIA, rotulo: 'Sem referência', quantidade: sem });
  }
  return opcoes;
}

export function passaNaReferencia(member: Member, valor: string): boolean {
  if (valor === 'todas') return true;
  const chave = chaveDaReferencia(member);
  return valor === SEM_REFERENCIA ? !chave : chave === valor;
}

export type FiltroDeFoto = 'todos' | 'sim' | 'nao' | 'sem';

export function situacaoDaFoto(member: Pick<Member, 'photoVerified'>): Exclude<FiltroDeFoto, 'todos'> {
  if (member.photoVerified === true) return 'sim';
  if (member.photoVerified === false) return 'nao';
  return 'sem';
}

export function contarFotos(members: readonly Member[]): Record<Exclude<FiltroDeFoto, 'todos'>, number> {
  const contagem = { sim: 0, nao: 0, sem: 0 };
  for (const member of members) contagem[situacaoDaFoto(member)] += 1;
  return contagem;
}

export function passaNaFoto(member: Member, valor: FiltroDeFoto): boolean {
  return valor === 'todos' || situacaoDaFoto(member) === valor;
}

/** "010" e "10" sao a mesma zona. */
function chaveDaZona(member: Pick<Member, 'zone'>): string {
  const digitos = (member.zone ?? '').replace(/\D/g, '').replace(/^0+/, '');
  return digitos;
}

/** Zonas da lista, em ordem numerica, e "Sem zona" por ultimo. */
export function opcoesDeZona(members: readonly Member[]): OpcaoDeFiltro[] {
  const contagem = new Map<string, number>();
  let sem = 0;
  for (const member of members) {
    const zona = chaveDaZona(member);
    if (!zona) sem += 1;
    else contagem.set(zona, (contagem.get(zona) ?? 0) + 1);
  }
  const opcoes = [...contagem.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([valor, quantidade]) => ({ valor, rotulo: `Zona ${valor}`, quantidade }));
  if (opcoes.length > 0 && sem > 0) opcoes.push({ valor: SEM_ZONA, rotulo: 'Sem zona', quantidade: sem });
  return opcoes;
}

export function passaNaZona(member: Member, valor: string): boolean {
  if (valor === 'todas') return true;
  const zona = chaveDaZona(member);
  return valor === SEM_ZONA ? !zona : zona === valor;
}

export type FiltroDeOrigem = 'todas' | 'planilha' | 'sistema';

export function passaNaOrigem(member: Member, valor: FiltroDeOrigem): boolean {
  if (valor === 'todas') return true;
  return valor === 'planilha' ? member.fromSheet === true : member.fromSheet !== true;
}

/** "0240 5979 1708": o titulo como se le no papel. */
export function tituloLegivel(voterId: string | null | undefined): string | null {
  const digitos = (voterId ?? '').replace(/\D/g, '');
  if (!digitos) return null;
  return digitos.replace(/(\d{4})(?=\d)/g, '$1 ');
}
