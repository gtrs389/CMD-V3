/**
 * Cor de cada candidato escolhido na votacao, na ordem da escolha: a mesma
 * no mapa, no raio-x e no PDF. Sem limite de candidatos: as quatro primeiras
 * sao a paleta categorica validada (a mesma da Sala de Apuracao), as oito
 * seguintes continuam distinguiveis entre si e, dai em diante, o tom gira
 * pelo angulo de ouro — dois vizinhos nunca saem parecidos. Com um candidato
 * so, a apuracao segue em ouro.
 */
export const CORES_DOS_CANDIDATOS = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#8b5cf6',
  '#e0457b',
  '#0ea5b7',
  '#7c8a16',
  '#b4532a',
  '#4f46e5',
  '#c026d3',
  '#475569',
] as const;

/** Angulo de ouro em graus: espalha os tons sem repetir vizinhos. */
const ANGULO_DE_OURO = 137.508;

/** A cor do candidato na posicao `i` da escolha (comeca em 0). */
export function corDoCandidato(i: number): string {
  if (i >= 0 && i < CORES_DOS_CANDIDATOS.length) return CORES_DOS_CANDIDATOS[i];
  const tom = Math.round((i * ANGULO_DE_OURO + 211) % 360);
  // Saturacao e luz alternam: dois tons proximos ainda se separam pelo brilho.
  const luz = i % 2 === 0 ? 0.46 : 0.38;
  return hslParaHex(tom, 0.68, luz);
}

/** Hex, e nao hsl(): o PDF e as transparencias (`${cor}33`) leem hex. */
function hslParaHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const canal = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${canal(0)}${canal(8)}${canal(4)}`;
}
