import { digitosDoTelefone, isValidPhone, normalizePhone } from '@/lib/utils/phone';

/**
 * Completar telefone cadastrado pela metade — sem DDD, ou sem o 9 do
 * celular.
 *
 * A operacao e de Palmeira dos Indios/AL: todo numero sem DDD e 82. As
 * regras, e so elas:
 *
 *   8 digitos, celular (comeca de 6 a 9)   82 + 9 + numero   9924-7526      -> (82) 99924-7526
 *   8 digitos, fixo (comeca de 2 a 5)      82 + numero       3421-1234      -> (82) 3421-1234
 *   9 digitos, comeca com 9                82 + numero       99924-7526     -> (82) 99924-7526
 *   10 digitos, celular sem o 9            DDD + 9 + resto   (82) 9924-7526 -> (82) 99924-7526
 *
 * Fixo com DDD (10 digitos comecando de 2 a 5 depois do DDD) ja esta certo
 * e nao muda. Qualquer outra coisa — 7 digitos, 12 digitos — nao tem como
 * adivinhar: fica para correcao a mao.
 *
 * E uma SUGESTAO: a tela mostra antes e depois, e a pessoa confirma. O
 * servidor recalcula a partir do numero gravado, e nao confia no que a
 * tela manda.
 */

export const DDD_DA_OPERACAO = '82';

export type MotivoDaCorrecao = 'sem-ddd' | 'sem-nove' | 'sem-ddd-e-sem-nove';

export const MOTIVO_DA_CORRECAO: Record<MotivoDaCorrecao, string> = {
  'sem-ddd': 'Sem DDD',
  'sem-nove': 'Sem o 9 do celular',
  'sem-ddd-e-sem-nove': 'Sem DDD e sem o 9',
};

export interface Correcao {
  /** So digitos, pronto para gravar. */
  novo: string;
  motivo: MotivoDaCorrecao;
}

const celular = (primeiro: string) => primeiro >= '6' && primeiro <= '9';

export function completarTelefone(atual: string | null | undefined, ddd = DDD_DA_OPERACAO): Correcao | null {
  let d = (atual ?? '').replace(/\D/g, '');
  // "0 82 ..." (discagem com zero) e o mesmo numero.
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (!d) return null;

  let correcao: Correcao | null = null;
  if (d.length === 8) {
    correcao = celular(d[0])
      ? { novo: `${ddd}9${d}`, motivo: 'sem-ddd-e-sem-nove' }
      : { novo: `${ddd}${d}`, motivo: 'sem-ddd' };
  } else if (d.length === 9 && d[0] === '9') {
    correcao = { novo: `${ddd}${d}`, motivo: 'sem-ddd' };
  } else if (d.length === 10 && celular(d[2])) {
    correcao = { novo: `${d.slice(0, 2)}9${d.slice(2)}`, motivo: 'sem-nove' };
  }

  return correcao && isValidPhone(correcao.novo) ? correcao : null;
}

/**
 * O numero como deve ser GRAVADO: completo quando as regras sabem
 * completar, e so os digitos quando nao sabem. Todo cadastro e toda edicao
 * passam por aqui — o numero nasce certo.
 */
export function telefoneParaGravar(atual: string | null | undefined): string {
  return completarTelefone(atual)?.novo ?? digitosDoTelefone(atual ?? '');
}

/**
 * As formas de um numero digitado no LOGIN: como veio, completo, e — para
 * acessos antigos, gravados antes da correcao — sem o 9. Quem digitou do
 * jeito antigo ou do jeito novo entra do mesmo jeito.
 */
export function formasDoTelefone(digitado: string): string[] {
  const d = normalizePhone(digitado);
  const formas = new Set<string>();
  if (d.length >= 10) formas.add(d);
  const completo = completarTelefone(digitado)?.novo;
  if (completo) formas.add(completo);
  for (const f of [...formas]) {
    if (f.length === 11 && f[2] === '9' && f[3] >= '6') formas.add(`${f.slice(0, 2)}${f.slice(3)}`);
  }
  return [...formas];
}
