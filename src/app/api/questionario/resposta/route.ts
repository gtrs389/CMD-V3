import { after } from 'next/server';
import type { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/server/guard';
import { forbidden, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { surveyMemberSchema } from '@/lib/validation/server.schema';
import { createMember, rollbackMember } from '@/lib/server/member.service';
import { assertTeamPhoneAvailable } from '@/lib/server/user.service';
import { submitSurveyAnswerFromPanel } from '@/lib/server/survey.service';
import { createPendingLocation, resolveLocation } from '@/lib/server/map-location.service';

/**
 * Cadastro feito pelo lider com o FORMULARIO 2, dentro do painel.
 *
 * O lider envia o Formulario 2 por link; quando a pessoa esta na frente
 * dele, ele anota ali mesmo. E, nesse caso, a pessoa precisa aparecer na
 * EQUIPE dele — foi ele quem cadastrou, e o painel dele e onde ele acompanha
 * o proprio trabalho.
 *
 * Por isso um cadastro vira duas coisas ligadas (migration 044):
 *
 *   o INTEGRANTE, com o que o Formulario 2 tem de campo padrao — nome,
 *   telefone e o que o ADMIN tiver copiado do Formulario 1 —, atribuido a
 *   quem preencheu. E ele que aparece na equipe, nas contagens e no mapa;
 *
 *   a RESPOSTA do Formulario 2, com as perguntas proprias dele, na tabela de
 *   sempre e na aba de sempre, ligada ao integrante.
 *
 * Nao e a mesma coisa que o cadastro pelo LINK do Formulario 2: la ninguem
 * vira integrante, e continua assim. O que muda aqui e que existe um lider
 * cadastrando, e o cadastro e dele.
 *
 * Nenhum ACESSO e criado: o Formulario 2 nao da entrada no painel nem link
 * proprio a quem responde, e preencher pelo painel nao pode conceder o que o
 * formulario nao concede. Quem entra pelo link do time continua sendo quem
 * se cadastrou pelo Formulario 1.
 *
 * O time e o responsavel saem da SESSAO. Nenhum identificador do corpo da
 * requisicao decide para onde o cadastro vai nem de quem ele e.
 */
export async function POST(request: NextRequest) {
  try {
    const input = await readJson(request, surveyMemberSchema);

    const { answers, ...ficha } = input;

    // O time e o proprio da sessao: esta tela e do lider, e nao existe
    // cadastrar "no time de outro" por aqui. Perfil sem time (o ADMIN geral)
    // nao passa — ele cadastra pela pagina do time, com o Formulario 1.
    const user = await requirePermission('member.create');
    if (!user.candidateId) throw forbidden('Este perfil não tem questionário.');

    const clientId = user.candidateId;

    // Telefone repetido no time interrompe antes de gravar: nada orfao e
    // criado, e o numero continua identificando uma unica pessoa.
    await assertTeamPhoneAvailable(clientId, ficha.phone);

    const member = await createMember(
      // Sem `responses`: pergunta do Formulario 2 nao e resposta de
      // integrante — ela tem tabela propria, logo abaixo.
      { ...ficha, clientId, responses: [], source: 'admin' },
      { userId: user.id, name: user.name, role: user.role },
    );

    try {
      await submitSurveyAnswerFromPanel(
        { clientId, userId: user.id, name: user.name, role: user.role },
        { name: member.name, phone: member.phone, answers },
        member.id,
      );
    } catch (error) {
      // As respostas sao o cadastro: um integrante sem elas seria uma ficha
      // pela metade, e ninguem saberia disso depois.
      await rollbackMember(member.id);
      throw error;
    }

    // Coordenadas depois da resposta: nunca seguram o cadastro.
    await createPendingLocation(clientId, member.id, 'RESIDENCE').catch(() => undefined);
    if (member.zone?.trim() && member.section?.trim()) {
      await createPendingLocation(clientId, member.id, 'POLLING_PLACE').catch(() => undefined);
    }

    after(async () => {
      await resolveLocation(member.id, 'RESIDENCE').catch(() => undefined);
      await resolveLocation(member.id, 'POLLING_PLACE').catch(() => undefined);
    });

    return jsonOk({ member }, 201);
  } catch (error) {
    return toErrorResponse(error);
  }
}
