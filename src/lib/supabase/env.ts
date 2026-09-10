import 'server-only';

/**
 * Variaveis do Supabase.
 *
 * Nenhuma delas usa o prefixo NEXT_PUBLIC_: as chaves ficam somente no
 * servidor do Next.js e nunca sao embutidas no pacote enviado ao navegador.
 * Sem configuracao, o sistema falha de forma segura (erro controlado) em vez
 * de cair em um modo aberto de demonstracao.
 */

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigError';
  }
}

export interface SupabaseEnv {
  url: string;
  secretKey: string;
}

let warnedLegacyKey = false;

function readSecretKey(): string | undefined {
  const current = process.env.SUPABASE_SECRET_KEY?.trim();
  if (current) return current;

  // Compatibilidade com projetos antigos. Aceito apenas como reserva.
  const legacy = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (legacy && !warnedLegacyKey) {
    warnedLegacyKey = true;
    console.warn(
      '[supabase] Usando SUPABASE_SERVICE_ROLE_KEY (legado). Prefira SUPABASE_SECRET_KEY.',
    );
  }
  return legacy;
}

/**
 * Forma da chave, decidida apenas pelo prefixo.
 *
 * Nada aqui decodifica a chave: nao ha leitura de payload, nem suposicao de
 * que ela seja um JWT.
 */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function isNewSecretKey(key: string): boolean {
  return key.startsWith('sb_secret_');
}

function isLegacyJwtKey(key: string): boolean {
  return JWT_SHAPE.test(key);
}

/** Le e valida a configuracao. Lanca `SupabaseConfigError` quando faltar algo. */
export function supabaseEnv(): SupabaseEnv {
  const url = process.env.SUPABASE_URL?.trim();
  const secretKey = readSecretKey();

  if (!url || !secretKey) {
    throw new SupabaseConfigError(
      'Supabase nao configurado. Defina SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente do servidor.',
    );
  }

  if (!/^https:\/\/[^\s]+$/i.test(url)) {
    throw new SupabaseConfigError('SUPABASE_URL invalida. Use o endereco https do projeto.');
  }

  // Uma chave publicavel nao consegue fazer o trabalho administrativo e, pior,
  // falharia silenciosamente por RLS. Recusar aqui evita o diagnostico errado.
  if (secretKey.startsWith('sb_publishable_') || secretKey.startsWith('sbp_')) {
    throw new SupabaseConfigError(
      'A chave configurada e publicavel. Use a chave secreta do projeto (sb_secret_...).',
    );
  }

  if (!isNewSecretKey(secretKey) && !isLegacyJwtKey(secretKey)) {
    throw new SupabaseConfigError(
      'Formato de chave nao reconhecido. Use a chave secreta do projeto (sb_secret_...).',
    );
  }

  return { url: url.replace(/\/+$/, ''), secretKey };
}

/**
 * Cabecalhos de autenticacao das chamadas ao Supabase.
 *
 * A chave vai sempre em `apikey`. O `Authorization: Bearer` so e enviado para
 * as chaves antigas, que sao JWT de fato — mandar uma chave `sb_secret_...`
 * nesse cabecalho faria o PostgREST tentar interpreta-la como JWT e recusar a
 * requisicao.
 */
export function supabaseAuthHeaders(extra?: HeadersInit): Headers {
  const { secretKey } = supabaseEnv();
  const headers = new Headers(extra);

  headers.set('apikey', secretKey);
  if (isLegacyJwtKey(secretKey)) {
    headers.set('Authorization', `Bearer ${secretKey}`);
  }

  return headers;
}

/** Indica se o ambiente esta pronto, sem lancar erro. */
export function isSupabaseConfigured(): boolean {
  try {
    supabaseEnv();
    return true;
  } catch {
    return false;
  }
}
