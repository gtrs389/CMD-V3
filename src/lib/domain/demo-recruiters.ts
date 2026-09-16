/**
 * Segunda camada do Time DEMO: quem da equipe tambem recruta.
 *
 * Um time real tem DUAS camadas de cadastro. O administrador cadastra gente
 * pelo link dele; parte dessa gente ganha o proprio link e cadastra mais
 * gente. O Time DEMO so tinha a primeira: as mil pessoas apareciam todas
 * como cadastradas pelo administrador, e o "Ranking de cadastros equipe"
 * ficava com a lista inteira zerada — justamente o quadro que a
 * demonstracao precisa mostrar cheio.
 *
 * Este modulo e PURO: decide QUEM recruta e QUANTOS cada um traz. Criar
 * usuario, gravar e desfazer sao do servico.
 */

/** Nenhum recrutador: o Time DEMO continua de uma camada so. */
export const DEMO_RECRUITERS_DEFAULT = 0;

/**
 * Teto de recrutadores.
 *
 * Nao e limite de banco: e o ponto a partir do qual o ranking deixa de ser
 * legivel numa tela. Passar disso nao demonstra melhor, so rola mais.
 */
export const DEMO_RECRUITERS_MAX = 50;

export interface RecruiterShare {
  /** Posicao do integrante na lista, entre os que viram recrutadores. */
  index: number;
  /** Quantos cadastros ficam com ele. */
  count: number;
}

/**
 * Quanto do time fica com a segunda camada.
 *
 * Nao e tudo: o administrador tem de continuar com cadastros proprios, ou a
 * demonstracao mostraria uma operacao onde quem administra nao trouxe
 * ninguem — o oposto do que acontece em campo, onde ele costuma ser o maior
 * cadastrador.
 */
const SHARE_OF_TEAM = 0.6;

/**
 * Divide os cadastros entre os recrutadores, de forma DESIGUAL.
 *
 * Desigual de proposito. Um ranking em que todos tem o mesmo numero nao
 * demonstra nada: o quadro existe para mostrar quem esta trazendo gente e
 * quem nao esta, e isso so aparece quando os numeros diferem. Os primeiros
 * trazem mais, a cauda traz pouco, e alguem fica em zero — que e como uma
 * equipe de verdade se distribui.
 *
 * Deterministico: os mesmos numeros entram, a mesma divisao sai. Refazer os
 * dados de um time nao embaralha o ranking sem motivo.
 *
 * @param disponiveis Cadastros que podem mudar de dono (todos menos os
 *                    proprios recrutadores, que continuam sendo do
 *                    administrador que os trouxe).
 */
export function shareAmongRecruiters(
  recruiters: number,
  disponiveis: number,
): RecruiterShare[] {
  if (recruiters <= 0 || disponiveis <= 0) return [];

  const total = Math.floor(disponiveis * SHARE_OF_TEAM);
  if (total <= 0) return [];

  // Peso decrescente: o primeiro pesa `recruiters`, o ultimo pesa 1.
  const pesos = Array.from({ length: recruiters }, (_, i) => recruiters - i);
  const somaPesos = pesos.reduce((soma, peso) => soma + peso, 0);

  const fatias = pesos.map((peso, index) => ({
    index,
    count: Math.floor((total * peso) / somaPesos),
  }));

  // A sobra do arredondamento vai para o primeiro: o total distribuido tem de
  // fechar com `total`, ou o numero do ranking nao bate com o do time.
  const distribuido = fatias.reduce((soma, fatia) => soma + fatia.count, 0);
  if (fatias.length > 0) fatias[0].count += total - distribuido;

  return fatias;
}

/** Quantos recrutadores cabem, dado o tamanho do time. */
export function clampRecruiters(pedido: number, pessoas: number): number {
  if (!Number.isFinite(pedido) || pedido <= 0) return 0;

  const inteiro = Math.trunc(pedido);
  // Nunca mais recrutadores do que gente: um recrutador E um integrante do
  // time, e nao pode recrutar a si mesmo.
  const teto = Math.min(DEMO_RECRUITERS_MAX, Math.max(0, pessoas - 1));
  return Math.min(inteiro, teto);
}
