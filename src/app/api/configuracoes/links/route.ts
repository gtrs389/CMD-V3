import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { inviteExpirationSchema } from '@/lib/validation/server.schema';
import { getInviteExpiration, updateInviteExpiration } from '@/lib/server/settings.service';
import { toSeconds } from '@/lib/domain/invite-expiration';

/**
 * Duracao dos links de recrutamento.
 *
 * Exclusivo do ADMIN: sem `settings.view` a leitura responde 403, e sem
 * `settings.manage` a gravacao tambem. CANDIDATE e EQUIPE nao alcancam esta
 * rota, e nada daqui aparece na resposta publica do convite.
 */
export async function GET() {
  try {
    await requirePermission('settings.view');
    return jsonOk({ expiration: await getInviteExpiration() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requirePermission('settings.manage');
    const input = await readJson(request, inviteExpirationSchema);

    // A conversao para segundos acontece aqui, a partir de uma unidade de
    // lista fechada. Nenhum intervalo e montado com texto do usuario.
    const expiration = await updateInviteExpiration({
      candidateSeconds: toSeconds(input.candidate.amount, input.candidate.unit),
      teamSeconds: toSeconds(input.team.amount, input.team.unit),
    });

    return jsonOk({ expiration });
  } catch (error) {
    return toErrorResponse(error);
  }
}
