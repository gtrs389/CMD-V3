import type { NextRequest } from 'next/server';
import { requireClientAccess } from '@/lib/server/guard';
import { jsonOk, notFound, toErrorResponse } from '@/lib/server/http';
import { getClient } from '@/lib/server/client.service';
import { listMembersByClient } from '@/lib/server/member.service';
import { montarDossie } from '@/lib/domain/dossie';
import { resumoParaONeo } from '@/lib/domain/neo';
import {
  NEO_ERRO_MENSAGEM,
  NeoFalhou,
  analisarComONeo,
  modeloDoNeo,
} from '@/lib/server/neo.service';

/**
 * O NEO escreve pouco mais de uma pagina de analise: a chamada a OpenAI
 * pode levar mais de um minuto. Sem isto, a plataforma derrubaria a funcao
 * no limite padrao, no meio da escrita.
 */
export const maxDuration = 120;

/**
 * Relatorio do time, pelo NEO.
 *
 * Devolve DUAS coisas, e o PDF e montado no navegador a partir delas:
 *
 *   `dossie` — tudo o que o sistema sabe do time, calculado do banco:
 *              numeros, Lideres, Administradores, lista de pessoas e
 *              inconsistencias. Sempre vem;
 *   `neo`    — a analise escrita pelo NEO, ou nulo quando ele nao pode
 *              escrever (sem chave, fora do ar). O relatorio sai do mesmo
 *              jeito, com os numeros, e `neoErro` diz por que.
 *
 * E DO ADMIN GERAL (`member.export`): o relatorio carrega a lista inteira do
 * time, com telefone, e sai do sistema como um arquivo — a mesma regra da
 * planilha da equipe.
 */
export async function POST(_request: NextRequest, ctx: RouteContext<'/api/clients/[id]/relatorio'>) {
  try {
    const { id } = await ctx.params;
    await requireClientAccess('member.export', id);

    const client = await getClient(id);
    if (!client) throw notFound('Time não encontrado.');

    const members = await listMembersByClient(id);
    const dossie = montarDossie(client, members);

    let neo = null;
    let neoErro: string | null = null;
    try {
      neo = await analisarComONeo(resumoParaONeo(dossie));
    } catch (error) {
      neoErro =
        error instanceof NeoFalhou
          ? NEO_ERRO_MENSAGEM[error.codigo]
          : NEO_ERRO_MENSAGEM.INDISPONIVEL;
    }

    return jsonOk({ dossie, neo, neoErro, modelo: modeloDoNeo() });
  } catch (error) {
    return toErrorResponse(error);
  }
}
