import 'server-only';
import type { Member, TeamOverview } from '@/lib/types';
import type { InviteState } from '@/lib/domain/invite-expiration';
import { TABLES, type ClientRow, type MemberRow } from '@/lib/supabase/tables';
import { selectOne } from '@/lib/supabase/rest';
import { signedUrl } from '@/lib/supabase/storage';
import { hiddenFormConfig } from './form-visibility';
import { listMembersRecruitedBy } from './member.service';
import { findInviteByUser } from './invite.service';
import { notFound } from './http';
import type { TeamSession } from './guard';

/**
 * O integrante da equipe ve quem cadastrou, mas so nome, foto e telefone.
 * CPF, titulo de eleitor, endereco, e-mail, respostas do formulario,
 * consentimento e quem recrutou sao dados do ADMIN: nunca saem daqui.
 */
function redactForEquipe(member: Member): Member {
  return {
    ...member,
    email: null,
    gender: null,
    cpf: null,
    voterId: null,
    zone: null,
    section: null,
    state: null,
    city: null,
    district: null,
    street: null,
    relationshipOptionId: null,
    relationshipLabel: null,
    responses: [],
    consentAt: null,
    recruitedBy: null,
  };
}

/**
 * Pagina "Minha mobilizacao".
 *
 * Tudo aqui sai da sessao: o integrante e a operacao vem de `cmd_users`,
 * nunca da URL ou do corpo da requisicao. A lista traz apenas os recrutados
 * diretos e o unico link exibido e o pessoal do proprio integrante.
 *
 * A area interna do formulario e do ADMIN: a configuracao dos campos nao e
 * consultada no banco nem enviada ao navegador. Trocar a URL, adicionar
 * parametro ou montar a requisicao na mao nao muda isso, porque a resposta
 * nunca carrega esses dados.
 */
export async function getTeamOverview(session: TeamSession): Promise<TeamOverview> {
  const member = await selectOne<
    Pick<MemberRow, 'id' | 'client_id' | 'name' | 'email' | 'photo_path' | 'created_at'>
  >(
    TABLES.members,
    {
      select: 'id,client_id,name,email,photo_path,created_at',
      // O par integrante + operacao vem da sessao: um nao vale sem o outro.
      filters: { id: `eq.${session.memberId}`, client_id: `eq.${session.candidateId}` },
    },
  );
  if (!member) throw notFound('Integrante não encontrado.');

  const client = await selectOne<ClientRow>(TABLES.clients, {
    select: '*',
    filters: { id: `eq.${session.candidateId}` },
  });
  if (!client) throw notFound('Time não encontrado.');

  const [members, photo, invite] = await Promise.all([
    listMembersRecruitedBy(session.id, session.candidateId),
    signedUrl(member.photo_path),
    findInviteByUser(session.id),
  ]);

  return {
    profile: {
      memberId: member.id,
      name: member.name,
      email: member.email ?? session.email,
      photo,
      candidateName: client.name,
      joinedAt: member.created_at,
    },

    // Mesmo formato da pagina do time, com o escopo do integrante: a
    // identidade e a dele e o convite e o link PESSOAL dele.
    client: {
      id: client.id,
      name: member.name,
      email: member.email ?? session.email,
      photo,
      notes: '',
      createdAt: member.created_at,
      updatedAt: member.created_at,
      invite: {
        // O link continua o mesmo depois de sair, entrar de novo, trocar de
        // aparelho ou recarregar: ele e lido do banco, nao do navegador.
        token: invite?.token ?? null,
        // O recrutamento da operacao manda: desligado pelo ADMIN, o link
        // pessoal para de aceitar cadastros junto com todos os outros.
        active: client.recruiting_active && (invite?.active ?? false),
        createdAt: invite?.created_at ?? member.created_at,
        rotatedAt: invite?.rotated_at ?? null,
        // Prazo obrigatorio: sem convite carregado o link aparece expirado,
        // porque nenhum link do sistema e eterno.
        state: (invite?.status as InviteState) ?? 'EXPIRED',
        issuedAt: invite?.issued_at ?? member.created_at,
        expiresAt: invite?.expires_at ?? member.created_at,
      },
      // Nenhuma configuracao de formulario: nem campos, nem opcoes, nem
      // textos, nem contagem de campos ativos ou obrigatorios.
      form: hiddenFormConfig(),
    },

    members: members.map(redactForEquipe),
  };
}
