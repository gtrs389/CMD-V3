import 'server-only';
import type { Role } from '@/lib/types';
import { createToken, hashToken } from '@/lib/auth/tokens';
import { SESSION_MAX_AGE } from '@/lib/auth/constants';
import { TABLES, type UserRow } from '@/lib/supabase/tables';
import { callFunction, insertOne, selectOne } from '@/lib/supabase/rest';
import { badRequest, forbidden, notFound } from './http';

/**
 * O ADMIN geral entra no painel de uma pessoa do time (migration 045).
 *
 * A sessao aberta aqui e uma sessao DE VERDADE: quem entra passa a ver e a
 * poder o que aquela pessoa ve e pode. Nada e simulado, e e justamente por
 * isso que cada visita deixa rastro proprio em `cmd_impersonations` — quem
 * abriu, em nome de quem, quando comecou e quando terminou.
 *
 * POR QUE UMA AUTORIZACAO DE USO UNICO, E NAO UM BOTAO QUE JA TROCA A SESSAO
 *
 * Em producao o ADMIN geral trabalha em um endereco exclusivo e a sessao
 * dele so vale la; a sessao de quem nao e ADMIN so vale em `painel.`. Um
 * cookie nao atravessa essa fronteira — e essa separacao existe de
 * proposito. Entao o painel do ADMIN emite uma autorizacao curta, de uso
 * unico, e quem a troca por sessao e o outro endereco, no mesmo desenho do
 * link de acesso do time.
 *
 * O QUE ESTE MODULO NUNCA FAZ
 *
 *   - nao abre o painel de outro ADMIN geral: a recusa esta aqui E na
 *     funcao do banco, porque a tela nunca e a protecao;
 *   - nao toca no aparelho autorizado da pessoa nem nas sessoes dela: ela
 *     continua entrando normalmente, e sair da inspecao nao a desconecta;
 *   - nao guarda o token da autorizacao: o banco recebe apenas o hash.
 */

/** Prazo da autorizacao: o suficiente para abrir a aba, e nada alem disso. */
const GRANT_TTL_MS = 3 * 60_000;

export interface ImpersonationGrant {
  /** Token bruto. Existe uma unica vez, nesta resposta. */
  token: string;
  targetName: string;
  targetRole: Extract<Role, 'CANDIDATE' | 'EQUIPE'>;
  expiresAt: string;
}

type TargetColumns = Pick<UserRow, 'id' | 'name' | 'role' | 'client_id' | 'is_active'>;

/**
 * Emite a autorizacao para entrar no painel de um usuario.
 *
 * Quem chama ja conferiu a permissao; aqui se confere a PESSOA, contra a
 * linha do banco: ativa, do perfil certo e diferente de quem esta pedindo.
 */
export async function grantImpersonation(
  admin: { id: string; name: string; role: Role },
  targetUserId: string,
): Promise<ImpersonationGrant> {
  if (admin.role !== 'ADMIN') throw forbidden();
  if (admin.id === targetUserId) throw badRequest('Você já está no seu próprio painel.');

  const target = await selectOne<TargetColumns>(TABLES.users, {
    select: 'id,name,role,client_id,is_active',
    filters: { id: `eq.${targetUserId}` },
  });

  if (!target) throw notFound('Pessoa não encontrada.');
  if (!target.is_active) {
    throw badRequest('O acesso desta pessoa está desligado. Religue antes de entrar no painel dela.');
  }
  if (target.role !== 'CANDIDATE' && target.role !== 'EQUIPE') {
    // Nenhum ADMIN geral entra no painel de outro ADMIN geral.
    throw forbidden();
  }

  const token = createToken();
  const expiresAt = new Date(Date.now() + GRANT_TTL_MS).toISOString();

  await insertOne(
    TABLES.impersonations,
    {
      token_hash: hashToken(token),
      admin_user_id: admin.id,
      admin_name: admin.name,
      target_user_id: target.id,
      target_name: target.name,
      target_role: target.role,
      client_id: target.client_id,
      expires_at: expiresAt,
    },
    'id',
  );

  return { token, targetName: target.name, targetRole: target.role, expiresAt };
}

export interface ClaimedImpersonation {
  /** Token bruto da sessao aberta. O banco guarda apenas o hash. */
  sessionToken: string;
  targetUserId: string;
}

/**
 * Troca a autorizacao por uma sessao, uma unica vez.
 *
 * Quem decide e o banco, em uma transacao so (`cmd_impersonation_claim`):
 * autorizacao ja usada, vencida, ou pessoa que saiu do ar entre a emissao e
 * o clique nao abrem sessao nenhuma. Dois cliques simultaneos no mesmo
 * endereco resultam em UMA sessao.
 */
export async function claimImpersonation(token: string): Promise<ClaimedImpersonation | null> {
  if (!token) return null;

  const sessionToken = createToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();

  const rows = await callFunction<{ target_user_id: string }[]>('cmd_impersonation_claim', {
    p_token_hash: hashToken(token),
    p_session_token_hash: hashToken(sessionToken),
    p_expires_at: expiresAt,
  }).catch(() => null);

  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.target_user_id) return null;

  return { sessionToken, targetUserId: row.target_user_id };
}

/**
 * Encerra a visita: revoga a sessao e fecha o registro.
 *
 * Devolve `false` quando o token nao e de uma sessao de inspecao — sair de
 * uma sessao comum e logout, e nao passa por aqui.
 */
export async function endImpersonation(sessionToken: string | undefined): Promise<boolean> {
  if (!sessionToken) return false;

  const result = await callFunction<boolean>('cmd_impersonation_end', {
    p_session_token_hash: hashToken(sessionToken),
  }).catch(() => false);

  return result === true;
}
