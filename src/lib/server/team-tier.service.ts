import 'server-only';
import type { TeamTier } from '@/lib/types';
import { EQUIPE_NAO_CADASTRA, tierCanRecruit, tierOf } from '@/lib/domain/team-tier';
import { TABLES, type MemberRow, type UserRow } from '@/lib/supabase/tables';
import { selectOne } from '@/lib/supabase/rest';
import { forbidden } from './http';

/**
 * Nivel de um usuario do perfil EQUIPE — Lider ou Equipe —, lido do banco.
 *
 * O nivel nao e gravado em lugar nenhum: sai de quem cadastrou o integrante
 * correspondente (`domain/team-tier.ts`). Por isso a conferencia e sempre
 * feita na hora, e nunca a partir de algo que o navegador mandou.
 *
 * Fora do perfil EQUIPE nao ha nivel: devolve `null`.
 */
export async function tierOfUser(
  user: Pick<UserRow, 'role' | 'member_id'>,
): Promise<TeamTier | null> {
  if (user.role !== 'EQUIPE' || !user.member_id) return null;

  const member = await selectOne<Pick<MemberRow, 'recruited_by_role'>>(TABLES.members, {
    select: 'recruited_by_role',
    filters: { id: `eq.${user.member_id}` },
  });
  return tierOf(member?.recruited_by_role);
}

/** O mesmo, a partir do identificador do usuario. */
export async function tierOfUserId(userId: string): Promise<TeamTier | null> {
  const user = await selectOne<Pick<UserRow, 'role' | 'member_id'>>(TABLES.users, {
    select: 'role,member_id',
    filters: { id: `eq.${userId}` },
  });
  return user ? tierOfUser(user) : null;
}

/**
 * Recusa quem e da Equipe como responsavel por um cadastro novo.
 *
 * E a porta por onde todo cadastro passa (`createMember`), e por onde toda
 * troca de responsavel passa (`transferMember`): esconder o botao da Equipe
 * nao bastaria, porque um link pessoal antigo ou uma requisicao montada a
 * mao chegariam aqui do mesmo jeito.
 */
export async function assertCanRecruit(recruiter: {
  userId: string | null;
  role: string;
}): Promise<void> {
  if (recruiter.role !== 'EQUIPE' || !recruiter.userId) return;
  if (!tierCanRecruit(await tierOfUserId(recruiter.userId))) throw forbidden(EQUIPE_NAO_CADASTRA);
}
