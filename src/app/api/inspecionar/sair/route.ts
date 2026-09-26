import type { NextRequest } from 'next/server';
import { INSPECTION_RETURN_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth/constants';
import { endImpersonation } from '@/lib/server/impersonation.service';
import { jsonOk } from '@/lib/server/http';

/**
 * Sai da inspecao: revoga a sessao aberta no painel da pessoa e fecha o
 * registro da visita.
 *
 * Nao e logout da pessoa: as sessoes dela, no celular dela, continuam
 * valendo — esta rota so alcanca a sessao que o proprio ADMIN abriu, porque
 * a funcao do banco exige `impersonated_by` preenchido.
 *
 * Sair nunca pode falhar: o cookie e trocado de qualquer forma.
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const volta = request.cookies.get(INSPECTION_RETURN_COOKIE)?.value;

  try {
    await endImpersonation(token);
  } catch (error) {
    console.error('[inspeção] Falha ao encerrar a sessão de inspeção:', error);
  }

  const response = jsonOk({ ok: true, restored: Boolean(volta) });

  // Onde os enderecos sao separados, nao ha sessao guardada: o cookie sai e
  // o ADMIN continua no painel dele, na outra aba, intacto.
  response.cookies.set({
    name: SESSION_COOKIE,
    value: volta ?? '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: volta ? SESSION_MAX_AGE : 0,
  });

  response.cookies.set({
    name: INSPECTION_RETURN_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return response;
}
