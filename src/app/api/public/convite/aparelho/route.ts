import type { NextRequest } from 'next/server';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { inviteDeviceSignalsSchema } from '@/lib/validation/server.schema';
import { completeInviteAccessSignals } from '@/lib/server/invite-access';
import {
  clearClickCookie,
  completeInviteClickSignals,
  readClickCookie,
} from '@/lib/server/invite-click';
import { readClaim } from '@/lib/server/invite-claim';
import { readInviteContext } from '@/lib/server/public-context';

/**
 * Complementacao dos dados do navegador, uma unica vez por clique.
 *
 * Chamada logo depois que a tela carrega — tanto o formulario quanto a tela
 * de link indisponivel. Tudo vem de cookies `HttpOnly`: o clique em
 * andamento, o convite e a reserva. Nenhum identificador de clique, convite,
 * time ou pessoa e lido do corpo da requisicao.
 *
 * Dois destinos, ambos parte do mesmo rastreamento:
 *
 *  1. o CLIQUE daquela abertura (migration 021), identificado pelo contexto
 *     temporario. Atualiza somente esse clique, e so enquanto os dados ainda
 *     nao tiverem chegado. Depois o contexto e consumido e apagado;
 *  2. o aparelho do PRIMEIRO acesso (migration 020), quando o convite ainda
 *     esta em andamento e a reserva e deste navegador.
 *
 * Aceita somente os campos previstos: tipo de aparelho, navegador, sistema,
 * plataforma, resolucao, area visivel, fuso, idiomas e pontos de toque.
 * Qualquer outro campo e descartado pelo esquema. MAC, IMEI, GPS, canvas e
 * IP em texto puro nao sao aceitos nem existem como coluna.
 *
 * Responde 200 mesmo quando nada e gravado — clique ja complementado,
 * contexto vencido ou navegador restritivo. A falha em coletar os sinais
 * nunca pode bloquear a tela, e o clique com o horario do banco e os dados
 * do servidor ja ficou registrado na abertura.
 *
 * Nada de rastreamento volta nesta resposta.
 */
export async function POST(request: NextRequest) {
  try {
    const { device } = await readJson(request, inviteDeviceSignalsSchema);

    const clickId = readClickCookie(request);
    if (clickId) await completeInviteClickSignals(request, clickId, device);

    const token = readInviteContext(request);
    const claim = readClaim(request);
    if (token && claim) {
      await completeInviteAccessSignals(request, token, claim.hash, device);
    }

    const response = jsonOk({ ok: true });
    // Contexto do clique consumido: ele nao serve para mais nada.
    if (clickId) clearClickCookie(response);
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
