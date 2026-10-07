import type { LiderNoRaioX } from './confronto';
import type { SecaoNoDuelo } from './sala-de-confronto';

/**
 * O radar do NEO na Sala de Confronto: le o duelo da escola secao por secao
 * e aponta o que um olho treinado apontaria.
 *
 *   ESPELHO     o time tinha N pessoas na secao, o nosso candidato quase
 *               nada e o adversario quase exatamente N. A conta bate demais
 *               para ser acaso: a gente do time pode ter votado nele.
 *   ZERADA      o time tinha gente na secao e o nosso candidato teve zero.
 *   TOMADA      o nosso ficou bem abaixo da gente do time, e o adversario
 *               levou perto (ou mais) do que era a gente do time.
 *   DOBRADINHA  dois candidatos nossos de cargos diferentes: um foi bem e o
 *               outro sumiu, na mesma secao. A gente votou num e nao no outro.
 *   SUPERACAO   o nosso passou bem da gente do time: voto de fora do cadastro.
 *
 * E a TENDENCIA: onde o time tem mais gente, quem cresce junto — o nosso
 * candidato ou o adversario? (correlacao de Pearson, secao por secao.)
 *
 * Modulo puro e deterministico: os mesmos numeros, os mesmos achados. O
 * NEO (a IA) recebe isto pronto para conversar; sem a IA, o radar sozinho
 * ja responde.
 */

export interface CandidatoNoRadar {
  nome: string;
  cargo: string | null;
  numero: string | null;
}

export type TipoDeAchado = 'ESPELHO' | 'ZERADA' | 'TOMADA' | 'DOBRADINHA' | 'SUPERACAO';
export type Gravidade = 'alta' | 'media' | 'boa';

export interface Achado {
  tipo: TipoDeAchado;
  gravidade: Gravidade;
  /** A secao (`zona/secao`) do achado: o "print" mostra ela. */
  secao: string;
  zona: string | null;
  numeroDaSecao: string | null;
  titulo: string;
  texto: string;
  /** O Lider com mais gente na secao (quem cobrar), quando ha. */
  lider: { nome: string; pessoas: number } | null;
  /** Ordena: maior primeiro. */
  peso: number;
}

export interface TendenciaDoCandidato {
  nome: string;
  lado: 'nosso' | 'adversario';
  /** Correlacao entre a gente do time e os votos dele, secao por secao (-1 a 1). Nula com poucas secoes. */
  correlacao: number | null;
  votos: number;
  /** Votos para cada pessoa do time, na escola (%). */
  conversao: number | null;
}

export interface Radar {
  achados: Achado[];
  tendencias: TendenciaDoCandidato[];
  /** O adversario acompanha a gente do time mais do que o nosso candidato. */
  alertaDeTendencia: { nosso: string; adversario: string; rNosso: number; rAdversario: number } | null;
  /** Secoes onde algum adversario teve EXATAMENTE o numero de pessoas do time. */
  coincidenciasExatas: string[];
  secoesComGente: number;
  estimativa: number;
}

const GENTE_MINIMA = 5;

/** Correlacao de Pearson; nula sem variacao ou com menos de 4 pontos. */
export function correlacao(x: readonly number[], y: readonly number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 4) return null;
  const mx = x.reduce((t, v) => t + v, 0) / n;
  const my = y.reduce((t, v) => t + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

const curto = (c: CandidatoNoRadar) => c.nome.split(/\s+/).slice(0, 2).join(' ');
const comCargo = (c: CandidatoNoRadar) => (c.cargo ? `${curto(c)} (${c.cargo})` : curto(c));
const rotuloDaSecao = (s: Pick<SecaoNoDuelo, 'secao' | 'zona'>) => `Seção ${s.secao ?? '?'} · Zona ${s.zona ?? '?'}`;
const pessoas = (n: number) => `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`;
const votos = (n: number) => `${n} ${n === 1 ? 'voto' : 'votos'}`;

export function radarDoNeo({
  secoes,
  esquerda,
  direita,
  lideres = [],
}: {
  secoes: readonly SecaoNoDuelo[];
  esquerda: readonly CandidatoNoRadar[];
  direita: readonly CandidatoNoRadar[];
  lideres?: readonly Pick<LiderNoRaioX, 'nome' | 'porSecao'>[];
}): Radar {
  const achados: Achado[] = [];
  const liderDa = (chave: string) => {
    const melhor = lideres
      .map((l) => ({ nome: l.nome, pessoas: l.porSecao[chave] ?? 0 }))
      .filter((x) => x.pessoas > 0)
      .sort((a, b) => b.pessoas - a.pessoas)[0];
    return melhor ?? null;
  };

  for (const s of secoes) {
    const est = s.estimativa;
    if (est < GENTE_MINIMA) {
      // Sem gente o bastante para cobrar: so a superacao interessa.
      continue;
    }
    const lider = liderDa(s.chave);
    const base = { secao: s.chave, zona: s.zona, numeroDaSecao: s.secao, lider };
    const doLider = lider ? ` A gente desta seção é principalmente de ${lider.nome} (${lider.pessoas} de ${est}).` : '';

    esquerda.forEach((nosso, i) => {
      const v = s.esquerda[i] ?? 0;
      // ESPELHO: o adversario com o numero da gente do time.
      const espelho = direita
        .map((adv, j) => ({ adv, v: s.direita[j] ?? 0 }))
        .filter((x) => x.v > 0 && Math.abs(x.v - est) <= Math.max(1, Math.round(est * 0.15)))
        .sort((a, b) => Math.abs(a.v - est) - Math.abs(b.v - est))[0];
      if (espelho && v <= Math.max(1, Math.floor(est * 0.1))) {
        const exato = espelho.v === est;
        achados.push({
          ...base,
          tipo: 'ESPELHO',
          gravidade: 'alta',
          titulo: `${rotuloDaSecao(s)}: ${exato ? 'a conta bateu exata' : 'a conta quase bateu'}`,
          texto:
            `O time tinha ${pessoas(est)} votando aqui. ${comCargo(nosso)} teve ${votos(v)}, e ${comCargo(espelho.adv)} teve ${votos(espelho.v)}` +
            `${exato ? ' — exatamente a gente do time' : ' — praticamente a gente do time'}. Isso não parece acaso: a gente cadastrada pode ter votado no adversário.${doLider}`,
          peso: 1000 + est * 2 + (exato ? 50 : 0),
        });
        return;
      }
      if (v === 0) {
        achados.push({
          ...base,
          tipo: 'ZERADA',
          gravidade: 'alta',
          titulo: `${rotuloDaSecao(s)}: ${curto(nosso)} zerou`,
          texto: `O time tinha ${pessoas(est)} votando aqui e ${comCargo(nosso)} não teve nenhum voto.${doLider}`,
          peso: 800 + est,
        });
        return;
      }
      const maiorAdv = direita
        .map((adv, j) => ({ adv, v: s.direita[j] ?? 0 }))
        .sort((a, b) => b.v - a.v)[0];
      if (maiorAdv && v < est * 0.3 && maiorAdv.v >= est * 0.8) {
        achados.push({
          ...base,
          tipo: 'TOMADA',
          gravidade: 'media',
          titulo: `${rotuloDaSecao(s)}: o adversário levou a seção`,
          texto: `${comCargo(nosso)} teve ${votos(v)} onde o time tinha ${pessoas(est)}; ${comCargo(maiorAdv.adv)} teve ${votos(maiorAdv.v)}.${doLider}`,
          peso: 500 + (maiorAdv.v - v),
        });
        return;
      }
      if (v >= est * 1.3 && v - est >= 3) {
        achados.push({
          ...base,
          tipo: 'SUPERACAO',
          gravidade: 'boa',
          titulo: `${rotuloDaSecao(s)}: ${curto(nosso)} passou da gente do time`,
          texto: `${comCargo(nosso)} teve ${votos(v)} com ${pessoas(est)} do time aqui: ${v - est} a mais, voto de fora do cadastro.`,
          peso: 100 + (v - est),
        });
      }
    });

    // DOBRADINHA: entre os nossos, um foi bem e o outro sumiu.
    for (let a = 0; a < esquerda.length; a++) {
      for (let b = 0; b < esquerda.length; b++) {
        if (a === b || esquerda[a].cargo === esquerda[b].cargo) continue;
        const va = s.esquerda[a] ?? 0;
        const vb = s.esquerda[b] ?? 0;
        if (va >= est * 0.7 && vb <= est * 0.2 && vb > 0) {
          achados.push({
            ...base,
            tipo: 'DOBRADINHA',
            gravidade: 'media',
            titulo: `${rotuloDaSecao(s)}: dobradinha quebrada`,
            texto: `Aqui a gente votou em ${comCargo(esquerda[a])} (${votos(va)}), mas não em ${comCargo(esquerda[b])} (${votos(vb)}), com ${pessoas(est)} do time na seção.${doLider}`,
            peso: 400 + (va - vb),
          });
        }
      }
    }
  }

  // A TENDENCIA: quem cresce junto com a gente do time.
  const comNumero = secoes.filter((s) => s.zona || s.secao);
  const x = comNumero.map((s) => s.estimativa);
  const estimativa = comNumero.reduce((t, s) => t + s.estimativa, 0);
  const tendencias: TendenciaDoCandidato[] = [
    ...esquerda.map((c, i) => ({ c, lado: 'nosso' as const, ys: comNumero.map((s) => s.esquerda[i] ?? 0) })),
    ...direita.map((c, j) => ({ c, lado: 'adversario' as const, ys: comNumero.map((s) => s.direita[j] ?? 0) })),
  ].map(({ c, lado, ys }) => {
    const total = ys.reduce((t, v) => t + v, 0);
    return {
      nome: c.nome,
      lado,
      correlacao: correlacao(x, ys),
      votos: total,
      conversao: estimativa > 0 ? (total / estimativa) * 100 : null,
    };
  });
  const melhorNosso = tendencias.filter((t) => t.lado === 'nosso' && t.correlacao !== null).sort((a, b) => b.correlacao! - a.correlacao!)[0];
  const melhorAdv = tendencias.filter((t) => t.lado === 'adversario' && t.correlacao !== null).sort((a, b) => b.correlacao! - a.correlacao!)[0];
  const alertaDeTendencia =
    melhorAdv && melhorAdv.correlacao! >= 0.5 && (!melhorNosso || melhorAdv.correlacao! - (melhorNosso.correlacao ?? 0) >= 0.25)
      ? { nosso: melhorNosso?.nome ?? esquerda[0]?.nome ?? '', adversario: melhorAdv.nome, rNosso: melhorNosso?.correlacao ?? 0, rAdversario: melhorAdv.correlacao! }
      : null;

  const coincidenciasExatas = comNumero
    .filter((s) => s.estimativa >= 3 && s.direita.some((v) => v === s.estimativa))
    .map((s) => s.chave);

  return {
    achados: achados.sort((a, b) => b.peso - a.peso),
    tendencias,
    alertaDeTendencia,
    coincidenciasExatas,
    secoesComGente: comNumero.filter((s) => s.estimativa > 0).length,
    estimativa,
  };
}

/** "NIVALDO (15123) · Deputado Estadual · 1º turno" -> o candidato do radar. */
export function candidatoDoRotulo(nome: string, rotulo: string): CandidatoNoRadar {
  const [quem, cargo] = rotulo.split(' · ');
  return { nome, cargo: cargo ?? null, numero: quem?.match(/\((\d+)\)/)?.[1] ?? null };
}
