import { NotFoundError, RepositoryError } from '../types';

/**
 * Ponte entre as telas e as rotas do proprio Next.js.
 *
 * Nenhum componente fala com o Supabase: tudo passa por estas rotas, que
 * rodam no servidor e conferem a sessao antes de tocar no banco.
 */

export class NetworkError extends RepositoryError {}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      signal,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NetworkError('Falha de conexao. Verifique sua rede e tente novamente.');
  }

  const data = (await response.json().catch(() => null)) as (T & { message?: string }) | null;

  if (!response.ok) {
    const message = data?.message ?? 'Nao foi possivel concluir a operacao.';
    if (response.status === 404) throw new NotFoundError(message);
    throw new RepositoryError(message);
  }

  return data as T;
}
