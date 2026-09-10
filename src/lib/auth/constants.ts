/** Nome do cookie de sessao. Compartilhado entre proxy e rotas de API. */
export const SESSION_COOKIE = 'sistema_session';

/** Duracao da sessao em segundos (8 horas). */
export const SESSION_MAX_AGE = 60 * 60 * 8;

/** Rotas que exigem sessao administrativa. */
export const PROTECTED_PREFIXES = ['/dashboard', '/clientes'] as const;

export const LOGIN_PATH = '/login';
export const DEFAULT_AUTHENTICATED_PATH = '/dashboard';
