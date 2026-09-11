import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

/**
 * Reserva do primeiro acesso ao link de recrutamento.
 *
 * Cada link serve para UMA pessoa. Quem abre primeiro reserva o acesso, e
 * somente aquele navegador consegue continuar. A reserva e um segredo
 * aleatorio gerado no servidor:
 *
 *  - vai apenas em cookie `HttpOnly`, `Secure` em producao e `SameSite=Lax`;
 *  - o `Path` e `/`, porque as rotas publicas deixaram de carregar o token
 *    no caminho: o convite em andamento vive no cookie de contexto;
 *  - o banco guarda apenas o SHA-256 do segredo;
 *  - o segredo e o hash nunca aparecem em JSON, log ou URL.
 *
 * Nao ha tentativa de obter MAC, IMEI ou identificador fisico: o navegador
 * nao fornece isso. IP e User-Agent tambem nao identificam ninguem aqui.
 */

export const CLAIM_COOKIE = 'cmd_convite';

/** Segredo da reserva: 32 bytes aleatorios em base64url. */
const SECRET_SHAPE = /^[A-Za-z0-9_-]{20,64}$/;

export interface ClaimSecret {
  secret: string;
  hash: string;
  /** Verdadeiro quando o segredo acabou de ser criado e precisa ir no cookie. */
  isNew: boolean;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Le o segredo do cookie, ou cria um novo quando ausente ou malformado. */
export function readOrCreateClaim(request: NextRequest): ClaimSecret {
  const current = request.cookies.get(CLAIM_COOKIE)?.value;
  if (current && SECRET_SHAPE.test(current)) {
    return { secret: current, hash: sha256(current), isNew: false };
  }

  const secret = randomBytes(32).toString('base64url');
  return { secret, hash: sha256(secret), isNew: true };
}

/** Segredo que o navegador enviou, sem criar nenhum novo. */
export function readClaim(request: NextRequest): ClaimSecret | null {
  const current = request.cookies.get(CLAIM_COOKIE)?.value;
  if (!current || !SECRET_SHAPE.test(current)) return null;
  return { secret: current, hash: sha256(current), isNew: false };
}

/**
 * Grava o cookie da reserva.
 *
 * `maxAge` acompanha o prazo do proprio link: o cookie nunca sobrevive ao
 * link. A autorizacao continua sendo do servidor, que confere prazo e estado
 * no banco a cada requisicao.
 */
export function attachClaimCookie(
  response: NextResponse,
  secret: string,
  expiresAt: string,
): void {
  const remaining = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);

  response.cookies.set({
    name: CLAIM_COOKIE,
    value: secret,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.max(60, Number.isFinite(remaining) ? remaining : 60),
  });
}
