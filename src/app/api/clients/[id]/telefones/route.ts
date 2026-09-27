import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { listMembersByClient, updateMember } from '@/lib/server/member.service';
import { assertTeamPhoneAvailable, syncMemberAccess } from '@/lib/server/user.service';
import { canReachMember } from '@/lib/permissions';
import { completarTelefone } from '@/lib/domain/completar-telefone';

/** Centenas de fichas, cada uma com duas ou tres idas ao banco. */
export const maxDuration = 60;

const corpoSchema = z.object({
  memberIds: z.array(z.string().min(1).max(64)).min(1).max(5000),
});

/**
 * Completa, de uma vez, os telefones sem DDD ou sem o 9 (ver
 * `completar-telefone.ts`) das fichas que a pessoa CONFIRMOU na tela.
 *
 * O numero novo nao vem do corpo: e recalculado aqui, a partir do que esta
 * gravado. Ficha que ja foi corrigida (ou que nao se encaixa nas regras) e
 * simplesmente pulada — clicar duas vezes nao estraga nada.
 *
 * Grava pelo mesmo caminho da edicao da ficha, e o acesso acompanha o
 * numero. Uma diferenca, de proposito: quando o numero corrigido ja e o
 * acesso de OUTRA pessoa do time, a ficha e corrigida mesmo assim (o dado
 * certo e o dado certo), mas o acesso dela nao e mexido — dois acessos com
 * o mesmo numero fariam o link do time recusar os dois.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/clients/[id]/telefones'>) {
  try {
    const { id } = await ctx.params;
    const user = await requireClientAccess('member.update', id);
    const { memberIds } = await readJson(request, corpoSchema);

    const pedidos = new Set(memberIds);
    const fichas = (await listMembersByClient(id)).filter(
      (m) =>
        pedidos.has(m.id) &&
        canReachMember(user, { clientId: m.clientId, recruitedByUserId: m.recruitedBy?.userId ?? null }),
    );

    let corrigidos = 0;
    let semMexerNoAcesso = 0;
    let pulados = memberIds.length - fichas.length;

    // As correcoes, decididas ANTES de gravar: duas fichas que viram o mesmo
    // numero nesta mesma correcao nao podem ganhar, as duas, o acesso por
    // ele — so a primeira; as outras tem so a ficha corrigida.
    const vistos = new Set<string>();
    const tarefas = fichas.flatMap((ficha) => {
      const correcao = completarTelefone(ficha.phone);
      if (!correcao) {
        pulados += 1;
        return [];
      }
      const repetidoAqui = vistos.has(correcao.novo);
      vistos.add(correcao.novo);
      return [{ ficha, novo: correcao.novo, repetidoAqui }];
    });

    // Poucas de cada vez: rapido, sem afogar o banco.
    const LOTE = 8;
    for (let i = 0; i < tarefas.length; i += LOTE) {
      await Promise.all(
        tarefas.slice(i, i + LOTE).map(async ({ ficha, novo, repetidoAqui }) => {
          const correcao = { novo };
          let livre = !repetidoAqui;
          if (livre) {
            try {
              await assertTeamPhoneAvailable(ficha.clientId, correcao.novo, { memberId: ficha.id });
            } catch {
              livre = false;
            }
          }
          await updateMember(ficha.id, { phone: correcao.novo });
          if (livre) {
            await syncMemberAccess(ficha.id, { clientId: ficha.clientId, phone: correcao.novo });
          } else {
            semMexerNoAcesso += 1;
          }
          corrigidos += 1;
        }),
      );
    }

    return jsonOk({ corrigidos, semMexerNoAcesso, pulados });
  } catch (error) {
    return toErrorResponse(error);
  }
}
