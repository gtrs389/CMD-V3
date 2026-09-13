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

export const notFound = (message = 'Registro não encontrado.') => new ApiError(404, message);
export const unauthorized = (message = 'Sessão expirada. Entre novamente.') =>
  new ApiError(401, message);
export const forbidden = (message = 'Você não tem permissão para esta ação.') =>
  new ApiError(403, message);
export const badRequest = (message = 'Dados inválidos.') => new ApiError(400, message);
/** Link expirado, consumido, revogado ou reservado por outra pessoa. */
export const gone = (message = 'Este link não está mais disponível.') => new ApiError(410, message);

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Link encerrado (410).
 *
 * `reason` distingue apenas os dois textos previstos na tela publica:
 * 'taken' (reservado por outra pessoa) e 'expired' (vencido, consumido ou
 * revogado). Nada mais do estado interno sai daqui.
 */
export function jsonGone(reason: 'taken' | 'expired'): NextResponse {
  return NextResponse.json(
    { message: 'Este link não está mais disponível.', reason },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Recusas previstas das funcoes do banco (`raise exception`, codigo P0001).
 *
 * A chave e o texto exato escrito na migration; o valor e o que a pessoa le
 * na tela. A lista e FECHADA de proposito: o texto do banco nunca e
 * repassado ao navegador, e o que nao estiver aqui continua virando a falha
 * generica.
 *
 * Isso existe porque "nao pode" nao e defeito. Gerar o link do Formulario 2
 * com ele desligado, por exemplo, e uma recusa correta do banco — mas ate
 * agora chegava na tela como "Não foi possível concluir a operação.", sem
 * dizer que bastava ligar a chave em Configuracoes.
 *
 * O texto das migrations ja executadas nao muda (elas sao imutaveis), e por
 * isso algumas chaves ainda dizem "questionario": e o nome antigo do
 * Formulario 2 dentro do banco. Na tela, so aparece o nome novo.
 */
const REGRAS_DO_BANCO: Record<string, { status: number; message: string }> = {
  'questionario desligado para este time': {
    status: 409,
    message:
      'O Formulário 2 está desligado para este time. ' +
      'Peça ao administrador do sistema para ativá-lo em Configurações.',
  },
  'questionario sem perguntas': {
    status: 409,
    message:
      'O Formulário 2 ainda não tem nenhum campo ativo. ' +
      'Peça ao administrador do sistema para montá-lo em Configurações.',
  },
  'perfil sem link de questionario': {
    status: 403,
    message: 'Este perfil não tem link do Formulário 2.',
  },
  'perfil sem link pessoal': {
    status: 403,
    message: 'Este perfil não tem link de cadastro.',
  },
  'usuario sem operacao': {
    status: 403,
    message: 'Este acesso não está ligado a nenhum time.',
  },
  'usuario inativo': {
    status: 403,
    message: 'Este acesso está desativado.',
  },
  'time nao encontrado': {
    status: 404,
    message: 'Time não encontrado.',
  },
};

/**
 * Converte qualquer falha em resposta segura.
 * Nenhuma mensagem interna do banco ou do Storage chega ao navegador.
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) return jsonError(error.status, error.message);
  if (error instanceof MediaError) return jsonError(400, error.message);

  if (error instanceof SupabaseConfigError) {
    console.error('[cmd] Supabase não configurado:', error.message);
    return jsonError(503, 'Serviço indisponível. Configuração do banco ausente.');
  }

  if (error instanceof SupabaseRequestError) {
    console.error('[cmd] Erro no banco:', error.code, error.message);
    if (error.isUniqueViolation) return jsonError(409, 'Já existe um registro com estes dados.');

    // Coluna ou tabela que o codigo espera e o banco nao tem: e sempre uma
    // migration pendente. Dizer isso na tela evita procurar bug onde nao ha.
    if (error.isMissingSchema) {
      return jsonError(
        503,
        'A estrutura do banco está desatualizada: falta executar a migration mais recente no Supabase.',
      );
    }

    // Recusa prevista de uma funcao do banco: a tela recebe o motivo, nao a
    // falha generica. O texto vem da lista fechada acima.
    if (error.isBusinessRule) {
      const regra = REGRAS_DO_BANCO[error.message.trim().toLowerCase()];
      if (regra) return jsonError(regra.status, regra.message);
    }

    if (error.status === 503) {
      return jsonError(503, 'Falha de conexão com o banco. Tente novamente.');
    }
    return jsonError(500, 'Não foi possível concluir a operação.');
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
    throw badRequest('Corpo da requisição inválido.');
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw badRequest(first?.message ?? 'Dados inválidos.');
  }
  return parsed.data;
}
