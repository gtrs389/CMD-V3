import type { Member } from '@/lib/types';
import type { PlaceMember, PollingPlacePin, SectionVotes } from './map-pin';
import { sectionKey, sectionVotes } from './map-pin';
import { rankPlaces } from './map-filters';
import { contandoUmaVez } from './inconsistencias';

/**
 * Votos por escola, zona e secao — do time e de cada Lider.
 *
 * Modulo puro: e dele que saem os PDFs "Onde voce tem mais votos" e
 * "Ranking dos Lideres". A regra e a mesma do mapa: uma pessoa cadastrada
 * que vota no local, um voto.
 *
 * COMO A PESSOA CHEGA NA ESCOLA. Cada secao eleitoral funciona em UM local de
 * votacao. O mapa ja sabe, de cada escola, quais secoes votam la; entao a
 * zona + secao do cadastro aponta a escola — sem consulta nova, e valendo
 * tambem para quem veio da planilha.
 */

/** "Zona 10 · Seção 144", com a mesma normalizacao do mapa ("07" = "7"). */
const zonaLimpa = (zona: string | null | undefined) => (zona ?? '').trim().replace(/^0+(?=\d)/, '');

/* -------------------------------------------------------------------------
   O time inteiro: escolas e zonas
   ------------------------------------------------------------------------- */

export interface EscolaNoRanking {
  posicao: number;
  place: PollingPlacePin;
  votos: number;
  /** Fracao do total do recorte (0 a 1). */
  fatia: number;
  secoes: SectionVotes[];
}

export interface ZonaNoRanking {
  zona: string;
  votos: number;
  escolas: number;
  secoes: number;
  /** A escola com mais votos dentro da zona. */
  escolaForte: string | null;
}

export interface SecaoNoRanking {
  posicao: number;
  zona: string;
  secao: string;
  votos: number;
  /** Fracao do total do recorte (0 a 1). */
  fatia: number;
  /** O local de votacao onde a secao funciona. */
  local: string;
  municipio: string | null;
}

export interface RankingDeVotos {
  total: number;
  escolas: EscolaNoRanking[];
  zonas: ZonaNoRanking[];
  /** TODAS as secoes com voto, da que tem mais para a que tem menos. */
  secoes: SecaoNoRanking[];
  totalDeSecoes: number;
}

/** As escolas do recorte, da que tem mais voto para a que tem menos, e as zonas. */
export function rankingDeVotos(places: readonly PollingPlacePin[], zona: string | null = null): RankingDeVotos {
  const alvo = zona ? zonaLimpa(zona) : null;
  const ranqueadas = rankPlaces(places, zona).filter((item) => item.votes > 0);
  const total = ranqueadas.reduce((soma, item) => soma + item.votes, 0);

  const escolas: EscolaNoRanking[] = ranqueadas.map((item) => ({
    posicao: item.position,
    place: item.place,
    votos: item.votes,
    fatia: total ? item.votes / total : 0,
    secoes: sectionVotes(item.place).filter((linha) => !alvo || zonaLimpa(linha.zone) === alvo),
  }));

  const porZona = new Map<string, { votos: number; escolas: Map<string, number>; secoes: Set<string> }>();
  for (const escola of escolas) {
    for (const linha of escola.secoes) {
      const chave = zonaLimpa(linha.zone) || 'Sem zona';
      const atual = porZona.get(chave) ?? { votos: 0, escolas: new Map(), secoes: new Set() };
      atual.votos += linha.total;
      const titulo = escola.place.title ?? 'Local de votação';
      atual.escolas.set(titulo, (atual.escolas.get(titulo) ?? 0) + linha.total);
      if (linha.section) atual.secoes.add(sectionKey(linha));
      porZona.set(chave, atual);
    }
  }

  const zonas = [...porZona.entries()]
    .map(([chave, dados]) => ({
      zona: chave,
      votos: dados.votos,
      escolas: dados.escolas.size,
      secoes: dados.secoes.size,
      escolaForte: [...dados.escolas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    }))
    .sort((a, b) => b.votos - a.votos || a.zona.localeCompare(b.zona, 'pt-BR', { numeric: true }));

  const secoes = escolas
    .flatMap((escola) =>
      escola.secoes
        .filter((linha) => linha.section && linha.total > 0)
        .map((linha) => ({
          zona: zonaLimpa(linha.zone) || '?',
          secao: (linha.section ?? '').trim().replace(/^0+(?=\d)/, ''),
          votos: linha.total,
          local: escola.place.title ?? 'Local de votação',
          municipio: [escola.place.city, escola.place.state].filter(Boolean).join('/') || null,
        })),
    )
    .sort(
      (a, b) =>
        b.votos - a.votos ||
        a.zona.localeCompare(b.zona, 'pt-BR', { numeric: true }) ||
        a.secao.localeCompare(b.secao, 'pt-BR', { numeric: true }),
    )
    .map((linha, i) => ({ ...linha, posicao: i + 1, fatia: total ? linha.votos / total : 0 }));

  return {
    total,
    escolas,
    zonas,
    secoes,
    totalDeSecoes: zonas.reduce((soma, z) => soma + z.secoes, 0),
  };
}

/* -------------------------------------------------------------------------
   Cada Lider: onde a Equipe dele vota
   ------------------------------------------------------------------------- */

export interface LinhaContada {
  rotulo: string;
  votos: number;
  /** Detalhe da linha: a cidade da escola, a escola da secao... */
  detalhe?: string | null;
}

export interface LiderNoRanking {
  posicao: number;
  lider: Member;
  /** Tamanho da Equipe (a mesma pessoa repetida pelo Lider conta uma vez). */
  equipe: number;
  /** Fracao de todos os liderados do time (0 a 1). */
  fatia: number;
  escolas: LinhaContada[];
  zonas: LinhaContada[];
  secoes: LinhaContada[];
  /** Da Equipe, quantos tem escola identificada pela zona e secao. */
  comEscola: number;
  /** Sem zona e secao no cadastro: nao da para saber onde votam. */
  semSecao: number;
}

export interface RankingDeLideres {
  lideres: LiderNoRanking[];
  totalDeLiderados: number;
  comEquipe: number;
}

/** Secao -> escola, a partir das escolas do mapa. */
export function escolaDaSecao(places: readonly PollingPlacePin[]): Map<string, PollingPlacePin> {
  const mapa = new Map<string, PollingPlacePin>();
  for (const place of places) {
    for (const linha of place.sections) {
      if (!linha.zone || !linha.section) continue;
      const chave = sectionKey(linha);
      const atual = mapa.get(chave);
      // A mesma secao em duas escolas (endereco duplicado no mapa): vale a
      // que tem mais gente cadastrada nela.
      const votosAtual = atual?.sections.find((s) => sectionKey(s) === chave)?.total ?? -1;
      if (!atual || linha.total > votosAtual) mapa.set(chave, place);
    }
  }
  return mapa;
}

const contar = (mapa: Map<string, LinhaContada>, chave: string, rotulo: string, detalhe?: string | null) => {
  const atual = mapa.get(chave) ?? { rotulo, votos: 0, detalhe };
  atual.votos += 1;
  mapa.set(chave, atual);
};
const ordenar = (mapa: Map<string, LinhaContada>) =>
  [...mapa.values()].sort((a, b) => b.votos - a.votos || a.rotulo.localeCompare(b.rotulo, 'pt-BR', { numeric: true }));

/**
 * O ranking dos Lideres pelo tamanho da Equipe, e de cada um: em quais
 * escolas, zonas e secoes a Equipe dele vota.
 */
export function rankingDeLideres(
  members: readonly Member[],
  places: readonly PollingPlacePin[],
): RankingDeLideres {
  const contados = contandoUmaVez(members);
  const porSecao = escolaDaSecao(places);
  const lideres = contados.filter((m) => m.tier === 'LIDER');

  const linhas = lideres.map((lider) => {
    const equipe = lider.userId ? contados.filter((m) => m.recruitedBy?.userId === lider.userId) : [];
    const escolas = new Map<string, LinhaContada>();
    const zonas = new Map<string, LinhaContada>();
    const secoes = new Map<string, LinhaContada>();
    let semSecao = 0;
    let comEscola = 0;

    for (const pessoa of equipe) {
      const zona = zonaLimpa(pessoa.zone);
      const secao = (pessoa.section ?? '').trim();
      if (!zona && !secao) {
        semSecao += 1;
        continue;
      }
      if (zona) contar(zonas, zona, `Zona ${zona}`);
      if (zona && secao) {
        const chave = sectionKey({ zone: zona, section: secao });
        const escola = porSecao.get(chave) ?? null;
        contar(secoes, chave, `Zona ${zona} · Seção ${secao.replace(/^0+(?=\d)/, '')}`, escola?.title ?? null);
        if (escola) {
          comEscola += 1;
          contar(
            escolas,
            escola.locationId,
            escola.title ?? 'Local de votação',
            [escola.city, escola.state].filter(Boolean).join('/') || null,
          );
        }
      }
    }

    return { lider, equipe: equipe.length, escolas: ordenar(escolas), zonas: ordenar(zonas), secoes: ordenar(secoes), comEscola, semSecao };
  });

  const totalDeLiderados = linhas.reduce((soma, l) => soma + l.equipe, 0);
  const ordenadas = linhas.sort((a, b) => b.equipe - a.equipe || a.lider.name.localeCompare(b.lider.name, 'pt-BR'));

  return {
    lideres: ordenadas.map((linha, i) => ({
      ...linha,
      posicao: i + 1,
      fatia: totalDeLiderados ? linha.equipe / totalDeLiderados : 0,
    })),
    totalDeLiderados,
    comEquipe: ordenadas.filter((l) => l.equipe > 0).length,
  };
}

/* -------------------------------------------------------------------------
   Quem vota em cada escola: a pessoa, a zona, a secao e o Lider dela
   ------------------------------------------------------------------------- */

export interface PessoaNaEscola {
  id: string;
  nome: string;
  zona: string | null;
  secao: string | null;
  /** O Lider de quem e da Equipe. Nulo no proprio Lider ou sem origem. */
  lider: string | null;
  ehLider: boolean;
}

export interface EscolaComPessoas {
  escola: EscolaNoRanking;
  pessoas: PessoaNaEscola[];
}

export interface PessoasPorEscola {
  escolas: EscolaComPessoas[];
  totalDePessoas: number;
  /** Lideres diferentes com alguem da Equipe na lista. */
  lideres: number;
}

const secaoLimpa = (secao: string | null | undefined) => (secao ?? '').trim().replace(/^0+(?=\d)/, '');

/**
 * As pessoas de cada escola do ranking, na ordem do ranking.
 *
 * Com zona escolhida, so quem vota nela entra: e o mesmo recorte do
 * ranking. Dentro da escola, a lista segue zona, secao e nome — e assim que
 * a campanha divide o trabalho no dia, secao por secao.
 */
export function pessoasPorEscola(
  ranking: RankingDeVotos,
  pessoasDoLocal: ReadonlyMap<string, readonly PlaceMember[]>,
  zona: string | null = null,
): PessoasPorEscola {
  const alvo = zona ? zonaLimpa(zona) : null;
  const porNumero = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

  const escolas = ranking.escolas.map((escola) => {
    const pessoas = (pessoasDoLocal.get(escola.place.locationId) ?? [])
      .filter((p) => !alvo || zonaLimpa(p.zone) === alvo)
      .map((p) => ({
        id: p.memberId,
        nome: p.name,
        zona: zonaLimpa(p.zone) || null,
        secao: secaoLimpa(p.section) || null,
        lider: p.tier === 'EQUIPE' ? p.lider : null,
        ehLider: p.tier === 'LIDER',
      }))
      .sort(
        (a, b) =>
          // Sem zona/secao vai para o fim: e o resto, nao uma secao.
          Number(!a.zona && !a.secao) - Number(!b.zona && !b.secao) ||
          porNumero(a.zona ?? '', b.zona ?? '') ||
          porNumero(a.secao ?? '', b.secao ?? '') ||
          a.nome.localeCompare(b.nome, 'pt-BR'),
      );
    return { escola, pessoas };
  });

  const todas = escolas.flatMap((e) => e.pessoas);
  return {
    escolas,
    totalDePessoas: todas.length,
    lideres: new Set(todas.map((p) => p.lider).filter(Boolean)).size,
  };
}
