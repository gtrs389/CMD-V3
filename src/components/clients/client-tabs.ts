/**
 * Abas da pagina do time.
 *
 * Modulo comum, SEM `'use client'`: a pagina (Server Component) precisa
 * conferir o parametro `aba` da URL antes de renderizar, e uma funcao
 * exportada de um modulo cliente nao pode ser chamada no servidor.
 *
 * O convite deixou de ser aba: o link de cadastro abre em dialogo.
 *
 * A aba "Formulário" configura OS DOIS formularios do time — o 1, que o
 * administrador envia para quem sera lider, e o 2, que o lider envia
 * adiante. Eles nao viram abas separadas: e o mesmo lugar de configuracao,
 * com a troca entre um e outro la dentro.
 */

export const TAB_IDS = ['visao-geral', 'equipe', 'formulario'] as const;

export type TabId = (typeof TAB_IDS)[number];

/** Confere o parametro `aba` da URL antes de escolher a aba inicial. */
export function isTabId(value: string): value is TabId {
  return (TAB_IDS as readonly string[]).includes(value);
}
