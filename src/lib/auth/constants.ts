/** Nome do cookie de sessao. Compartilhado entre proxy, rotas e servicos. */
export const SESSION_COOKIE = 'cmd_session';

/** Duracao da sessao em segundos (8 horas). */
export const SESSION_MAX_AGE = 60 * 60 * 8;

/** Rotas que exigem sessao autenticada. */
export const PROTECTED_PREFIXES = [
  '/dashboard',
  '/candidatos',
  '/recrutar',
  '/configuracoes',
  '/primeiro-acesso',
  '/clientes',
] as const;

export const LOGIN_PATH = '/login';
export const DEFAULT_AUTHENTICATED_PATH = '/dashboard';
export const FIRST_ACCESS_PATH = '/primeiro-acesso';

/**
 * Pagina inicial de cada perfil.
 *
 * Com senha temporaria em uso, o unico destino e o primeiro acesso. O
 * candidato vai direto para o proprio registro; o ADMIN, para a visao geral.
 */
export function homePathFor(
  user: { role: string; candidateId: string | null; mustChangePassword: boolean } | null,
): string {
  if (!user) return LOGIN_PATH;
  if (user.mustChangePassword) return FIRST_ACCESS_PATH;
  if (user.role === 'CANDIDATE' && user.candidateId) return `/candidatos/${user.candidateId}`;
  return DEFAULT_AUTHENTICATED_PATH;
}

/** Mensagem unica de credencial invalida: nunca revela se o e-mail existe. */
export const GENERIC_LOGIN_ERROR = 'E-mail ou senha inválidos.';

/** Tentativas seguidas antes do bloqueio temporario. */
export const MAX_LOGIN_ATTEMPTS = 5;

/** Duracao do bloqueio apos exceder as tentativas, em minutos. */
export const LOGIN_LOCK_MINUTES = 15;
