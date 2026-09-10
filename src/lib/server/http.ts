import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SupabaseConfigError } from '@/lib/supabase/env';
import { SupabaseRequestError } from '@/lib/supabase/rest';
import { MediaError } from '@/lib/supabase/storage';

/** Erros previstos das rotas, com codigo HTTP proprio. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const notFound = (message = 'Registro nao encontrado.') => new ApiError(404, message);
export const unauthorized = (message = 'Sessao expirada. Entre novamente.') =>
  new ApiError(401, message);
export const forbidden = (message = 'Voce nao tem permissao para esta acao.') =>
  new ApiError(403, message);
export const badRequest = (message = 'Dados invalidos.') => new ApiError(400, message);

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Converte qualquer falha em resposta segura.
 * Nenhuma mensagem interna do banco ou do Storage chega ao navegador.
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) return jsonError(error.status, error.message);
  if (error instanceof MediaError) return jsonError(400, error.message);

  if (error instanceof SupabaseConfigError) {
    console.error('[cmd] Supabase nao configurado:', error.message);
    return jsonError(503, 'Servico indisponivel. Configuracao do banco ausente.');
  }

  if (error instanceof SupabaseRequestError) {
    console.error('[cmd] Erro no banco:', error.code, error.message);
    if (error.isUniqueViolation) return jsonError(409, 'Ja existe um registro com estes dados.');
    if (error.status === 503) {
      return jsonError(503, 'Falha de conexao com o banco. Tente novamente.');
    }
    return jsonError(500, 'Nao foi possivel concluir a operacao.');
  }

  console.error('[cmd] Erro inesperado:', error);
  return jsonError(500, 'Erro inesperado. Tente novamente.');
}

/** Le e valida o corpo JSON com Zod. Toda entrada do servidor passa por aqui. */
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw badRequest('Corpo da requisicao invalido.');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw badRequest(first?.message ?? 'Dados invalidos.');
  }
  return parsed.data;
}
