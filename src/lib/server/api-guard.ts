import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { can } from '@/lib/permissions';
import { bearerToken } from '@/lib/domain/api-key';
import { currentUser } from './auth.service';
import { authenticateApiKey } from './api-key.service';
import { forbidden, toErrorResponse, unauthorized } from './http';

/**
 * Porta de entrada da API de links de cadastro (`/api/v1`).
 *
 * EXCLUSIVA DO ADMIN GERAL. Nao existe caminho aqui para o Administrador do
 * time nem para o integrante da equipe: os dois continuam gerando e copiando
 * os proprios links pelo painel, e nada disso muda — o que eles nao alcancam
 * e esta API, nem para ler.
 *
 * Duas credenciais sao aceitas, nesta ordem:
 *
 *   1. `Authorization: Bearer cmd_...` — a chave da API. E o caminho dos
 *      programas. A chave age em nome do ADMIN que a criou e vale enquanto
 *      esse ADMIN continuar ativo;
 *   2. a sessao do painel — o cookie de quem ja esta logado. E o que permite
 *      ao ADMIN experimentar um endpoint a partir da propria documentacao,
 *      sem criar chave nenhuma. A sessao ainda precisa ser de um ADMIN.
 *
 * Cabecalho `Authorization` presente nunca cai na sessao: quem mandou uma
 * chave e recebeu 401 precisa ver o erro da CHAVE, e nao ser atendido por um
 * cookie que por acaso estava no mesmo navegador.
 *
 * Nenhuma resposta distingue chave inexistente, revogada ou de dono
 * desativado: de fora, os tres casos sao o mesmo 401.
 */

/** Quem esta chamando, ja resolvido e conferido. */
export interface ApiCaller {
  /** ADMIN em nome de quem a chamada acontece. */
  userId: string;
  userName: string;
  via: 'chave' | 'sessao';
  /** Chave usada. Nulos quando a chamada veio pela sessao do painel. */
  keyId: string | null;
  keyName: string | null;
}

export async function requireApiAdmin(request: NextRequest): Promise<ApiCaller> {
  const header = request.headers.get('authorization');

  if (header) {
    const token = bearerToken(header);
    if (!token) {
      throw unauthorized(
        'Credencial inválida. Use o cabeçalho Authorization: Bearer <chave da API>.',
      );
    }

    const key = await authenticateApiKey(token);
    if (!key) throw unauthorized('Chave da API inválida ou revogada.');

    return {
      userId: key.userId,
      userName: key.userName,
      via: 'chave',
      keyId: key.keyId,
      keyName: key.keyName,
    };
  }

  // Sem cabecalho: a sessao do painel atende, para o ADMIN poder testar a
  // partir da documentacao. A conferencia e a mesma do resto do sistema.
  const user = await currentUser();
  if (!user) {
    throw unauthorized('Informe a chave da API no cabeçalho Authorization: Bearer.');
  }
  if (user.mustChangePassword) {
    throw forbidden('Defina a nova senha para continuar.');
  }
  if (user.role !== 'ADMIN' || !can(user, 'settings.manage')) {
    throw forbidden('Esta API é exclusiva do administrador geral do sistema.');
  }

  return { userId: user.id, userName: user.name, via: 'sessao', keyId: null, keyName: null };
}

/* -------------------------------------------------------------------------
   Formato das respostas
   ------------------------------------------------------------------------- */

/**
 * Codigo estavel do erro, por faixa de HTTP.
 *
 * Quem integra le o codigo, e nao a mensagem: o texto pode melhorar a
 * qualquer momento, o codigo faz parte do contrato da versao `v1`.
 */
const CODIGOS: Record<number, string> = {
  400: 'dados_invalidos',
  401: 'nao_autenticado',
  403: 'sem_permissao',
  404: 'nao_encontrado',
  409: 'conflito',
  410: 'link_indisponivel',
  500: 'erro_interno',
  503: 'servico_indisponivel',
};

function headers(status: number): Record<string, string> {
  const base: Record<string, string> = { 'Cache-Control': 'no-store' };
  // Padrao HTTP: quem recusa por falta de credencial diz qual esquema espera.
  if (status === 401) base['WWW-Authenticate'] = 'Bearer';
  return base;
}

/** Resposta de sucesso da API. */
export function apiJson<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: headers(status) });
}

/**
 * Resposta de erro da API.
 *
 * O corpo traz `erro.codigo` e `erro.mensagem`, e repete a mensagem em
 * `message` — e a chave que o proprio painel ja le, e assim a documentacao
 * pode chamar a API sem um segundo formato de erro.
 */
export function apiError(status: number, mensagem: string): NextResponse {
  return NextResponse.json(
    { erro: { codigo: CODIGOS[status] ?? 'erro_interno', mensagem }, message: mensagem },
    { status, headers: headers(status) },
  );
}

/**
 * Converte qualquer falha na resposta da API.
 *
 * Reaproveita `toErrorResponse`, que ja e a tradutora unica de falhas do
 * sistema: e la que moram a lista fechada de recusas do banco e a garantia
 * de que nenhuma mensagem interna do Supabase chega a quem chamou.
 */
export async function toApiErrorResponse(error: unknown): Promise<NextResponse> {
  const base = toErrorResponse(error);
  const body = (await base.json().catch(() => null)) as { message?: string } | null;
  return apiError(base.status, body?.message ?? 'Não foi possível concluir a operação.');
}
