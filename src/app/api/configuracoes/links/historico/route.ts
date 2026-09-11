import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, toErrorResponse } from '@/lib/server/http';
import { listInviteHistory, type InviteHistoryFilter } from '@/lib/server/settings.service';
import type { InviteState } from '@/lib/domain/invite-expiration';

const STATES: readonly InviteState[] = [
  'ACTIVE',
  'CLAIMED',
  'SUBMITTING',
  'CONSUMED',
  'EXPIRED',
  'REVOKED',
];

/**
 * Historico dos links, somente para o ADMIN (`settings.view`).
 *
 * CANDIDATE e EQUIPE recebem 403: eles veem apenas o estado e o prazo do
 * proprio link atual, no painel deles. A resposta nao traz token, segredo da
 * reserva, senha, CPF, IP nem identificador interno de usuario.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission('settings.view');

    const params = request.nextUrl.searchParams;
    const role = params.get('perfil');
    const state = params.get('status');

    const filter: InviteHistoryFilter = {
      role: role === 'CANDIDATE' || role === 'EQUIPE' ? role : undefined,
      state: STATES.includes((state ?? '') as InviteState) ? (state as InviteState) : undefined,
      from: params.get('de') ?? undefined,
      to: params.get('ate') ?? undefined,
    };

    return jsonOk({ history: await listInviteHistory(filter) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
