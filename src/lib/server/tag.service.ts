import 'server-only';
import type {
  EventoDeTag,
  MemberTag,
  SessionUser,
  TagDoCatalogo,
  TagInput,
  TeamTier,
} from '@/lib/types';
import { ehCorDeTag, mesmoNomeDeTag } from '@/lib/domain/tags';
import { tierOf } from '@/lib/domain/team-tier';
import {
  TABLES,
  type MemberRow,
  type MemberTagEventRow,
  type MemberTagRow,
  type TagRow,
} from '@/lib/supabase/tables';
import type { SupabaseRequestError } from '@/lib/supabase/rest';
import {
  deleteRows,
  inFilter,
  insertOne,
  insertRows,
  selectOne,
  selectRows,
  updateRows,
} from '@/lib/supabase/rest';
import { badRequest, notFound } from './http';

/**
 * Tags das pessoas do time (migration 048) — ver `domain/tags.ts`.
 *
 * Colocar e tirar uma tag mexe em UMA tabela de ligacao e deixa uma linha no
 * historico. Nada mais: a ficha da pessoa nao e tocada — o nivel (Lider ou
 * Equipe) continua o que o responsavel pelo cadastro determina, os cadastros
 * que ela trouxe continuam dela, e o acesso e o link ficam como estavam.
 */

type Quem = Pick<SessionUser, 'id' | 'name'>;
type PessoaRow = Pick<MemberRow, 'id' | 'client_id' | 'recruited_by_role'>;

function paraTag(row: TagRow) {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    color: ehCorDeTag(row.color) ? row.color : 'navy',
    description: row.description,
  } as const;
}

/** Tabela ainda nao criada (ou sem grant): a migration 048 nao rodou. */
function faltaMigration(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'SupabaseRequestError' &&
    Boolean((error as SupabaseRequestError).isMissingSchema || (error as SupabaseRequestError).isMissingGrant)
  );
}

/* -------------------------------------------------------------------------
   Leitura junto com a ficha
   ------------------------------------------------------------------------- */

/**
 * As tags de cada pessoa, em bloco.
 *
 * Antes de a migration 048 rodar as tabelas nem existem: a lista do time
 * nao pode cair por causa disso. Sem tabela, ninguem tem tag — e so.
 */
export async function carregarTagsDasPessoas(
  memberIds: string[],
): Promise<Map<string, MemberTag[]>> {
  const porPessoa = new Map<string, MemberTag[]>();
  if (memberIds.length === 0) return porPessoa;

  try {
    const ligacoes = await selectRows<MemberTagRow>(TABLES.memberTags, {
      select: 'member_id,tag_id,from_tier,assigned_by_name,assigned_at',
      filters: { member_id: inFilter(memberIds) },
      order: 'assigned_at.asc',
    });
    if (ligacoes.length === 0) return porPessoa;

    const catalogo = await selectRows<TagRow>(TABLES.tags, {
      select: 'id,name,symbol,color,description',
      filters: { id: inFilter([...new Set(ligacoes.map((l) => l.tag_id))]) },
    });
    const porId = new Map(catalogo.map((row) => [row.id, paraTag(row)]));

    for (const ligacao of ligacoes) {
      const tag = porId.get(ligacao.tag_id);
      if (!tag) continue;
      const lista = porPessoa.get(ligacao.member_id) ?? [];
      lista.push({
        ...tag,
        since: ligacao.assigned_at,
        byName: ligacao.assigned_by_name,
        fromTier: ligacao.from_tier === 'LIDER' ? 'LIDER' : 'EQUIPE',
      });
      porPessoa.set(ligacao.member_id, lista);
    }
    return porPessoa;
  } catch (error) {
    if (faltaMigration(error)) return porPessoa;
    throw error;
  }
}

/* -------------------------------------------------------------------------
   Catalogo
   ------------------------------------------------------------------------- */

export async function listarTags(): Promise<TagDoCatalogo[]> {
  const [tags, ligacoes] = await Promise.all([
    selectRows<TagRow>(TABLES.tags, { select: '*', order: 'created_at.asc' }),
    selectRows<Pick<MemberTagRow, 'tag_id'>>(TABLES.memberTags, { select: 'tag_id' }),
  ]);

  const contagem = new Map<string, number>();
  for (const { tag_id } of ligacoes) contagem.set(tag_id, (contagem.get(tag_id) ?? 0) + 1);

  return tags.map((row) => ({
    ...paraTag(row),
    pessoas: contagem.get(row.id) ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function exigirTag(id: string): Promise<TagRow> {
  const row = await selectOne<TagRow>(TABLES.tags, { select: '*', filters: { id: `eq.${id}` } });
  if (!row) throw notFound('Tag não encontrada.');
  return row;
}

/** Nome repetido confunde quem le a lista: a recusa diz qual tag ja usa. */
async function conferirNomeLivre(nome: string, exceto?: string): Promise<void> {
  const todas = await selectRows<Pick<TagRow, 'id' | 'name'>>(TABLES.tags, { select: 'id,name' });
  const igual = todas.find((tag) => tag.id !== exceto && mesmoNomeDeTag(tag.name, nome));
  if (igual) throw badRequest(`Já existe a tag “${igual.name}”.`);
}

export async function criarTag(input: TagInput, quem: Quem): Promise<TagDoCatalogo> {
  await conferirNomeLivre(input.name);
  const row = await insertOne<TagRow>(TABLES.tags, {
    name: input.name,
    symbol: input.symbol,
    color: input.color,
    description: input.description,
    created_by_user_id: quem.id,
    created_by_name: quem.name,
  });
  return { ...paraTag(row), pessoas: 0, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** Editar muda a tag em TODAS as pessoas que a carregam — e so a tag. */
export async function editarTag(id: string, input: TagInput): Promise<TagDoCatalogo> {
  await exigirTag(id);
  await conferirNomeLivre(input.name, id);
  const [row] = await updateRows<TagRow>(
    TABLES.tags,
    { id: `eq.${id}` },
    {
      name: input.name,
      symbol: input.symbol,
      color: input.color,
      description: input.description,
      updated_at: new Date().toISOString(),
    },
  );
  if (!row) throw notFound('Tag não encontrada.');
  const ligacoes = await selectRows<Pick<MemberTagRow, 'tag_id'>>(TABLES.memberTags, {
    select: 'tag_id',
    filters: { tag_id: `eq.${id}` },
  });
  return { ...paraTag(row), pessoas: ligacoes.length, createdAt: row.created_at, updatedAt: row.updated_at };
}

/**
 * Apaga a tag do catalogo e, com ela, de todas as pessoas.
 *
 * As pessoas continuam intactas. O historico de cada uma ganha a linha
 * "tag apagada do catalogo", com o nome guardado — sem isso, quem abrisse a
 * ficha depois veria a tag sumir sem explicacao.
 */
export async function apagarTag(id: string, quem: Quem): Promise<{ pessoas: number }> {
  const tag = await exigirTag(id);
  const ligacoes = await selectRows<MemberTagRow>(TABLES.memberTags, {
    select: 'member_id,client_id,from_tier',
    filters: { tag_id: `eq.${id}` },
  });

  if (ligacoes.length) {
    const pessoas = await selectRows<PessoaRow>(TABLES.members, {
      select: 'id,client_id,recruited_by_role',
      filters: { id: inFilter(ligacoes.map((l) => l.member_id)) },
    });
    await insertRows(
      TABLES.memberTagEvents,
      pessoas.map((pessoa) => ({
        member_id: pessoa.id,
        client_id: pessoa.client_id,
        tag_id: id,
        tag_name: tag.name,
        action: 'TAG_DELETED',
        tier: tierOf(pessoa.recruited_by_role),
        by_user_id: quem.id,
        by_name: quem.name,
      })),
      'id',
    );
  }

  // A cascata do banco leva as ligacoes; o historico fica (tag_id vira nulo).
  await deleteRows(TABLES.tags, { id: `eq.${id}` });
  return { pessoas: ligacoes.length };
}

/* -------------------------------------------------------------------------
   Colocar e tirar
   ------------------------------------------------------------------------- */

async function pessoasDoPedido(memberIds: string[]): Promise<PessoaRow[]> {
  const ids = [...new Set(memberIds)];
  if (ids.length === 0) throw badRequest('Escolha ao menos uma pessoa.');
  const pessoas = await selectRows<PessoaRow>(TABLES.members, {
    select: 'id,client_id,recruited_by_role',
    filters: { id: inFilter(ids) },
  });
  if (pessoas.length !== ids.length) throw notFound('Integrante não encontrado.');
  return pessoas;
}

/**
 * Coloca a tag nas pessoas. Quem ja tem continua com a data original — pedir
 * duas vezes e a mesma coisa.
 */
export async function colocarTag(
  tagId: string,
  memberIds: string[],
  quem: Quem,
): Promise<{ colocadas: number }> {
  const tag = await exigirTag(tagId);
  const pessoas = await pessoasDoPedido(memberIds);

  const jaTem = new Set(
    (
      await selectRows<Pick<MemberTagRow, 'member_id'>>(TABLES.memberTags, {
        select: 'member_id',
        filters: { tag_id: `eq.${tagId}`, member_id: inFilter(pessoas.map((p) => p.id)) },
      })
    ).map((l) => l.member_id),
  );
  const novas = pessoas.filter((p) => !jaTem.has(p.id));
  if (novas.length === 0) return { colocadas: 0 };

  const nivel = (p: PessoaRow): TeamTier => tierOf(p.recruited_by_role);
  await insertRows(
    TABLES.memberTags,
    novas.map((p) => ({
      member_id: p.id,
      tag_id: tagId,
      client_id: p.client_id,
      from_tier: nivel(p),
      assigned_by_user_id: quem.id,
      assigned_by_name: quem.name,
    })),
    'member_id',
  );
  await insertRows(
    TABLES.memberTagEvents,
    novas.map((p) => ({
      member_id: p.id,
      client_id: p.client_id,
      tag_id: tagId,
      tag_name: tag.name,
      action: 'ADDED',
      tier: nivel(p),
      by_user_id: quem.id,
      by_name: quem.name,
    })),
    'id',
  );
  return { colocadas: novas.length };
}

/** Tira a tag das pessoas. A pessoa fica exatamente como estava antes dela. */
export async function tirarTag(
  tagId: string,
  memberIds: string[],
  quem: Quem,
): Promise<{ retiradas: number }> {
  const tag = await exigirTag(tagId);
  const pessoas = await pessoasDoPedido(memberIds);

  const removidas = await deleteRows<Pick<MemberTagRow, 'member_id'>>(
    TABLES.memberTags,
    { tag_id: `eq.${tagId}`, member_id: inFilter(pessoas.map((p) => p.id)) },
    'member_id',
  );
  const quais = new Set(removidas.map((l) => l.member_id));
  const afetadas = pessoas.filter((p) => quais.has(p.id));
  if (afetadas.length) {
    await insertRows(
      TABLES.memberTagEvents,
      afetadas.map((p) => ({
        member_id: p.id,
        client_id: p.client_id,
        tag_id: tagId,
        tag_name: tag.name,
        action: 'REMOVED',
        tier: tierOf(p.recruited_by_role),
        by_user_id: quem.id,
        by_name: quem.name,
      })),
      'id',
    );
  }
  return { retiradas: afetadas.length };
}

/** O historico de tags da pessoa, do mais recente para o mais antigo. */
export async function historicoDeTags(memberId: string): Promise<EventoDeTag[]> {
  const linhas = await selectRows<MemberTagEventRow>(TABLES.memberTagEvents, {
    select: 'action,tag_id,tag_name,tier,by_name,created_at',
    filters: { member_id: `eq.${memberId}` },
    order: 'created_at.desc',
    limit: 100,
  });
  return linhas.map((l) => ({
    acao: l.action,
    tagId: l.tag_id,
    tagName: l.tag_name,
    nivel: l.tier,
    por: l.by_name,
    em: l.created_at,
  }));
}
