import 'server-only';
import { randomBytes } from 'node:crypto';
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
  'link nao encontrado': {
    status: 404,
    message: 'Link não encontrado.',
  },
  'link ja concluido': {
    status: 409,
    message:
      'Este link já foi usado para um cadastro e não pode ser revogado. ' +
      'Gere um link novo se precisar de outro endereço.',
  },
  // Guardas da origem do cadastro (migration 012). Sem estas linhas, uma
  // recusa correta do banco chegava na tela como falha generica, e quem
  // estava preenchendo o formulario nao tinha o que fazer com isso.
  'responsavel pelo cadastro nao encontrado': {
    status: 409,
    message:
      'O acesso de quem gerou este link não existe mais. ' +
      'Peça um link novo para se cadastrar.',
  },
  'responsavel pertence a outro candidato': {
    status: 409,
    message: 'Este link pertence a outro time. Peça um link novo para se cadastrar.',
  },
  'perfil do responsavel nao confere': {
    status: 409,
    message:
      'O acesso de quem gerou este link mudou de perfil. ' +
      'Peça um link novo para se cadastrar.',
  },
  'integrante nao pertence ao candidato': {
    status: 409,
    message: 'Este cadastro não pertence a este time.',
  },
  'origem do cadastro nao pode ser alterada': {
    status: 409,
    message: 'Quem cadastrou uma pessoa não pode ser alterado por aqui.',
  },
  'usuario nao encontrado': {
    status: 404,
    message: 'Acesso não encontrado.',
  },
  'reserva invalida': {
    status: 410,
    message: 'Este link não está mais disponível.',
  },
};

/**
 * Falhas do PostgreSQL que NAO sao defeito do sistema: sao dados que o banco
 * recusou.
 *
 * Antes, tudo o que nao fosse unicidade, migration pendente ou recusa
 * explicita virava o mesmo 500 — "Não foi possível concluir a operação." —,
 * e quem preenchia o formulario ficava sem saber se tentava de novo, se
 * mudava algum campo ou se avisava alguem. Um cadastro com um campo fora do
 * formato aceito e um pedido invalido (400), nao uma falha do servidor.
 *
 * O nome da coluna ou da constraint continua SO no log: a tela recebe um
 * texto que a pessoa entende, e nada da estrutura do banco vaza.
 */
const FALHAS_DO_POSTGRES: Record<string, { status: number; message: string }> = {
  // check constraint
  '23514': {
    status: 400,
    message:
      'Algum dado do cadastro não foi aceito no formato enviado. ' +
      'Revise os campos preenchidos e tente novamente.',
  },
  // not null
  '23502': {
    status: 400,
    message: 'Falta preencher um dado obrigatório do cadastro.',
  },
  // valor longo demais
  '22001': {
    status: 400,
    message: 'Algum campo do cadastro ficou longo demais. Encurte e tente novamente.',
  },
  // chave estrangeira
  '23503': {
    status: 409,
    message:
      'Este cadastro depende de um registro que não existe mais. ' +
      'Atualize a página e tente novamente.',
  },
  // texto invalido para o tipo da coluna
  '22P02': { status: 400, message: 'Algum dado do cadastro está em formato inválido.' },
  '22007': { status: 400, message: 'Alguma data do cadastro está em formato inválido.' },
  '22008': { status: 400, message: 'Alguma data do cadastro está fora do intervalo aceito.' },
  // concorrencia: deu ruim agora, mas tentar de novo resolve
  '40001': { status: 409, message: 'Outra operação aconteceu ao mesmo tempo. Tente novamente.' },
  '40P01': { status: 409, message: 'Outra operação aconteceu ao mesmo tempo. Tente novamente.' },
};

/**
 * Codigo curto que liga a tela ao log do servidor.
 *
 * Uma falha inesperada nao pode virar so "deu erro": sem nada em comum entre
 * o que a pessoa ve e o que o servidor registra, descobrir o que aconteceu
 * depende de adivinhacao. O codigo aparece na mensagem e no log, e nao
 * carrega nenhuma informacao — e sorteado na hora.
 */
function referencia(): string {
  return randomBytes(3).toString('hex').toUpperCase();
}

/**
 * Converte qualquer falha em resposta segura.
 * Nenhuma mensagem interna do banco ou do Storage chega ao navegador.
 */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) return jsonError(error.status, error.message);
  if (error instanceof MediaError) return jsonError(400, error.message);

  if (error instanceof SupabaseConfigError) {
    const ref = referencia();
    console.error(`[cmd] ${ref} Supabase não configurado:`, error.message);
    return jsonError(
      503,
      `Serviço indisponível. Configuração do banco ausente. (código ${ref})`,
    );
  }

  if (error instanceof SupabaseRequestError) {
    const ref = referencia();
    // Tudo o que ajuda a achar a coluna vai para o LOG, nunca para a tela.
    console.error(
      `[cmd] ${ref} Erro no banco:`,
      error.code,
      error.message,
      error.details ?? '',
      error.hint ?? '',
    );
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

    // Dado recusado pelo banco: e pedido invalido, e nao falha do servidor.
    // A pessoa fica sabendo que pode corrigir e tentar de novo, em vez de
    // receber um 500 que nao diz nada.
    const falha = error.code ? FALHAS_DO_POSTGRES[error.code] : undefined;
    if (falha) return jsonError(falha.status, `${falha.message} (código ${ref})`);

    if (error.status === 503) {
      return jsonError(503, `Falha de conexão com o banco. Tente novamente. (código ${ref})`);
    }
    return jsonError(500, `Não foi possível concluir a operação. (código ${ref})`);
  }

  const ref = referencia();
  console.error(`[cmd] ${ref} Erro inesperado:`, error);
  return jsonError(500, `Erro inesperado. Tente novamente. (código ${ref})`);
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
