import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { bearerToken } from '@/lib/domain/api-key';
import type { ApiKeyAction } from '@/lib/supabase/tables';
import { recordApiKeyEvent, resolveApiKey } from './api-key.service';
import { badRequest, toErrorResponse, unauthorized } from './http';

/**
 * Porta de entrada da API de links de cadastro (`/api/v1`).
 *
 * SO UMA CREDENCIAL ENTRA AQUI: a chave, em
 * `Authorization: Bearer cmd_...`. A sessao do painel NAO serve — nem a do
 * ADMIN geral. Quem administra e testa as chaves e a tela de Configuracoes;
 * quem chama a API e um programa, com a chave dele. Sem essa separacao, um
 * cookie no navegador viraria credencial de API e a identidade do link
 * deixaria de vir do vinculo.
 *
 * A IDENTIDADE VEM DA CHAVE, e de mais nada. Cada chave pertence a UM
 * Administrador de UM time (migration 031): e em nome dele que o link nasce,
 * e nenhum campo da requisicao muda isso. Uma chave do Joao nunca alcanca a
 * Maria.
 *
 * Antes de cada operacao o banco reconfere o vinculo inteiro — revogacao,
 * ADMIN geral ativo, administrador ativo com o perfil certo, ainda ligado ao
 * mesmo time, e o time ainda existindo. Qualquer falha derruba a chave na
 * hora.
 *
 * Para fora, toda recusa e a mesma: 401 com a mesma frase. Chave inexistente,
 * revogada, sem vinculo, com administrador desativado ou com time removido
 * sao indistinguiveis — quem tem a chave nao descobre, tentando, o estado do
 * sistema. O motivo real fica registrado na atividade da chave, onde so o
 * ADMIN geral le.
 */

/** Administrador do time em nome de quem a chamada acontece. */
export interface ApiOwner {
  userId: string;
  userName: string;
  clientId: string;
  clientName: string;
}

/** Chamada autenticada: a chave e o vinculo dela, ja conferidos. */
export interface ApiCaller {
  keyId: string;
  keyName: string;
  /** ADMIN geral que criou a chave: quem autorizou a existencia dela. */
  adminUserId: string;
  adminName: string;
  /** Quem aparece no historico do link, como se tivesse clicado no painel. */
  owner: ApiOwner;
}

/** Mesma frase para toda recusa: nada do estado interno vaza pela resposta. */
const RECUSA = 'Chave da API inválida ou sem permissão.';

export async function requireApiKey(request: NextRequest): Promise<ApiCaller> {
  const token = bearerToken(request.headers.get('authorization'));
  if (!token) {
    throw unauthorized(
      'Informe a chave da API no cabeçalho Authorization: Bearer <chave>.',
    );
  }

  const resolucao = await resolveApiKey(token);

  // Nenhuma chave com este segredo: nao ha nem o que registrar.
  if (!resolucao) throw unauthorized(RECUSA);

  if (!resolucao.ok) {
    // A chave existe, mas alguma conferencia falhou. A recusa fica registrada
    // com o motivo — e e o unico lugar onde esse motivo aparece.
    const recusada = resolucao.key;
    await recordApiKeyEvent({
      keyId: recusada.keyId,
      keyName: recusada.keyName,
      adminUserId: recusada.adminUserId,
      adminName: recusada.adminName,
      action: 'CHAVE_RECUSADA',
      result: 'RECUSADO',
      detail: recusada.reason,
      clientId: recusada.clientId,
      clientName: recusada.clientName,
      ownerUserId: recusada.actingUserId,
      ownerName: recusada.actingUserName,
      ownerRole: 'CANDIDATE',
    });

    throw unauthorized(RECUSA);
  }

  const { key } = resolucao;
  return {
    keyId: key.keyId,
    keyName: key.keyName,
    adminUserId: key.adminUserId,
    adminName: key.adminName,
    owner: {
      userId: key.actingUserId,
      userName: key.actingUserName,
      clientId: key.clientId,
      clientName: key.clientName,
    },
  };
}

/**
 * Registra uma operacao bem-sucedida da chave.
 *
 * Atalho para as rotas: o vinculo ja esta no `caller`, entao cada rota so
 * diz o que fez e sobre qual link.
 */
export async function recordApiCall(
  caller: ApiCaller,
  action: ApiKeyAction,
  inviteId: string | null = null,
): Promise<void> {
  await recordApiKeyEvent({
    keyId: caller.keyId,
    keyName: caller.keyName,
    adminUserId: caller.adminUserId,
    adminName: caller.adminName,
    action,
    result: 'SUCESSO',
    inviteId,
    clientId: caller.owner.clientId,
    clientName: caller.owner.clientName,
    ownerUserId: caller.owner.userId,
    ownerName: caller.owner.userName,
    ownerRole: 'CANDIDATE',
  });
}

/**
 * Recusa qualquer campo no corpo da requisicao.
 *
 * `POST /api/v1/links` nao escolhe nada: dono e time vem do vinculo da
 * chave. Aceitar `donoId` ou `timeId` "por compatibilidade" seria manter de
 * pe justamente o que foi removido — e um dia alguem confiaria neles.
 *
 * Corpo ausente, vazio ou `{}` passa; qualquer campo e recusado com 400,
 * dizendo o que fazer.
 */
export async function requireEmptyBody(request: NextRequest): Promise<void> {
  const raw = (await request.text()).trim();
  if (!raw) return;

  let corpo: unknown;
  try {
    corpo = JSON.parse(raw);
  } catch {
    throw badRequest('Corpo da requisição inválido.');
  }

  if (corpo === null) return;
  if (
    typeof corpo === 'object' &&
    !Array.isArray(corpo) &&
    Object.keys(corpo as Record<string, unknown>).length === 0
  ) {
    return;
  }

  throw badRequest(
    'Esta requisição não recebe campos: o dono e o time do link vêm da chave. ' +
      'Remova donoId e timeId do corpo.',
  );
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
 * `message` — a chave que o proprio painel ja le.
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
