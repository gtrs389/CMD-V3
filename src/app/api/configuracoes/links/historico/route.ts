import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import {
  listInviteTracking,
  type InviteTrackingFilter,
} from '@/lib/server/invite-tracking.service';
import type { InviteState } from '@/lib/domain/invite-expiration';

const STATES: readonly InviteState[] = [
  'ACTIVE',
  'CLAIMED',
  'SUBMITTING',
  'CONSUMED',
  'EXPIRED',
  'REVOKED',
];

/** Texto de filtro: recorte de leitura, limitado no servidor. */
function text(value: string | null, max = 120): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/**
 * Rastreamento dos links de recrutamento. EXCLUSIVO do ADMIN geral.
 *
 * Duas barreiras: a permissao `settings.view` e o perfil ADMIN. Administrador
 * do time (CANDIDATE) e integrante EQUIPE recebem 403 mesmo pedindo o
 * historico do proprio link — bater direto nesta rota nao devolve nada.
 * Isso nao muda em nada a capacidade deles de gerar e copiar o proprio link.
 *
 * A resposta nao traz token, URL do convite, hash do token, hash do IP,
 * segredo da reserva, senha, CPF, titulo de eleitor nem retorno de consulta
 * cadastral.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission('settings.view');
    if (user.role !== 'ADMIN') throw forbidden();

    const params = request.nextUrl.searchParams;
    const role = params.get('perfil');
    const state = params.get('status');

    const filter: InviteTrackingFilter = {
      clientId: text(params.get('time'), 64),
      owner: text(params.get('dono')),
      role: role === 'CANDIDATE' || role === 'EQUIPE' ? role : undefined,
      generatedBy: text(params.get('gerador')),
      state: STATES.includes((state ?? '') as InviteState) ? (state as InviteState) : undefined,
      from: text(params.get('de'), 40),
      to: text(params.get('ate'), 40),
    };

    return jsonOk({ history: await listInviteTracking(filter) });
  } catch (error) {
    return toErrorResponse(error);
  }
}
