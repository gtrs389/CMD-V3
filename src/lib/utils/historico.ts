/**
 * Mexer no endereco da pagina sem navegar — e sem brigar com o Next.
 *
 * O Next guarda as chaves dele (`__NA`, a arvore da pagina) em
 * `history.state`. Um `replaceState` feito COM essas chaves passa direto,
 * sem o Next saber que o endereco mudou; na proxima renderizacao do
 * roteador ele devolve o endereco antigo. Feito SEM elas, o Next as copia
 * de volta e passa a conhecer o endereco novo. Por isso estas funcoes
 * sempre tiram as chaves do Next antes de gravar.
 */

/** O estado da entrada atual do historico, sem as chaves internas do Next. */
export function estadoProprio(): Record<string, unknown> {
  const atual = { ...((window.history.state as Record<string, unknown> | null) ?? {}) };
  delete atual.__NA;
  delete atual.__PRIVATE_NEXTJS_INTERNALS_TREE;
  return atual;
}

/**
 * Troca parametros do endereco atual, na MESMA entrada do historico (sem
 * criar um "voltar" a mais). `null` apaga o parametro. Devolve se mudou.
 */
export function trocarParametros(
  parametros: Record<string, string | null>,
  estado: Record<string, unknown> = estadoProprio(),
): boolean {
  const url = new URL(window.location.href);
  let mudou = false;
  for (const [nome, valor] of Object.entries(parametros)) {
    if (url.searchParams.get(nome) === valor) continue;
    if (valor === null) url.searchParams.delete(nome);
    else url.searchParams.set(nome, valor);
    mudou = true;
  }
  if (!mudou) return false;
  window.history.replaceState(estado, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
}
