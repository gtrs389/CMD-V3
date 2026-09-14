import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, toErrorResponse } from '@/lib/server/http';
import { listBindableTeams } from '@/lib/server/api-key.service';

/**
 * Times e administradores disponiveis para vincular uma chave.
 *
 * EXCLUSIVO do ADMIN geral: alimenta os dois seletores da criacao de chave.
 * So aparece quem PODE receber vinculo — usuario ativo, com perfil de
 * Administrador do time e ligado aquele time. A criacao confere tudo de novo
 * no banco: a tela nunca decide vinculo.
 *
 * Nao devolve telefone, e-mail, foto, integrantes nem qualquer dado de
 * pessoa cadastrada: apenas nomes e identificadores.
 */
export async function GET() {
  try {
    const user = await requirePermission('settings.manage');
    if (user.role !== 'ADMIN') throw forbidden();

    return jsonOk({ teams: await listBindableTeams() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
