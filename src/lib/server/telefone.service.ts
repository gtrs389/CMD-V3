import 'server-only';
import type { Member } from '@/lib/types';
import { TABLES, type MemberRow, type UserRow } from '@/lib/supabase/tables';
import { selectOne, updateRows } from '@/lib/supabase/rest';
import { completarTelefone } from '@/lib/domain/completar-telefone';
import { assertTeamPhoneAvailable } from './user.service';

/**
 * Telefones sem DDD ou sem o 9, corrigidos SOZINHOS (ver
 * `completar-telefone.ts`).
 *
 * Ninguem precisa ir a tela nenhuma: toda lista de pessoas que sai do
 * servidor passa por aqui. Numero que se encaixa nas regras e gravado ja
 * completo e a lista volta corrigida; nas proximas leituras nao ha mais
 * nada a fazer, e o custo e uma varredura em memoria da lista que ja foi
 * lida. Cadastro novo e edicao ja gravam completo (`telefoneParaGravar`).
 *
 * O acesso acompanha o numero, com dois cuidados:
 *
 *   - o aparelho NAO e desvinculado e ninguem e desconectado: e o mesmo
 *     numero, so escrito do jeito certo. (Trocar o numero na ficha e outra
 *     coisa — la o aparelho cai de proposito.)
 *   - se o numero completo ja e o acesso de outra pessoa do time, ou se
 *     duas fichas viram o mesmo numero agora, a ficha e corrigida e o
 *     acesso fica como estava: dois acessos com o mesmo numero travariam
 *     os dois.
 *
 * Uma falha no meio nao derruba a lista: a ficha fica como estava e a
 * proxima leitura tenta de novo.
 */
export async function completarTelefonesPendentes(members: Member[]): Promise<Member[]> {
  const pendentes = members.flatMap((member) => {
    const correcao = completarTelefone(member.phone);
    return correcao ? [{ member, novo: correcao.novo }] : [];
  });
  if (pendentes.length === 0) return members;

  const corrigidos = new Map<string, string>();
  const acessosDados = new Set<string>();

  const LOTE = 8;
  for (let i = 0; i < pendentes.length; i += LOTE) {
    await Promise.all(
      pendentes.slice(i, i + LOTE).map(async ({ member, novo }) => {
        try {
          await updateRows<MemberRow>(TABLES.members, { id: `eq.${member.id}` }, { phone: novo }, 'id');
          corrigidos.set(member.id, novo);
          await acompanharAcesso(member, novo, acessosDados);
        } catch (error) {
          console.warn('[cmd] telefone: nao foi possivel completar %s', member.id, error);
        }
      }),
    );
  }

  return members.map((m) => (corrigidos.has(m.id) ? { ...m, phone: corrigidos.get(m.id) as string } : m));
}

async function acompanharAcesso(member: Member, novo: string, acessosDados: Set<string>): Promise<void> {
  const chave = `${member.clientId}|${novo}`;
  // Duas fichas viraram o mesmo numero agora: so a primeira leva o acesso.
  if (acessosDados.has(chave)) return;
  acessosDados.add(chave);

  const user = await selectOne<Pick<UserRow, 'id' | 'phone' | 'is_active'>>(TABLES.users, {
    select: 'id,phone,is_active',
    filters: { member_id: `eq.${member.id}` },
  });
  if (!user || !user.phone || user.phone === novo) return;
  // O acesso tinha OUTRO numero (nao a versao incompleta deste): e decisao
  // de quem administra, nao desta correcao.
  if (completarTelefone(user.phone)?.novo !== novo) return;

  try {
    await assertTeamPhoneAvailable(member.clientId, novo, { memberId: member.id });
  } catch {
    return;
  }
  await updateRows<UserRow>(TABLES.users, { id: `eq.${user.id}` }, { phone: novo }, 'id');
}
