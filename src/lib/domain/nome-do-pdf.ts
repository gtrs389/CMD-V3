/**
 * Nome do PDF de inconsistencias: `inconsistência_vivian.pdf`.
 *
 * So o primeiro nome, minusculo e sem acento — e como a equipe salva e manda
 * os arquivos. Quando outra pessoa da lista tem o mesmo primeiro nome, entra
 * a palavra seguinte (pulando "de", "da", "dos"...): `inconsistência_alex_araujo.pdf`,
 * para dois arquivos nunca terem o mesmo nome.
 */

const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function palavras(nome: string): string[] {
  return nome
    // "VIVIAN BEATRIZ · Líder": o perfil depois do ponto nao e nome.
    .split('·')[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export function nomeDoPdfDeInconsistencia(nome: string | null | undefined, outrosNomes: readonly string[] = []): string {
  return nomeDoPdf('inconsistência', nome, outrosNomes);
}

/** O mesmo jeito de nomear, com outro comeco: `equipe_vivian.pdf`. */
export function nomeDoPdf(
  prefixo: string,
  nome: string | null | undefined,
  outrosNomes: readonly string[] = [],
): string {
  const partes = palavras(nome ?? '');
  if (partes.length === 0) return `${prefixo}_time.pdf`;

  const primeiro = partes[0];
  const mesmoPrimeiroNome = outrosNomes
    .map(palavras)
    .filter((outro) => outro[0] === primeiro && outro.join(' ') !== partes.join(' ')).length;

  const segundo = partes.slice(1).find((parte) => !LIGACOES.has(parte));
  const curto = mesmoPrimeiroNome > 0 && segundo ? `${primeiro}_${segundo}` : primeiro;
  return `${prefixo}_${curto}.pdf`;
}
