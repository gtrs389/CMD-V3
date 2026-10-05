/**
 * Cor de cada candidato escolhido na votacao, na ordem da escolha: a mesma
 * no mapa, no raio-x e no PDF. Paleta categorica validada (a mesma da Sala
 * de Apuracao); com um candidato so, a apuracao segue em ouro.
 */
export const CORES_DOS_CANDIDATOS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'] as const;

/** Quantos candidatos de uma vez: a paleta tem quatro cores distinguiveis. */
export const MAXIMO_DE_CANDIDATOS = CORES_DOS_CANDIDATOS.length;
