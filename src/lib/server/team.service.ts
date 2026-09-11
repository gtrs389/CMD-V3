import 'server-only';
import type { TeamOverview } from '@/lib/types';
import {
  TABLES,
  type ClientRow,
  type FormFieldRow,
  type MemberRow,
} from '@/lib/supabase/tables';
import { selectOne, selectRows } from '@/lib/supabase/rest';
import { signedUrl } from '@/lib/supabase/storage';
import { toFormConfig } from './mappers';
import { listMembersRecruitedBy } from './member.service';
import { findInviteByUser } from './invite.service';
import { notFound } from './http';
import type { TeamSession } from './guard';

/**
 * Pagina "Minha mobilizacao".
 *
 * Tudo aqui sai da sessao: o integrante e a operacao vem de `cmd_users`,
 * nunca da URL ou do corpo da requisicao. A lista traz apenas os recrutados
 * diretos, o formulario vem somente para leitura e o unico link exibido e o
 * pessoal do proprio integrante.
 */
export async function getTeamOverview(session: TeamSession): Promise<TeamOverview> {
  const member = await selectOne<Pick<MemberRow, 'id' | 'client_id' | 'name' | 'email' | 'photo_path'>>(
    TABLES.members,
    {
      select: 'id,client_id,name,email,photo_path',
      // O par integrante + operacao vem da sessao: um nao vale sem o outro.
      filters: { id: `eq.${session.memberId}`, client_id: `eq.${session.candidateId}` },
    },
  );
  if (!member) throw notFound('Integrante não encontrado.');

  const client = await selectOne<ClientRow>(TABLES.clients, {
    select: '*',
    filters: { id: `eq.${session.candidateId}` },
  });
  if (!client) throw notFound('Candidato não encontrado.');

  const [members, fields, photo, invite] = await Promise.all([
    listMembersRecruitedBy(session.id, session.candidateId),
    selectRows<FormFieldRow>(TABLES.formFields, {
      select: '*',
      filters: { client_id: `eq.${session.candidateId}` },
      order: 'position.asc',
    }),
    signedUrl(member.photo_path),
    findInviteByUser(session.id),
  ]);

  return {
    profile: {
      memberId: member.id,
      name: member.name,
      email: member.email ?? session.email,
      photo,
    },
    candidateName: client.name,
    members,
    form: toFormConfig(client, fields),
    invite: {
      // O link continua o mesmo depois de sair, entrar de novo, trocar de
      // aparelho ou recarregar: ele e lido do banco, nao do navegador.
      token: invite?.token ?? null,
      active: invite?.active ?? false,
      operationActive: client.recruiting_active,
    },
  };
}
