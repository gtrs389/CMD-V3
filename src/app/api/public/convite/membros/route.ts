import { after } from 'next/server';
import type { NextRequest } from 'next/server';
import { badRequest, jsonGone, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import { publicSubmissionSchema } from '@/lib/validation/server.schema';
import { getInviteContext } from '@/lib/server/client.service';
import { createMember, rollbackMember } from '@/lib/server/member.service';
import { assertTeamPhoneAvailable, createMemberAccess } from '@/lib/server/user.service';
import {
  beginInviteSubmit,
  consumeInvite,
  expireDueInvites,
  releaseInviteSubmit,
} from '@/lib/server/invite.service';
import { readClaim } from '@/lib/server/invite-claim';
import { readInviteContext } from '@/lib/server/public-context';
import {
  createPendingVerification,
  recordConfirmation,
  runVerification,
  seedVerificationFromForm,
} from '@/lib/server/verification.service';
import {
  createPendingLocation,
  invalidateLocation,
  resolveLocation,
} from '@/lib/server/map-location.service';
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
  readOrCreateDeviceToken,
  recordMemberDevice,
} from '@/lib/server/device';

/**
 * Envio do formulario publico.
 *
 * O codigo do link vem do cookie `HttpOnly` do contexto, nunca da URL nem do
 * corpo: o payload do formulario nao carrega token nenhum.
 *
 * Nao exige sessao, mas exige um link ativo, no prazo e reservado para este
 * navegador. A operacao E o responsavel pelo cadastro vem sempre do token:
 * nenhum `recruiterUserId`, `clientId` ou campo equivalente do corpo da
 * requisicao e considerado. Forjar o responsavel no payload nao muda nada,
 * porque o valor nem e lido.
 *
 * A expiracao e conferida de novo AQUI, no servidor: quem abriu o formulario
 * antes do prazo e tenta finalizar depois recebe 410 e nada e gravado — nem
 * integrante, nem confirmacao, nem aparelho, nem verificacao, nem acesso.
 *
 * O link vale para UMA pessoa: a transicao CLAIMED -> SUBMITTING acontece de
 * forma atomica no banco, entao dois envios simultaneos nao passam. Se o
 * cadastro falhar antes de ser salvo, o link volta para CLAIMED (mesma
 * reserva, dentro do prazo). Depois que o integrante e salvo, o link fica
 * CONSUMED em definitivo.
 *
 * Nenhuma credencial volta nesta resposta, e nenhuma existe: o integrante
 * nasce com acesso proprio, sem e-mail e sem senha. Ele entra pelo link do
 * time com o telefone deste cadastro. A tela final mostra apenas o
 * agradecimento.
 */

/**
 * Executa uma etapa do cadastro dizendo, no log, QUAL delas falhou.
 *
 * Sem isso, uma falha em qualquer ponto deste fluxo — contexto, telefone,
 * gravacao, acesso — chegava ao log como uma linha solta de banco, sem dizer
 * em que momento do cadastro aconteceu. A linha sai logo antes da falha em
 * si, que `toErrorResponse` registra com o codigo de referencia mostrado a
 * pessoa.
 *
 * Nao registra nada do que a pessoa preencheu.
 */
async function etapa<T>(nome: string, executar: () => Promise<T>): Promise<T> {
  try {
    return await executar();
  } catch (error) {
    console.error(`[cmd] cadastro público falhou na etapa "${nome}"`);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = readInviteContext(request);
    if (!token) return jsonGone('taken');

    const context = await etapa('contexto do link', () => getInviteContext(token));

    // Prazo vencido, cadastro ja concluido ou token substituido. Quem abriu
    // antes do prazo e tenta finalizar depois para aqui: nada e gravado.
    if (context?.finished) {
      await expireDueInvites();
      return jsonGone('expired');
    }
    if (!context || !context.accepts) {
      throw badRequest('Este link não está ativo no momento.');
    }

    // A reserva precisa ser deste navegador. Sem cookie valido, o envio para.
    const claim = readClaim(request);
    if (!claim) return jsonGone('taken');

    const start = await etapa('reserva do envio', () =>
      beginInviteSubmit(token, claim.hash),
    );
    if (start === 'GONE') return jsonGone('expired');
    if (start === 'TAKEN') return jsonGone('taken');
    if (start === 'BUSY') {
      throw badRequest('O cadastro deste link já está sendo enviado.');
    }

    const { client, owner } = context;

    /**
     * Identificador do integrante depois de salvo.
     *
     * Divide o fluxo em dois: ANTES, qualquer falha devolve o link para a
     * mesma pessoa e nada foi gravado; DEPOIS, o cadastro existe e nenhuma
     * etapa restante pode transformar isso em erro na tela — quem preencheu
     * ja esta cadastrado, e mandar "tente de novo" faria a pessoa bater em
     * um link consumido, ou duplicar o proprio cadastro.
     */
    let salvo: string | null = null;

    // A partir daqui o link esta em SUBMITTING: qualquer falha antes de o
    // integrante existir devolve o link para a mesma pessoa.
    try {
      const input = await readJson(request, publicSubmissionSchema);

      // O aviso vigente vem do banco. Se ele exige aceite, o envio sem aceite e
      // recusado aqui, nao apenas na tela.
      const { privacy } = client.form;
      if (privacy.enabled && privacy.requireConsent && !input.consentAt) {
        throw badRequest('E necessário aceitar o aviso de privacidade para enviar o cadastro.');
      }

      // Confirmacao de dados desligada neste time (migration 041): nao ha
      // consulta eleitoral que preencha zona e secao, entao os dois sao
      // obrigatorios. Conferido AQUI tambem, e nao so na tela: o formulario
      // e publico, e um envio montado a mao chegaria sem eles.
      if (!client.verificationEnabled && (!input.zone || !input.section)) {
        throw badRequest('Informe a zona e a seção eleitoral.');
      }

      // Conferencia do telefone ANTES de gravar qualquer coisa: numero ja em
      // uso naquele time interrompe o cadastro sem deixar integrante,
      // usuario ou link orfao. E o telefone que identifica a pessoa no
      // acesso, entao ele nao pode apontar para duas.
      await etapa('conferência do telefone', () =>
        assertTeamPhoneAvailable(client.id, input.phone),
      );

      const { device, ...submission } = input;
      const member = await etapa('gravação do cadastro', () =>
        createMember(
          { ...submission, clientId: client.id, source: 'invite' },
          // Responsavel determinado no servidor, pelo dono do link utilizado.
          owner ? { userId: owner.userId, name: owner.name, role: owner.role } : null,
        ),
      );

      // Acesso do integrante: usuario EQUIPE e link pessoal, criados juntos.
      // Sem e-mail, sem senha e sem primeiro acesso — ele ja entra pelo link
      // do time com o telefone que acabou de informar.
      try {
        await etapa('criação do acesso', () =>
          createMemberAccess({
            clientId: client.id,
            memberId: member.id,
            name: member.name,
            phone: member.phone,
          }),
        );
      } catch (error) {
        await rollbackMember(member.id);
        throw error;
      }

      // Daqui para baixo o cadastro EXISTE. Nenhuma etapa seguinte pode
      // derrubar a resposta.
      salvo = member.id;

      // Integrante salvo: o link esta consumido em definitivo. Se a resposta
      // ao navegador falhar depois daqui, o link segue consumido e nao gera
      // cadastro em duplicidade.
      //
      // Falhar AQUI nao pode virar erro na tela: o cadastro ja esta gravado.
      // Mandar a pessoa tentar de novo criaria um segundo cadastro dela, ou
      // a jogaria contra um link indisponivel.
      await consumeInvite(token, member.id).catch((error: unknown) => {
        console.error('[cmd] cadastro salvo, mas o link não foi fechado:', error);
      });

      // Prova da confirmacao final. Nunca pode impedir o cadastro, que ja
      // esta salvo.
      await recordConfirmation(client.id, member.id).catch(() => undefined);

      // Confirmacao de dados desligada neste time (migration 041): nenhuma
      // verificacao nasce e nenhum token e aproveitado — nem um que viesse
      // forjado no corpo da requisicao. O cadastro daquele time e o que a
      // pessoa declarou, e a ficha dele nao fica com uma verificacao
      // "aguardando" que nunca vai acontecer.
      //
      // Com a confirmacao ligada, a verificacao pode ja ter acontecido no
      // proprio formulario, se a pessoa confirmou CPF e/ou titulo durante o
      // preenchimento: nesse caso o resultado so e gravado, sem consultar o
      // fornecedor de novo (cada consulta e cobrada). Sem token valido, cai
      // no fluxo de sempre.
      const seed = client.verificationEnabled
        ? await seedVerificationFromForm(client.id, member.id, member.cpf, {
            cpfToken: input.cpfToken ?? null,
            tseToken: input.tseToken ?? null,
          }).catch(() => ({ seeded: false, tseSucceeded: false }))
        : { seeded: false, tseSucceeded: false };

      if (client.verificationEnabled && !seed.seeded) {
        await createPendingVerification(client.id, member.id).catch(() => undefined);
      }

      // As consultas acontecem depois da resposta, no servidor. A tela de
      // sucesso nao espera pelo fornecedor e nunca recebe nada delas.
      // A moradia aproximada nao espera pela consulta eleitoral.
      await createPendingLocation(client.id, member.id, 'RESIDENCE').catch(() => undefined);

      // Local de votacao: nasce sempre que a pessoa informou zona e secao,
      // com confirmacao ligada ou desligada. Desde a migration 042 a escola
      // nao e mais consulta paga — ela e uma linha da nossa tabela, achada
      // por UF + zona + secao. Sem os dois numeros nao ha o que procurar, e
      // o vinculo nem chega a existir.
      const temSecao = Boolean(member.zone?.trim() && member.section?.trim());
      if (temSecao) {
        await createPendingLocation(client.id, member.id, 'POLLING_PLACE').catch(() => undefined);
      }

      after(async () => {
        await resolveLocation(member.id, 'RESIDENCE').catch(() => undefined);

        // A escola sai da nossa tabela: nenhum provedor e chamado, entao ela
        // e resolvida em todo time, com a confirmacao ligada ou desligada.
        if (temSecao) {
          await resolveLocation(member.id, 'POLLING_PLACE').catch(() => undefined);
        }

        // Daqui para baixo e so o que depende da FonteData. A moradia e o
        // local de votacao acima ja aconteceram, porque nenhum dos dois
        // depende dela.
        if (!client.verificationEnabled) return;

        if (!seed.seeded) {
          await runVerification(member.id).catch(() => undefined);
          return;
        }

        // Etapa eleitoral ja resolvida no formulario. A zona e a secao que a
        // Justica Eleitoral respondeu ja estao no cadastro (o formulario as
        // preencheu), entao o local acima ja e o certo; refazer o vinculo
        // cobre o caso de o numero digitado antes da consulta ter mudado.
        if (seed.tseSucceeded) {
          await createPendingLocation(client.id, member.id, 'POLLING_PLACE').catch(() => undefined);
          await invalidateLocation(client.id, member.id, 'POLLING_PLACE').catch(() => undefined);
          await resolveLocation(member.id, 'POLLING_PLACE').catch(() => undefined);
        }
      });

      // Sinal de seguranca, gravado depois do cadastro: nunca o impede.
      // O token vive so no cookie; o banco guarda apenas o hash dele.
      const deviceCookie = readOrCreateDeviceToken(request);
      await recordMemberDevice({
        request,
        clientId: client.id,
        memberId: member.id,
        token: deviceCookie.token,
        signals: device,
      });

      // Nenhuma credencial vai para o navegador.
      const response = jsonOk({ ok: true, id: member.id }, 201);

      if (deviceCookie.isNew) {
        response.cookies.set({
          name: DEVICE_COOKIE,
          value: deviceCookie.token,
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: DEVICE_COOKIE_MAX_AGE,
        });
      }

      return response;
    } catch (error) {
      // Cadastro ja gravado: a falha e de uma etapa acessoria (aparelho,
      // verificacao, fechamento do link). A pessoa ja esta cadastrada, entao
      // a tela recebe o sucesso que corresponde ao que aconteceu de fato.
      if (salvo) {
        console.error('[cmd] cadastro salvo, mas a finalização falhou:', error);
        return jsonOk({ ok: true, id: salvo }, 201);
      }

      // Nada foi salvo: a mesma pessoa pode corrigir e tentar de novo,
      // enquanto o prazo do link durar.
      await releaseInviteSubmit(token, claim.hash);
      throw error;
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
