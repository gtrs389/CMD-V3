import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';

/**
 * Contexto das telas publicas, guardado em cookie.
 *
 * O link enviado pela pessoa continua carregando o codigo secreto — e ele
 * que identifica o convite ou o acesso do time. O que muda e o que sobra na
 * barra de endereco: a rota de entrada valida o codigo, guarda o contexto
 * aqui e devolve um redirect para `/`, entao o navegador nunca chega a
 * exibir uma URL com token, slug, query ou fragmento.
 *
 * Regras que valem para os tres cookies deste arquivo:
 *
 *  - `HttpOnly`: o codigo nunca fica ao alcance de JavaScript;
 *  - `Secure` em producao e `SameSite=Lax`;
 *  - `Path=/` e sem `Domain`, porque as telas publicas agora vivem em `/`;
 *  - nada e guardado em `localStorage` ou `sessionStorage`;
 *  - nenhum valor daqui aparece em JSON, log ou URL.
 *
 * Os dois contextos nunca convivem: abrir um link novo apaga o que estava
 * guardado antes, seja de qual tipo for.
 */

/** Convite de recrutamento em andamento. */
export const INVITE_CONTEXT_COOKIE = 'cmd_convite_ctx';

/** Acesso ao painel pelo link do time, aguardando o telefone. */
export const TEAM_ACCESS_CONTEXT_COOKIE = 'cmd_acesso_ctx';

/** Estado publico de erro, sem nenhum identificador. */
export const PUBLIC_STATE_COOKIE = 'cmd_publico_estado';

/**
 * Janela do acesso ao painel: 15 minutos.
 *
 * O contexto existe apenas para a pessoa digitar o telefone. Ele e apagado
 * assim que o login acontece.
 */
export const TEAM_ACCESS_CONTEXT_MAX_AGE = 15 * 60;

/**
 * Estados publicos de erro.
 *
 * Sao codigos fechados, escolhidos no servidor: nao carregam token, motivo
 * tecnico, nome de time nem nada que identifique o link.
 */
export const PUBLIC_STATES = [
  'convite-expirado',
  'convite-indisponivel',
  'convite-reservado',
  'acesso-indisponivel',
] as const;
export type PublicState = (typeof PUBLIC_STATES)[number];

function isPublicState(value: string): value is PublicState {
  return (PUBLIC_STATES as readonly string[]).includes(value);
}

interface CookieOptions {
  maxAge: number;
}

function base(name: string, value: string, options: CookieOptions) {
  return {
    name,
    value,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: options.maxAge,
  };
}

/** Segundos que faltam ate o prazo, com um minimo de um minuto. */
function remainingSeconds(expiresAt: string): number {
  const seconds = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  return Math.max(60, Number.isFinite(seconds) ? seconds : 60);
}

/**
 * Apaga qualquer contexto publico anterior.
 *
 * Chamado no inicio de toda rota de entrada: abrir um link novo nunca herda
 * o contexto do link anterior, e um contexto invalido nao sobrevive.
 */
export function clearPublicContext(response: NextResponse): void {
  for (const name of [INVITE_CONTEXT_COOKIE, TEAM_ACCESS_CONTEXT_COOKIE, PUBLIC_STATE_COOKIE]) {
    response.cookies.set({ ...base(name, '', { maxAge: 0 }) });
  }
}

/** Guarda o convite em andamento. O cookie morre junto com o link. */
export function attachInviteContext(
  response: NextResponse,
  token: string,
  expiresAt: string,
): void {
  response.cookies.set(
    base(INVITE_CONTEXT_COOKIE, token, { maxAge: remainingSeconds(expiresAt) }),
  );
}

/** Guarda o acesso ao painel, por no maximo 15 minutos. */
export function attachTeamAccessContext(response: NextResponse, token: string): void {
  response.cookies.set(
    base(TEAM_ACCESS_CONTEXT_COOKIE, token, { maxAge: TEAM_ACCESS_CONTEXT_MAX_AGE }),
  );
}

/** Guarda o estado de erro que a tela em `/` deve mostrar. */
export function attachPublicState(response: NextResponse, state: PublicState): void {
  response.cookies.set(base(PUBLIC_STATE_COOKIE, state, { maxAge: 10 * 60 }));
}

/** Apaga o contexto do acesso ao painel, usado depois do login. */
export function clearTeamAccessContext(response: NextResponse): void {
  response.cookies.set(base(TEAM_ACCESS_CONTEXT_COOKIE, '', { maxAge: 0 }));
}

/* -------------------------------------------------------------------------
   Leitura
   ------------------------------------------------------------------------- */

/** Token do convite guardado no cookie, para as rotas limpas. */
export function readInviteContext(request: NextRequest): string | null {
  return request.cookies.get(INVITE_CONTEXT_COOKIE)?.value || null;
}

/** Token do acesso ao time guardado no cookie, para a rota limpa. */
export function readTeamAccessContext(request: NextRequest): string | null {
  return request.cookies.get(TEAM_ACCESS_CONTEXT_COOKIE)?.value || null;
}

/** O que a rota `/` deve desenhar, a partir dos cookies da requisicao. */
export type PublicScreen =
  | { kind: 'invite' }
  | { kind: 'team-access' }
  | { kind: 'state'; state: PublicState }
  | { kind: 'none' };

/**
 * Ordem fixa: cadastro, acesso ao time, estado de erro.
 *
 * Recebe os cookies ja lidos (`cookies()` em Server Component), porque a
 * pagina `/` nao tem acesso a `NextRequest`.
 */
export function publicScreenFrom(store: {
  get(name: string): { value: string } | undefined;
}): PublicScreen {
  if (store.get(INVITE_CONTEXT_COOKIE)?.value) return { kind: 'invite' };
  if (store.get(TEAM_ACCESS_CONTEXT_COOKIE)?.value) return { kind: 'team-access' };

  const state = store.get(PUBLIC_STATE_COOKIE)?.value;
  if (state && isPublicState(state)) return { kind: 'state', state };

  return { kind: 'none' };
}
