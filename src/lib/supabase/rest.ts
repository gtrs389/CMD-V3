import 'server-only';
import { supabaseAuthHeaders, supabaseEnv } from './env';

/**
 * Cliente PostgREST minimo.
 *
 * Fala diretamente com a API REST do Supabase usando `fetch`, sempre no
 * servidor e sempre com a chave secreta. Nao existe cliente de navegador:
 * nenhuma tela consegue consultar o banco por conta propria.
 *
 * Nada aqui usa Supabase Authentication. A chave secreta ignora RLS, por isso
 * cada consulta abaixo ja carrega o filtro correto e toda rota que a utiliza
 * confere a sessao antes.
 */

export class SupabaseRequestError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'SupabaseRequestError';
    this.status = status;
    this.code = code;
  }

  /** Violacao de unicidade (ex.: e-mail ou token repetido). */
  get isUniqueViolation(): boolean {
    return this.code === '23505';
  }
}

type QueryValue = string | number | boolean | null | undefined;

export interface QueryOptions {
  select?: string;
  /** Filtros no formato PostgREST: `{ id: 'eq.123' }`. */
  filters?: Record<string, string>;
  order?: string;
  limit?: number;
  single?: boolean;
}

function buildUrl(table: string, options: QueryOptions): string {
  const { url } = supabaseEnv();
  const search = new URLSearchParams();

  if (options.select) search.set('select', options.select);
  for (const [key, value] of Object.entries(options.filters ?? {})) {
    search.append(key, value);
  }
  if (options.order) search.set('order', options.order);
  if (typeof options.limit === 'number') search.set('limit', String(options.limit));

  const query = search.toString();
  return `${url}/rest/v1/${table}${query ? `?${query}` : ''}`;
}

async function request<T>(
  url: string,
  init: RequestInit & { prefer?: string[] },
): Promise<T> {
  const headers = supabaseAuthHeaders(init.headers);
  headers.set('Content-Type', 'application/json');
  if (init.prefer?.length) headers.set('Prefer', init.prefer.join(','));

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new SupabaseRequestError('Falha de conexao com o banco de dados.', 503, null);
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as
      | { message?: string; code?: string }
      | null;
    throw new SupabaseRequestError(
      detail?.message ?? 'Erro ao consultar o banco de dados.',
      response.status,
      detail?.code ?? null,
    );
  }

  if (response.status === 204) return null as T;
  const text = await response.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

/** Monta um filtro `in.(a,b,c)` com escape simples. */
export function inFilter(values: readonly string[]): string {
  const escaped = values.map((value) => `"${value.replace(/"/g, '""')}"`);
  return `in.(${escaped.join(',')})`;
}

export async function selectRows<T>(table: string, options: QueryOptions = {}): Promise<T[]> {
  const rows = await request<T[] | null>(buildUrl(table, options), { method: 'GET' });
  return rows ?? [];
}

export async function selectOne<T>(table: string, options: QueryOptions = {}): Promise<T | null> {
  const rows = await selectRows<T>(table, { ...options, limit: options.limit ?? 1 });
  return rows[0] ?? null;
}

export async function insertRows<T>(
  table: string,
  values: Record<string, QueryValue | object>[],
  select = '*',
): Promise<T[]> {
  if (values.length === 0) return [];
  const rows = await request<T[] | null>(buildUrl(table, { select }), {
    method: 'POST',
    body: JSON.stringify(values),
    prefer: ['return=representation'],
  });
  return rows ?? [];
}

export async function insertOne<T>(
  table: string,
  value: Record<string, QueryValue | object>,
  select = '*',
): Promise<T> {
  const [row] = await insertRows<T>(table, [value], select);
  if (!row) throw new SupabaseRequestError('Registro nao pode ser criado.', 500, null);
  return row;
}

export async function updateRows<T>(
  table: string,
  filters: Record<string, string>,
  values: Record<string, QueryValue | object>,
  select = '*',
): Promise<T[]> {
  const rows = await request<T[] | null>(buildUrl(table, { filters, select }), {
    method: 'PATCH',
    body: JSON.stringify(values),
    prefer: ['return=representation'],
  });
  return rows ?? [];
}

export async function deleteRows<T>(
  table: string,
  filters: Record<string, string>,
  select = 'id',
): Promise<T[]> {
  const rows = await request<T[] | null>(buildUrl(table, { filters, select }), {
    method: 'DELETE',
    prefer: ['return=representation'],
  });
  return rows ?? [];
}
