import 'server-only';
import type { Client } from '@/lib/types';
import { tierOf } from '@/lib/domain/team-tier';
import { isValidPhone, normalizePhone } from '@/lib/utils/phone';
import {
  TABLES,
  type ClientRow,
  type FormFieldRow,
  type MemberConfirmationRow,
  type MemberLocationRow,
  type MemberResponseRow,
  type MemberRow,
  type MemberVerificationRow,
  type SurveyFieldRow,
  type SurveyResponseRow,
  type SurveyResponseValueRow,
  type TeamPersonRow,
  type UserRow,
} from '@/lib/supabase/tables';
import {
  inFilter,
  insertOne,
  insertRowsInChunks,
  selectOne,
  selectRows,
  SupabaseRequestError,
} from '@/lib/supabase/rest';
import { copyImage, deleteImage } from '@/lib/supabase/storage';
import { deleteClient, getClient } from './client.service';
import { createMemberAccess, createTeamPersonUser } from './user.service';
import { ensureTeamAccessLink } from './team-access.service';
import { badRequest, notFound } from './http';

/**
 * Duplicacao de um time (migration 049).
 *
 * Para que serve: mostrar, na pratica, a diferenca entre a informacao que os
 * Lideres mandam certa e a que mandam errada. O ADMIN geral duplica o time
 * e, na copia, sobe a planilha dos Lideres normalmente — sem encostar no
 * oficial.
 *
 * O QUE VAI PARA A COPIA
 *
 *   - as configuracoes do time (tudo o que mora em `cmd_clients`: textos,
 *     privacidade, recrutamento, confirmacao de dados, banner, estado e
 *     municipios, questionario);
 *   - o Formulario 1 (`cmd_form_fields`) e o Formulario 2
 *     (`cmd_survey_fields`);
 *   - os administradores do time, cada um com acesso proprio na copia;
 *   - os LIDERES, com as respostas (Formulario 1 e, quando o Lider nasceu
 *     por ele, o Formulario 2), a tag, a confirmacao, a verificacao ja
 *     concluida e os pontos do mapa — e acesso proprio na copia, que e o que
 *     permite subir a planilha pelo painel de cada um.
 *
 * O QUE FICA SO NO OFICIAL: a Equipe de cada Lider, os links ja gerados, o
 * historico, as respostas do questionario que chegaram por link, aparelhos
 * e sessoes.
 *
 * O OFICIAL NUNCA E TOCADO. Aqui o oficial so e LIDO. Toda linha escrita e
 * nova e leva o `client_id` da copia; nenhuma chave estrangeira aponta da
 * copia para o oficial (`copy_of_client_id` e informativo). As fotos sao
 * COPIADAS para arquivos proprios: se a copia reaproveitasse o caminho do
 * oficial, trocar a foto na copia — ou excluir a copia — apagaria o arquivo
 * do oficial.
 *
 * FORA DA VISAO GERAL: `is_copy` tira a copia de toda metrica global, pelo
 * mesmo recorte do Time DEMO (`demo-scope.ts`).
 *
 * Falha no meio desfaz tudo pelo caminho de sempre: excluir a copia, que
 * leva junto, em cascata, so o que e dela.
 */

export interface DuplicateTeamInput {
  /** Nome da copia. Vazio: "<nome do oficial> (duplicado)". */
  name?: string | null;
}

export interface DuplicateTeamReport {
  client: Client;
  admins: number;
  leaders: number;
  /** Lideres que ficaram sem acesso na copia (telefone incompleto ou repetido). */
  leadersWithoutAccess: number;
}

/** Quantas fotos e acessos sao feitos ao mesmo tempo. */
const PARALELO = 8;

const NOME_MAX = 120;

/** Status de verificacao que ja terminaram: so estes vao para a copia. */
const VERIFICACAO_CONCLUIDA = new Set(['COMPLETED', 'PARTIAL', 'FAILED']);

type Linhas = Parameters<typeof insertRowsInChunks>[1];
type Linha = Linhas[number];

/**
 * A linha lida, sem as colunas que a copia nao pode herdar.
 *
 * Parte da linha INTEIRA (`select *`), e nao de uma lista de colunas: coluna
 * nova que uma migration futura acrescentar vai junto para a copia, em vez
 * de ser esquecida em silencio.
 */
function sem<T extends object>(row: T, colunas: readonly string[]): Linha {
  const copia = { ...row } as Record<string, unknown>;
  for (const coluna of colunas) delete copia[coluna];
  return copia as Linha;
}

/** Executa `fn` em lotes de `tamanho`, sem estourar o numero de conexoes. */
async function emLotes<T, R>(
  itens: readonly T[],
  tamanho: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultado: R[] = [];
  for (let inicio = 0; inicio < itens.length; inicio += tamanho) {
    resultado.push(...(await Promise.all(itens.slice(inicio, inicio + tamanho).map(fn))));
  }
  return resultado;
}

export function copyName(original: string, pedido?: string | null): string {
  const nome = (pedido ?? '').replace(/\s+/g, ' ').trim();
  if (nome.length >= 2) return nome.slice(0, NOME_MAX);
  return `${original.trim()} (duplicado)`.slice(0, NOME_MAX);
}

/** Quem e Lider: qualquer origem que nao seja um Lider (ver `team-tier.ts`). */
export function isLeaderRow(row: Pick<MemberRow, 'recruited_by_role'>): boolean {
  return tierOf(row.recruited_by_role) === 'LIDER';
}

export async function duplicateTeam(
  sourceId: string,
  input: DuplicateTeamInput = {},
): Promise<DuplicateTeamReport> {
  /* 1. Leitura do oficial. Nada e escrito antes de tudo estar em maos. */
  const origem = await selectOne<ClientRow>(TABLES.clients, {
    select: '*',
    filters: { id: `eq.${sourceId}` },
  });
  if (!origem) throw notFound('Time não encontrado.');
  if (origem.is_demo) throw badRequest('Time DEMO não pode ser duplicado.');

  const [campos, perguntas, pessoas, administradores, integrantes] = await Promise.all([
    selectRows<FormFieldRow>(TABLES.formFields, {
      select: '*',
      filters: { client_id: `eq.${sourceId}` },
      order: 'position.asc',
    }),
    selectRows<SurveyFieldRow>(TABLES.surveyFields, {
      select: '*',
      filters: { client_id: `eq.${sourceId}` },
      order: 'position.asc',
    }),
    selectRows<TeamPersonRow>(TABLES.teamPeople, {
      select: '*',
      filters: { client_id: `eq.${sourceId}` },
      order: 'position.asc',
    }),
    selectRows<Pick<UserRow, 'id' | 'team_person_id'>>(TABLES.users, {
      select: 'id,team_person_id',
      filters: { client_id: `eq.${sourceId}`, role: 'eq.CANDIDATE' },
    }),
    selectRows<MemberRow>(TABLES.members, {
      select: '*',
      filters: { client_id: `eq.${sourceId}` },
      order: 'created_at.asc',
    }),
  ]);

  if (pessoas.length === 0) {
    throw badRequest('Cadastre pelo menos um administrador no time antes de duplicar.');
  }

  // So os Lideres vao. A Equipe deles fica no oficial.
  const lideres = integrantes.filter(isLeaderRow);
  const idsLideres = lideres.map((row) => row.id);

  const [respostas, locais, confirmacoes, verificacoes, formulario2] = idsLideres.length
    ? await Promise.all([
        selectRows<MemberResponseRow>(TABLES.memberResponses, {
          select: '*',
          filters: { member_id: inFilter(idsLideres) },
        }),
        selectRows<MemberLocationRow>(TABLES.memberLocations, {
          select: '*',
          filters: { member_id: inFilter(idsLideres) },
        }),
        selectRows<MemberConfirmationRow>(TABLES.memberConfirmations, {
          select: '*',
          filters: { member_id: inFilter(idsLideres) },
        }),
        selectRows<MemberVerificationRow>(TABLES.memberVerifications, {
          select: '*',
          filters: { member_id: inFilter(idsLideres) },
        }),
        respostasDoFormulario2(idsLideres),
      ])
    : [[], [], [], [], { respostas: [], valores: [] }];

  /* 2. O time da copia. As imagens sao copiadas ANTES, para arquivos novos. */
  const [foto, banner] = await Promise.all([
    copyImage(origem.photo_path),
    copyImage(origem.banner_path ?? null),
  ]);

  let copia: ClientRow;
  try {
    copia = await insertOne<ClientRow>(TABLES.clients, {
      ...sem(origem, [
        'id',
        'created_at',
        'updated_at',
        'is_demo',
        'demo_seed_version',
        'demo_access_enabled',
        'is_copy',
        'copy_of_client_id',
        'copy_of_name',
        // Trava de uma leitura da planilha do Sheets em andamento (052): e da
        // copia de origem, e nao desta.
        'sheet_sync_lock_at',
      ]),
      name: copyName(origem.name, input.name),
      is_copy: true,
      copy_of_client_id: origem.id,
      copy_of_name: origem.name,
      photo_path: foto,
      photo_mime: foto ? origem.photo_mime : null,
      photo_size: foto ? origem.photo_size : null,
      ...('banner_path' in origem
        ? {
            banner_path: banner,
            banner_mime: banner ? origem.banner_mime : null,
            banner_size: banner ? origem.banner_size : null,
          }
        : {}),
    });
  } catch (error) {
    await deleteImage(foto);
    await deleteImage(banner);
    if (error instanceof SupabaseRequestError && error.isMissingSchema) {
      throw badRequest(
        'Para duplicar times, execute antes a migration 049_time_duplicado.sql no Supabase.',
      );
    }
    throw error;
  }

  try {
    /* 3. Formulario 1 e Formulario 2, com identificadores novos. */
    const campoNovo = new Map<string, string>();
    const linhasCampos = campos.map((campo) => {
      const id = crypto.randomUUID();
      campoNovo.set(campo.id, id);
      return { ...sem(campo, ['id', 'client_id', 'created_at', 'updated_at']), id, client_id: copia.id };
    });
    await insertRowsInChunks(TABLES.formFields, linhasCampos, 'id');

    const perguntaNova = new Map<string, string>();
    const linhasPerguntas = perguntas.map((pergunta) => {
      const id = crypto.randomUUID();
      perguntaNova.set(pergunta.id, id);
      return { ...sem(pergunta, ['id', 'client_id', 'created_at', 'updated_at']), id, client_id: copia.id };
    });
    await insertRowsInChunks(
      TABLES.surveyFields,
      linhasPerguntas,
      'id',
    );

    /* 4. Administradores do time, cada um com o proprio acesso na copia. */
    const pessoaNova = new Map<string, string>();
    const linhasPessoas = await emLotes(pessoas, PARALELO, async (pessoa) => {
      const id = crypto.randomUUID();
      pessoaNova.set(pessoa.id, id);
      const fotoPessoa = await copyImage(pessoa.photo_path);
      return {
        ...sem(pessoa, ['id', 'client_id', 'created_at', 'updated_at']),
        id,
        client_id: copia.id,
        photo_path: fotoPessoa,
        photo_mime: fotoPessoa ? pessoa.photo_mime : null,
        photo_size: fotoPessoa ? pessoa.photo_size : null,
      };
    });
    await insertRowsInChunks(TABLES.teamPeople, linhasPessoas, 'id');

    for (const pessoa of pessoas) {
      await createTeamPersonUser({
        clientId: copia.id,
        personId: pessoaNova.get(pessoa.id)!,
        name: pessoa.name,
        phone: pessoa.phone,
      });
    }

    await ensureTeamAccessLink(copia.id, 'TEAM_ADMIN');
    await ensureTeamAccessLink(copia.id, 'EQUIPE');

    // Administrador do oficial -> administrador correspondente na copia. E
    // por ele que "Cadastrado por" do Lider continua dizendo a mesma pessoa.
    const usuariosCopia = await selectRows<Pick<UserRow, 'id' | 'team_person_id'>>(TABLES.users, {
      select: 'id,team_person_id',
      filters: { client_id: `eq.${copia.id}`, role: 'eq.CANDIDATE' },
    });
    const usuarioDaPessoaNova = new Map(
      usuariosCopia.map((row) => [row.team_person_id ?? '', row.id]),
    );
    const usuarioNovo = new Map<string, string>();
    for (const admin of administradores) {
      const pessoa = admin.team_person_id ? pessoaNova.get(admin.team_person_id) : undefined;
      const novo = pessoa ? usuarioDaPessoaNova.get(pessoa) : undefined;
      if (novo) usuarioNovo.set(admin.id, novo);
    }

    /* 5. Os Lideres. */
    const admins = await adminsGerais(
      lideres.map((row) => row.recruiter_changed_by).filter((id): id is string => Boolean(id)),
    );
    const idsDaCopia = new Map<string, string>();
    const linhasLideres = await emLotes(lideres, PARALELO, async (lider) => {
      const id = crypto.randomUUID();
      idsDaCopia.set(lider.id, id);
      const fotoLider = await copyImage(lider.photo_path);
      return {
        ...sem(lider, [
          'id',
          'client_id',
          'updated_at',
          'photo_path',
          'photo_mime',
          'photo_size',
          'demo_seed',
          // O e-mail e unico no sistema inteiro: a copia nasce sem ele.
          'email',
        ]),
        id,
        client_id: copia.id,
        email: null,
        photo_path: fotoLider,
        photo_mime: fotoLider ? lider.photo_mime : null,
        photo_size: fotoLider ? lider.photo_size : null,
        recruited_by_user_id: responsavelNaCopia(lider.recruited_by_user_id, lider.recruited_by_role, usuarioNovo),
        recruiter_changed_by: lider.recruiter_changed_by
          ? (usuarioNovo.get(lider.recruiter_changed_by) ??
            (admins.has(lider.recruiter_changed_by) ? lider.recruiter_changed_by : null))
          : null,
      };
    });
    await insertRowsInChunks(TABLES.members, linhasLideres, 'id');

    // Respostas do Formulario 1, apontando para os campos da copia.
    const linhasRespostas = respostas
      .filter((row) => idsDaCopia.has(row.member_id) && campoNovo.has(row.field_id))
      .map((row) => ({
        client_id: copia.id,
        member_id: idsDaCopia.get(row.member_id)!,
        field_id: campoNovo.get(row.field_id)!,
        value: row.value,
      }));
    await insertRowsInChunks(
      TABLES.memberResponses,
      linhasRespostas,
      'id',
    );

    // Pontos do mapa: o ponto em si e o cache compartilhado de coordenadas,
    // que nunca e alterado — so o vinculo e novo.
    const linhasLocais = locais
      .filter((row) => idsDaCopia.has(row.member_id))
      .map((row) => ({
        ...sem(row, ['id', 'client_id', 'member_id', 'locked_at', 'lock_token', 'created_at', 'updated_at']),
        client_id: copia.id,
        member_id: idsDaCopia.get(row.member_id)!,
        status: row.status === 'PROCESSING' ? 'PENDING' : row.status,
      }));
    await insertRowsInChunks(
      TABLES.memberLocations,
      linhasLocais,
      'id',
    );

    const linhasConfirmacoes = confirmacoes
      .filter((row) => idsDaCopia.has(row.member_id))
      .map((row) => ({
        ...sem(row, ['id', 'client_id', 'member_id']),
        client_id: copia.id,
        member_id: idsDaCopia.get(row.member_id)!,
      }));
    await insertRowsInChunks(
      TABLES.memberConfirmations,
      linhasConfirmacoes,
      'id',
    );

    // So a verificacao que ja terminou: uma pendente faria a copia pagar de
    // novo uma consulta que o oficial ja pagou.
    const linhasVerificacoes = verificacoes
      .filter((row) => idsDaCopia.has(row.member_id) && VERIFICACAO_CONCLUIDA.has(row.status))
      .map((row) => ({
        ...sem(row, ['id', 'client_id', 'member_id', 'locked_at', 'lock_token', 'created_at', 'updated_at']),
        client_id: copia.id,
        member_id: idsDaCopia.get(row.member_id)!,
      }));
    await insertRowsInChunks(
      TABLES.memberVerifications,
      linhasVerificacoes,
      'id',
    );

    // Formulario 2 do proprio Lider (migration 044): quando ele foi
    // cadastrado por ali, a resposta E o cadastro dele. So a que tem
    // integrante — as respostas por link nao sao de Lider nenhum.
    const respostaNova = new Map<string, string>();
    const linhasFormulario2 = formulario2.respostas
      .filter((row) => row.member_id && idsDaCopia.has(row.member_id))
      .map((row) => {
        const id = crypto.randomUUID();
        respostaNova.set(row.id, id);
        return {
          ...sem(row, ['id', 'client_id', 'member_id', 'invite_id', 'sender_user_id', 'created_at']),
          id,
          client_id: copia.id,
          member_id: idsDaCopia.get(row.member_id!)!,
          invite_id: null,
          sender_user_id: responsavelNaCopia(row.sender_user_id, row.sender_role, usuarioNovo),
        };
      });
    await insertRowsInChunks(TABLES.surveyResponses, linhasFormulario2, 'id');

    const linhasValores = formulario2.valores
      .filter((row) => respostaNova.has(row.response_id))
      .map((row) => ({
        ...sem(row, ['id', 'response_id', 'field_id']),
        response_id: respostaNova.get(row.response_id)!,
        // Pergunta que ja nao existe fica sem vinculo, como no oficial: o
        // rotulo copiado no envio continua contando o que foi perguntado.
        field_id: row.field_id ? (perguntaNova.get(row.field_id) ?? null) : null,
      }));
    await insertRowsInChunks(TABLES.surveyResponseValues, linhasValores, 'id');

    /* 6. Acesso dos Lideres na copia: e pelo painel de cada um que a
          planilha sobe. Telefone repetido ou incompleto fica sem acesso,
          exatamente como no oficial — e nao derruba a duplicacao. */
    const telefonesUsados = new Set(pessoas.map((row) => normalizePhone(row.phone)));
    const comAcesso: MemberRow[] = [];
    for (const lider of lideres) {
      const telefone = normalizePhone(lider.phone ?? '');
      if (!isValidPhone(telefone) || telefonesUsados.has(telefone)) continue;
      telefonesUsados.add(telefone);
      comAcesso.push(lider);
    }

    const acessos = await emLotes(comAcesso, PARALELO, (lider) =>
      createMemberAccess({
        clientId: copia.id,
        memberId: idsDaCopia.get(lider.id)!,
        name: lider.name,
        phone: lider.phone,
      }).catch(() => null),
    );
    const criados = acessos.filter(Boolean).length;

    const client = await getClient(copia.id);
    if (!client) throw notFound('Time duplicado não encontrado.');

    return {
      client,
      admins: linhasPessoas.length,
      leaders: lideres.length,
      leadersWithoutAccess: lideres.length - criados,
    };
  } catch (error) {
    // Desfaz SO a copia: a exclusao e pelo id dela, e a cascata do banco nao
    // tem caminho para o oficial.
    await deleteClient(copia.id).catch(() => undefined);
    throw error;
  }
}

/**
 * Quem cadastrou o Lider, na copia.
 *
 *   Administrador do time do oficial  -> o administrador correspondente da copia;
 *   ADMIN geral                       -> o mesmo ADMIN geral (nao tem time);
 *   qualquer outro, ou ninguem        -> sem identificador, com o nome guardado.
 *
 * Nunca um usuario do oficial: o banco recusaria (responsavel de outro time),
 * e seria um fio ligando a copia ao oficial.
 */
function responsavelNaCopia(
  userId: string | null,
  role: MemberRow['recruited_by_role'],
  usuarioNovo: Map<string, string>,
): string | null {
  if (!userId) return null;
  if (role === 'ADMIN') return userId;
  return usuarioNovo.get(userId) ?? null;
}

/**
 * Respostas do Formulario 2 ligadas aos Lideres, com os valores.
 *
 * Banco sem a migration 044 nao tem `member_id` nessa tabela: nenhuma
 * resposta e de integrante, e nada vai.
 */
async function respostasDoFormulario2(
  idsLideres: string[],
): Promise<{ respostas: SurveyResponseRow[]; valores: SurveyResponseValueRow[] }> {
  let respostas: SurveyResponseRow[];
  try {
    respostas = await selectRows<SurveyResponseRow>(TABLES.surveyResponses, {
      select: '*',
      filters: { member_id: inFilter(idsLideres) },
    });
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.isMissingSchema) {
      return { respostas: [], valores: [] };
    }
    throw error;
  }
  if (respostas.length === 0) return { respostas, valores: [] };

  const valores = await selectRows<SurveyResponseValueRow>(TABLES.surveyResponseValues, {
    select: '*',
    filters: { response_id: inFilter(respostas.map((row) => row.id)) },
  });
  return { respostas, valores };
}

/** Quais destes usuarios sao ADMIN geral: os unicos que a copia mantem como sao. */
async function adminsGerais(ids: string[]): Promise<Set<string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Set();
  const rows = await selectRows<Pick<UserRow, 'id'>>(TABLES.users, {
    select: 'id',
    filters: { id: inFilter(unicos), role: 'eq.ADMIN' },
  });
  return new Set(rows.map((row) => row.id));
}
