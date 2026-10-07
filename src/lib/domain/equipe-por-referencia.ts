import type { Member } from '@/lib/types';
import { SEM_REFERENCIA, chaveDaReferencia } from './filtros-da-equipe';
import { leaderKey } from './map-pin';
import { cadastrosRepetidos } from './inconsistencias';
import { recruiterText } from './recruitment';

/**
 * O time agrupado pela REFERENCIA: cada referencia com os Lideres dela, e
 * cada Lider com a Equipe dele. A Equipe herda a referencia do Lider — e a
 * forca de quem indicou o Lider, contada inteira.
 *
 * Modulo puro. `pessoas` e o recorte da tela (busca e filtros); `time` e o
 * time inteiro, de onde se acha o Lider de cada pessoa mesmo quando ele
 * ficou fora do recorte.
 *
 * CADA PESSOA UMA VEZ SO. A mesma pessoa cadastrada mais de uma vez (por
 * dois Lideres, ou como Lider e tambem na Equipe de outro) — pela regra de
 * repetidos das Inconsistencias, nos niveis "certa" e "provavel" (titulo,
 * CPF, nome e telefone, nome e secao) — aparece num lugar so: como Lider,
 * se um dos cadastros e de Lider; senao, no cadastro mais antigo. Os
 * outros cadastros viram a marca "repetido" nela. Homonimo (so o nome
 * igual) continua separado.
 */

export interface LiderNaReferencia {
  /** Nulo: pessoas da Equipe cujo Lider nao esta no time (cadastro orfao). */
  lider: Member | null;
  /** A Equipe dele dentro do recorte, da mais nova para a mais antiga. */
  equipe: Member[];
  /** O proprio Lider passa no recorte (busca, situacao...). */
  liderNoRecorte: boolean;
  /**
   * Pessoas desta linha cadastradas mais vezes: id -> quem mais cadastrou
   * ("Vivian · Líder"). Os outros cadastros nao aparecem de novo.
   */
  repetidos: Record<string, string[]>;
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
  /** Cadastros a mais da mesma pessoa, contados uma vez so neste grupo. */
  cadastrosRepetidos: number;
}

const porData = (a: Member, b: Member) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

export function equipePorReferencia(recorte: readonly Member[], time: readonly Member[]): GrupoDaReferencia[] {
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

  // A mesma pessoa em varios cadastros: um so fica (o "dono"); os outros saem.
  const dono = new Map<string, string>();
  const outrosDo = new Map<string, Member[]>();
  {
    const pai = new Map<string, string>();
    const raiz = (id: string): string => {
      const p = pai.get(id) ?? id;
      if (p === id) return id;
      const r = raiz(p);
      pai.set(id, r);
      return r;
    };
    const porId = new Map(time.map((m) => [m.id, m]));
    for (const grupo of cadastrosRepetidos(time)) {
      if (grupo.certeza === 'possivel') continue;
      const [primeiro, ...resto] = grupo.registros.map((r) => r.member.id);
      for (const id of resto) pai.set(raiz(id), raiz(primeiro));
    }
    const componentes = new Map<string, Member[]>();
    for (const id of pai.keys()) {
      const r = raiz(id);
      const m = porId.get(id);
      const lista = componentes.get(r) ?? [];
      if (m && !lista.includes(m)) lista.push(m);
      componentes.set(r, lista);
    }
    for (const [r, lista] of componentes) {
      const raizMembro = porId.get(r);
      if (raizMembro && !lista.includes(raizMembro)) lista.push(raizMembro);
      if (lista.length < 2) continue;
      // Quem fica: o cadastro de Lider, se houver; senao, o mais antigo.
      const ordem = [...lista].sort(
        (a, b) => Number(b.tier === 'LIDER') - Number(a.tier === 'LIDER') || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
      for (const m of ordem) dono.set(m.id, ordem[0].id);
      outrosDo.set(ordem[0].id, ordem.slice(1));
    }
  }
  // No recorte, a pessoa entra pelo dono — mesmo que so uma copia dela tenha
  // passado no filtro — e entra uma vez so.
  const porIdDoTime = new Map(time.map((m) => [m.id, m]));
  const pessoas: Member[] = [];
  const jaEntrou = new Set<string>();
  for (const m of recorte) {
    const id = dono.get(m.id) ?? m.id;
    if (jaEntrou.has(id)) continue;
    jaEntrou.add(id);
    pessoas.push(porIdDoTime.get(id) ?? m);
  }

  const noRecorte = new Set(pessoas.map((m) => m.id));
  const linhas = new Map<string, LiderNaReferencia>();
  const linha = (lider: Member | null) => {
    const k = lider?.id ?? '__orfaos__';
    let l = linhas.get(k);
    if (!l) {
      l = { lider, equipe: [], liderNoRecorte: lider ? noRecorte.has(lider.id) : false, repetidos: {} };
      linhas.set(k, l);
    }
    return l;
  };
  const contarRepetido = new Map<string, number>();
  for (const m of pessoas) {
    const l = m.tier === 'LIDER' ? linha(m) : linha(liderDe(m));
    if (m.tier !== 'LIDER') l.equipe.push(m);
    const outros = outrosDo.get(m.id);
    if (outros?.length) {
      // Quem mais cadastrou a mesma pessoa: o Lider (se a copia e de Lider) ou o responsavel.
      l.repetidos[m.id] = outros.map((o) => (o.tier === 'LIDER' ? `${o.name} · Líder` : recruiterText(o.recruitedBy)));
      const chave = (l.lider && chaveDaReferencia(l.lider)) || SEM_REFERENCIA;
      contarRepetido.set(chave, (contarRepetido.get(chave) ?? 0) + outros.length);
    }
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
        cadastrosRepetidos: contarRepetido.get(chave) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        Number(a.chave === SEM_REFERENCIA) - Number(b.chave === SEM_REFERENCIA) ||
        b.total - a.total ||
        a.rotulo.localeCompare(b.rotulo, 'pt-BR'),
    );
}
