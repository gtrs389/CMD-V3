/** Nome do cookie de sessao. Compartilhado entre proxy, rotas e servicos. */
export const SESSION_COOKIE = 'cmd_session';

/** Duracao da sessao em segundos (8 horas). */
export const SESSION_MAX_AGE = 60 * 60 * 8;

/** Rotas que exigem sessao administrativa. */
export const PROTECTED_PREFIXES = ['/dashboard', '/clientes'] as const;

export const LOGIN_PATH = '/login';
export const DEFAULT_AUTHENTICATED_PATH = '/dashboard';

/** Mensagem unica de credencial invalida: nunca revela se o e-mail existe. */
export const GENERIC_LOGIN_ERROR = 'E-mail ou senha invalidos.';

/** Tentativas seguidas antes do bloqueio temporario. */
export const MAX_LOGIN_ATTEMPTS = 5;

/** Duracao do bloqueio apos exceder as tentativas, em minutos. */
export const LOGIN_LOCK_MINUTES = 15;
