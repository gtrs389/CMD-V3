/**
 * Abas da pagina do time.
 *
 * Modulo comum, SEM `'use client'`: a pagina (Server Component) precisa
 * conferir o parametro `aba` da URL antes de renderizar, e uma funcao
 * exportada de um modulo cliente nao pode ser chamada no servidor.
 *
 * O convite deixou de ser aba: o link de cadastro abre em dialogo.
 *
 * "Formulário" e "Questionário" sao coisas diferentes: o primeiro e o
 * cadastro, que transforma quem responde em integrante; o segundo e a
 * pesquisa que a equipe envia para outras pessoas, e quem responde nao entra
 * na equipe.
 */

export const TAB_IDS = ['visao-geral', 'equipe', 'formulario', 'questionario'] as const;

export type TabId = (typeof TAB_IDS)[number];

/** Confere o parametro `aba` da URL antes de escolher a aba inicial. */
export function isTabId(value: string): value is TabId {
  return (TAB_IDS as readonly string[]).includes(value);
}
