import type { NextRequest } from 'next/server';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { inviteDeviceSignalsSchema } from '@/lib/validation/server.schema';
import { completeInviteAccessSignals } from '@/lib/server/invite-access';
import { readClaim } from '@/lib/server/invite-claim';
import { readInviteContext } from '@/lib/server/public-context';

/**
 * Complementacao unica dos sinais do aparelho do primeiro acesso.
 *
 * Chamada uma vez, depois que `/` carrega. O convite vem do cookie `HttpOnly`
 * de contexto e a autenticacao e a RESERVA do primeiro acesso (outro cookie
 * `HttpOnly`): sem os dois, nada e gravado. Nenhum identificador de convite,
 * time ou pessoa e lido do corpo da requisicao.
 *
 * Aceita somente os campos previstos (`inviteDeviceSignalsSchema`): tipo de
 * aparelho, navegador, sistema, plataforma, resolucao, fuso, idiomas e
 * pontos de toque. Qualquer outro campo e descartado pelo esquema. MAC,
 * IMEI, GPS, canvas e IP em texto puro nao sao aceitos nem existem como
 * coluna.
 *
 * Responde 200 mesmo quando nada e gravado — reserva errada, convite ja
 * complementado ou navegador restritivo. A falha em coletar os sinais nunca
 * pode bloquear o formulario, e o registro do primeiro clique ja existe
 * desde o redirect.
 */
export async function POST(request: NextRequest) {
  try {
    const token = readInviteContext(request);
    const claim = readClaim(request);
    if (!token || !claim) return jsonOk({ ok: true });

    const { device } = await readJson(request, inviteDeviceSignalsSchema);
    await completeInviteAccessSignals(request, token, claim.hash, device);

    return jsonOk({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
