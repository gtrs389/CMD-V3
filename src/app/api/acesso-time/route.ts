import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/constants';
import { jsonError, jsonOk, readJson, toErrorResponse } from '@/lib/server/http';
import {
  ADMIN_DEVICE_COOKIE,
  ADMIN_DEVICE_COOKIE_MAX_AGE,
  readOrCreateAdminDeviceToken,
} from '@/lib/server/admin-device';
import { GENERIC_LINK_ERROR, loginWithTeamPhone } from '@/lib/server/team-access.service';
import { clearTeamAccessContext, readTeamAccessContext } from '@/lib/server/public-context';
import { teamPhoneLoginSchema } from '@/lib/validation/server.schema';

/**
 * Entrada pelo link do time: contexto do link + telefone + aparelho.
 *
 * O codigo do link vem do cookie `HttpOnly` gravado pela rota de entrada:
 * nem a URL nem o corpo da requisicao carregam token. O telefone e
 * comparado apenas na forma normalizada, dentro do time que o link
 * identificou e apenas entre as pessoas do publico daquele endereco.
 *
 * O terceiro fator e a credencial secreta do aparelho: ela nasce aqui, no
 * servidor, no primeiro acesso valido, vai somente no cookie HttpOnly e o
 * banco guarda apenas o SHA-256 dela. Quem ja tem aparelho vinculado so
 * entra apresentando a mesma credencial.
 *
 * Telefone errado, acesso inativo e aparelho diferente recebem exatamente a
 * MESMA resposta: dizer qual foi o caso ja entregaria informacao. Nem
 * telefone, nem token, nem credencial, nem URL completa aparecem em log.
 */
export async function POST(request: NextRequest) {
  try {
    const token = readTeamAccessContext(request);
    if (!token) return jsonError(410, GENERIC_LINK_ERROR);

    const { phone, device } = await readJson(request, teamPhoneLoginSchema);

    // Lido do cookie quando ja existe; sorteado aqui quando e o primeiro
    // acesso daquele navegador. O frontend nunca escolhe este valor.
    const deviceCookie = readOrCreateAdminDeviceToken(request);

    const result = await loginWithTeamPhone({
      token,
      phone,
      deviceToken: deviceCookie.token,
      request,
      signals: device,
    });

    if (!result.user || !result.sessionToken) {
      const linkMorto = result.message === GENERIC_LINK_ERROR;
      const status = result.throttled ? 429 : linkMorto ? 410 : 401;

      const recusa = jsonError(status, result.message ?? GENERIC_LINK_ERROR);

      // Link revogado ou substituido: o contexto guardado nao serve mais e
      // sai junto, para a tela nao insistir em um endereco morto. Telefone
      // errado nao apaga nada: a pessoa continua na mesma tela e tenta de
      // novo.
      if (linkMorto) clearTeamAccessContext(recusa);
      return recusa;
    }

    const response = jsonOk({ user: result.user });

    // O contexto temporario do acesso morre aqui: ele existia apenas para a
    // pessoa digitar o telefone.
    clearTeamAccessContext(response);

    response.cookies.set({
      name: SESSION_COOKIE,
      value: result.sessionToken,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });

    // Credencial do aparelho: persistente, sem `Domain`, e nunca em
    // localStorage ou sessionStorage. Reescrita a cada acesso valido para
    // renovar o prazo do cookie.
    response.cookies.set({
      name: ADMIN_DEVICE_COOKIE,
      value: deviceCookie.token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ADMIN_DEVICE_COOKIE_MAX_AGE,
    });

    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
