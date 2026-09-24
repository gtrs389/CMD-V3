import 'server-only';
import { TABLES, type InviteEventRow, type InviteRow } from '@/lib/supabase/tables';
import { selectOne } from '@/lib/supabase/rest';

/**
 * Link de cadastro pelo qual o integrante entrou, para a ficha.
 *
 * Exclusivo do ADMIN geral: a rota confere `device.view` antes de chamar
 * qualquer coisa daqui.
 *
 * O historico (`cmd_invite_events`) diz de QUEM era o link, quem gerou e
 * quando, mas nunca guarda o token. O endereco em si so existe enquanto o
 * convite ainda esta na mesma geracao do cadastro: renovar o link pessoal
 * sobrescreve o token, e dali em diante o endereco antigo nao volta mais.
 * Nesse caso `token` sai nulo e o resto continua valendo.
 */

export interface MemberSignupLink {
  /** Token do link usado. Nulo quando o link ja foi renovado depois do cadastro. */
  token: string | null;
  ownerName: string | null;
  generatedByName: string | null;
  generatedAt: string | null;
  consumedAt: string | null;
  generation: number;
}

export async function getMemberSignupLink(memberId: string): Promise<MemberSignupLink | null> {
  const [consumed, invite] = await Promise.all([
    selectOne<Pick<InviteEventRow, 'invite_ref' | 'generation' | 'owner_name' | 'occurred_at'>>(
      TABLES.inviteEvents,
      {
        select: 'invite_ref,generation,owner_name,occurred_at',
        filters: { member_id: `eq.${memberId}`, event: 'eq.CONSUMED' },
        order: 'occurred_at.desc',
      },
    ),
    selectOne<
      Pick<InviteRow, 'id' | 'token' | 'generation' | 'owner_name' | 'generated_by_name' | 'issued_at' | 'consumed_at'>
    >(TABLES.invites, {
      select: 'id,token,generation,owner_name,generated_by_name,issued_at,consumed_at',
      filters: { member_id: `eq.${memberId}` },
    }),
  ]);

  if (!consumed && !invite) return null;

  const inviteRef = consumed?.invite_ref ?? invite!.id;
  const generation = consumed?.generation ?? invite!.generation;

  // O convite corrente so vale se ainda for a MESMA geracao do cadastro.
  const sameGeneration = invite && invite.id === inviteRef && invite.generation === generation;

  const generated = await selectOne<
    Pick<InviteEventRow, 'occurred_at' | 'generated_by_name'>
  >(TABLES.inviteEvents, {
    select: 'occurred_at,generated_by_name',
    filters: {
      invite_ref: `eq.${inviteRef}`,
      generation: `eq.${generation}`,
      event: 'eq.GENERATED',
    },
  });

  return {
    token: sameGeneration ? invite.token : null,
    ownerName: consumed?.owner_name ?? invite?.owner_name ?? null,
    generatedByName:
      generated?.generated_by_name ?? (sameGeneration ? invite.generated_by_name : null),
    generatedAt: generated?.occurred_at ?? (sameGeneration ? invite.issued_at : null),
    consumedAt: consumed?.occurred_at ?? (sameGeneration ? invite.consumed_at : null),
    generation,
  };
}
