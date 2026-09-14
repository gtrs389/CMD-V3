/**
 * Formato das chaves da API de links de cadastro.
 *
 * Modulo comum, sem `server-only`: o servidor gera e confere a chave, e a
 * tela de Configuracoes precisa das mesmas regras para exibir e validar o
 * que digita o ADMIN. Nada aqui toca no banco nem sorteia segredo — a
 * geracao acontece em `api-key.service.ts`, com `randomBytes`.
 *
 * O segredo tem tres partes visiveis a olho nu:
 *
 *   cmd_        marca de origem, para a chave ser reconhecida em um log
 *               alheio ou em um campo de configuracao de outro sistema;
 *   8 caracteres  o PREFIXO guardado no banco, que identifica a chave na
 *               tela sem revelar o segredo;
 *   o restante  a parte secreta de verdade.
 *
 * O segredo inteiro aparece UMA unica vez, na resposta da criacao. Depois
 * disso so existe o SHA-256 dele no banco: perdido o valor, a saida e
 * revogar a chave e criar outra.
 */

/** Marca de origem do segredo. */
export const API_KEY_MARK = 'cmd_';

/** 32 bytes aleatorios em base64url ocupam 43 caracteres. */
export const API_KEY_SECRET_CHARS = 43;

/** Caracteres do segredo guardados em claro, junto da marca. */
const PREFIX_CHARS = 8;

/** Tamanho maximo do apelido da chave, igual ao `check` da migration 029. */
export const API_KEY_NAME_MAX = 60;

const KEY_PATTERN = new RegExp(`^${API_KEY_MARK}[A-Za-z0-9_-]{${API_KEY_SECRET_CHARS}}$`);

/** Formato aceito. Nao diz que a chave existe: so que vale a pena conferir. */
export function isApiKeyFormat(value: string | null | undefined): boolean {
  return typeof value === 'string' && KEY_PATTERN.test(value);
}

/**
 * Parte publica do segredo: `cmd_` + os 8 primeiros caracteres.
 *
 * E o que o banco guarda em claro. Sozinho nao autentica nada: a conferencia
 * e sempre pelo SHA-256 do segredo inteiro.
 */
export function apiKeyPrefix(token: string): string {
  return token.slice(0, API_KEY_MARK.length + PREFIX_CHARS);
}

/** Como a chave aparece na tela: prefixo e o resto escondido. */
export function maskApiKey(prefix: string): string {
  return `${prefix}${'•'.repeat(12)}`;
}

/**
 * Segredo do cabecalho `Authorization: Bearer <chave>`.
 *
 * Aceita o esquema em qualquer caixa (`Bearer`, `bearer`) porque e assim que
 * as bibliotecas de cliente escrevem. Devolve nulo quando o cabecalho falta,
 * usa outro esquema ou traz algo fora do formato — nesse caso nenhuma
 * consulta ao banco chega a acontecer.
 */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;

  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer') return null;

  const value = rest.join('');
  return isApiKeyFormat(value) ? value : null;
}
