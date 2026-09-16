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
  /**
   * `details` e `hint` do PostgREST.
   *
   * Nao vao para o navegador em hipotese nenhuma — existem para o LOG do
   * servidor. Sem eles, uma violacao de check chega ao log dizendo apenas
   * que uma linha foi recusada, e nao QUAL coluna a recusou: e a diferenca
   * entre corrigir em minutos e caçar o problema no escuro.
   */
  readonly details: string | null;
  readonly hint: string | null;

  constructor(
    message: string,
    status: number,
    code: string | null,
    details: string | null = null,
    hint: string | null = null,
  ) {
    super(message);
    this.name = 'SupabaseRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.hint = hint;
  }

  /** Violacao de unicidade (ex.: e-mail ou token repetido). */
  get isUniqueViolation(): boolean {
    return this.code === '23505';
  }

  /**
   * O banco nao tem a coluna, a tabela ou a funcao que o codigo pediu.
   *
   * Na pratica isso significa UMA coisa: a migration correspondente ainda
   * nao foi executada — ou foi, e o PostgREST ainda nao recarregou o cache
   * do schema. Sem distinguir esse caso, toda falha assim vira a mesma
   * mensagem generica de erro e a tela nao diz o que fazer, o que transforma
   * um `alter table` esquecido em uma caca ao bug.
   *
   * Dois mundos, e os dois precisam entrar:
   *
   *   POSTGRES   42703 coluna inexistente, 42P01 tabela inexistente. Sao os
   *              erros de quem consultou o banco direto.
   *   POSTGREST  PGRST202 funcao, PGRST204 coluna e PGRST205 tabela que nao
   *              estao NO CACHE dele. O PostgREST nem chega a perguntar ao
   *              banco: ele recusa antes, com codigo proprio.
   *
   * Faltava o segundo grupo, e e justamente o que aparece logo depois de uma
   * migration nova — o caso mais comum de todos.
   */
  get isMissingSchema(): boolean {
    if (
      this.code === '42703' ||
      this.code === '42P01' ||
      this.code === 'PGRST202' ||
      this.code === 'PGRST204' ||
      this.code === 'PGRST205'
    ) {
      return true;
    }

    // Rede de seguranca por TEXTO: algumas versoes do PostgREST recusam a
    // funcao ou a coluna ausente sem mandar `code` nenhum. Sem isto, o caso
    // mais comum depois de uma migration nova — "ja rodei o SQL, e continua
    // dando erro" — volta a ser um 500 que nao explica nada.
    const texto = this.message.toLowerCase();
    return texto.includes('schema cache') || texto.includes('does not exist');
  }

  /**
   * O banco existe, tem a estrutura, mas recusou por permissao.
   *
   * Tambem e configuracao pendente, e nao defeito: quase sempre a parte de
   * `grant` da migration nao foi executada. Merece mensagem propria, porque
   * a acao e outra — rodar o bloco de permissoes, e nao criar coluna.
   */
  get isMissingGrant(): boolean {
    return this.code === '42501';
  }

  /**
   * Regra de negocio recusada por uma funcao do banco (`raise exception`).
   *
   * P0001 nao e defeito: e o banco dizendo "isso nao pode", com um texto
   * curto escrito por nos na migration. Sem distinguir esse caso, a recusa
   * prevista virava a mesma falha generica de sempre e a tela nao dizia o
   * que fazer — quem clicou ficava sem saber que bastava ligar uma chave em
   * Configuracoes.
   *
   * A traducao para o texto da tela fica em `http.ts`, por lista fechada: o
   * texto do banco nunca e repassado ao navegador.
   */
  get isBusinessRule(): boolean {
    return this.code === 'P0001';
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
    throw new SupabaseRequestError('Falha de conexão com o banco de dados.', 503, null);
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as
      | { message?: string; code?: string; details?: string; hint?: string }
      | null;
    throw new SupabaseRequestError(
      detail?.message ?? 'Erro ao consultar o banco de dados.',
      response.status,
      detail?.code ?? null,
      detail?.details ?? null,
      detail?.hint ?? null,
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

/** Monta um filtro `not.in.(a,b,c)`. Usado para tirar os Times DEMO das metricas. */
export function notInFilter(values: readonly string[]): string {
  const escaped = values.map((value) => `"${value.replace(/"/g, '""')}"`);
  return `not.in.(${escaped.join(',')})`;
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
  if (!row) throw new SupabaseRequestError('Registro não pode ser criado.', 500, null);
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

/**
 * Executa uma funcao SQL pelo endpoint de RPC do PostgREST.
 * Usado apenas onde a operacao precisa acontecer em uma transacao so.
 */
export async function callFunction<T>(
  name: string,
  // `object` cobre os argumentos `jsonb`, que chegam como array ou objeto.
  args: Record<string, QueryValue | object>,
): Promise<T> {
  const { url } = supabaseEnv();
  return request<T>(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(args),
  });
}
