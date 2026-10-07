import type { Member } from '@/lib/types';
import { SEM_REFERENCIA, chaveDaReferencia } from './filtros-da-equipe';
import { leaderKey } from './map-pin';

/**
 * O time agrupado pela REFERENCIA: cada referencia com os Lideres dela, e
 * cada Lider com a Equipe dele. A Equipe herda a referencia do Lider — e a
 * forca de quem indicou o Lider, contada inteira.
 *
 * Modulo puro. `pessoas` e o recorte da tela (busca e filtros); `time` e o
 * time inteiro, de onde se acha o Lider de cada pessoa mesmo quando ele
 * ficou fora do recorte.
 */

export interface LiderNaReferencia {
  /** Nulo: pessoas da Equipe cujo Lider nao esta no time (cadastro orfao). */
  lider: Member | null;
  /** A Equipe dele dentro do recorte, da mais nova para a mais antiga. */
  equipe: Member[];
  /** O proprio Lider passa no recorte (busca, situacao...). */
  liderNoRecorte: boolean;
}

export interface GrupoDaReferencia {
  /** Chave da referencia (`chaveDaReferencia`), ou `SEM_REFERENCIA`. */
  chave: string;
  /** A forma mais escrita; "Sem referência" sem ela. */
  rotulo: string;
  lideres: LiderNaReferencia[];
  /** Lideres (os do recorte ou com Equipe no recorte). */
  totalDeLideres: number;
  /** Pessoas da Equipe no recorte. */
  totalDaEquipe: number;
  /** Todo mundo do grupo no recorte: Lideres + Equipe. */
  total: number;
}

const porData = (a: Member, b: Member) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

export function equipePorReferencia(pessoas: readonly Member[], time: readonly Member[]): GrupoDaReferencia[] {
  // Os Lideres do time, pelo usuario (o que a Equipe guarda) e pelo nome.
  const lideresDoTime = time.filter((m) => m.tier === 'LIDER');
  const porUsuario = new Map<string, Member>();
  const porNome = new Map<string, Member>();
  for (const l of lideresDoTime) {
    if (l.userId) porUsuario.set(l.userId, l);
    const nome = leaderKey(null, l.name);
    if (nome && !porNome.has(nome)) porNome.set(nome, l);
  }
  const liderDe = (m: Member): Member | null =>
    (m.recruitedBy?.userId ? porUsuario.get(m.recruitedBy.userId) : undefined) ??
    porNome.get(leaderKey(null, m.recruitedBy?.name) ?? '') ??
    null;

  const noRecorte = new Set(pessoas.map((m) => m.id));
  const linhas = new Map<string, LiderNaReferencia>();
  const linha = (lider: Member | null) => {
    const k = lider?.id ?? '__orfaos__';
    let l = linhas.get(k);
    if (!l) {
      l = { lider, equipe: [], liderNoRecorte: lider ? noRecorte.has(lider.id) : false };
      linhas.set(k, l);
    }
    return l;
  };
  for (const m of pessoas) {
    if (m.tier === 'LIDER') linha(m);
    else linha(liderDe(m)).equipe.push(m);
  }

  const grupos = new Map<string, { formas: Map<string, number>; lideres: LiderNaReferencia[] }>();
  for (const l of linhas.values()) {
    const chave = (l.lider && chaveDaReferencia(l.lider)) || SEM_REFERENCIA;
    const g = grupos.get(chave) ?? { formas: new Map<string, number>(), lideres: [] };
    const forma = l.lider?.reference?.replace(/\s+/g, ' ').trim();
    if (forma) g.formas.set(forma, (g.formas.get(forma) ?? 0) + 1);
    l.equipe.sort(porData);
    g.lideres.push(l);
    grupos.set(chave, g);
  }

  return [...grupos.entries()]
    .map(([chave, g]) => {
      const lideres = g.lideres.sort(
        (a, b) =>
          Number(a.lider === null) - Number(b.lider === null) ||
          b.equipe.length - a.equipe.length ||
          (a.lider?.name ?? '').localeCompare(b.lider?.name ?? '', 'pt-BR'),
      );
      const totalDaEquipe = lideres.reduce((t, l) => t + l.equipe.length, 0);
      const totalDeLideres = lideres.filter((l) => l.lider).length;
      return {
        chave,
        rotulo: chave === SEM_REFERENCIA ? 'Sem referência' : ([...g.formas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? chave),
        lideres,
        totalDeLideres,
        totalDaEquipe,
        total: totalDaEquipe + lideres.filter((l) => l.liderNoRecorte).length,
      };
    })
    .sort(
      (a, b) =>
        Number(a.chave === SEM_REFERENCIA) - Number(b.chave === SEM_REFERENCIA) ||
        b.total - a.total ||
        a.rotulo.localeCompare(b.rotulo, 'pt-BR'),
    );
}
