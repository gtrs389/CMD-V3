import 'server-only';
import {
  enderecoLimpo,
  idDaPlanilha,
  lerAbaDoSheets,
  planejarPlanilha,
  type LiderDoTime,
  type RelatorioDaPlanilha,
} from '@/lib/domain/planilha-do-sheets';
import { ENDERECO_FIXO, verificadoPorFotoParaGravar } from '@/lib/domain/csv-import';
import { tierOf } from '@/lib/domain/team-tier';
import { TABLES, type ClientRow, type MemberRow, type UserRow } from '@/lib/supabase/tables';
import {
  deleteRows,
  inFilter,
  insertRowsInChunks,
  selectOne,
  selectRows,
  SupabaseRequestError,
  updateRows,
} from '@/lib/supabase/rest';
import { lerXlsx, PlanilhaInvalidaError } from './xlsx';
import { ApiError, badRequest, notFound } from './http';

/**
 * Planilha do Google Sheets do time DUPLICADO (migration 052).
 *
 * Cada leitura e uma FOTOGRAFIA COMPLETA: o que veio da planilha na leitura
 * anterior sai, e o que esta nela agora entra. Assim uma pessoa apagada na
 * planilha some da copia, e uma corrigida aparece corrigida — sem regra de
 * "qual linha e qual".
 *
 * O QUE ELA NUNCA TOCA
 *
 *   - o time oficial. Tudo aqui exige `is_copy`, e o banco recusa linha da
 *     planilha fora de copia (gatilho da migration 052);
 *   - o que ja estava na copia sem ter vindo da planilha: os Lideres
 *     copiados e a Equipe que estava no banco. A troca apaga SO o que tem
 *     `from_sheet = true` DESTA copia. Com a planilha ligada, a Equipe do
 *     banco fica escondida (`sheet-visibility.ts`); desligada, volta.
 *
 * O Lider que a planilha cria (aba sem Lider com aquele nome no time) nasce
 * com `from_sheet = true` e sai junto na leitura seguinte, se a aba sumir.
 */

type ClienteDaPlanilha = Pick<
  ClientRow,
  'id' | 'is_copy' | 'sheet_sync_enabled' | 'sheet_url' | 'state_uf' | 'cities'
>;

/** Tamanho maximo do arquivo baixado. Uma planilha de mutirao fica muito abaixo. */
const LIMITE_DO_ARQUIVO = 25 * 1024 * 1024;
/** Uma leitura parada ha mais que isto nao segura a proxima. */
const TRAVA_VENCE_EM_MS = 3 * 60_000;

const COMPARTILHAR =
  'Confira se a planilha está compartilhada como "Qualquer pessoa com o link" (Leitor) no Google Sheets.';

async function requireCopy(clientId: string): Promise<ClienteDaPlanilha> {
  let row: ClienteDaPlanilha | null;
  try {
    row = await selectOne<ClienteDaPlanilha>(TABLES.clients, {
      select: 'id,is_copy,sheet_sync_enabled,sheet_url,state_uf,cities',
      filters: { id: `eq.${clientId}` },
    });
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.isMissingSchema) {
      throw badRequest(
        'Para usar a planilha do Google Sheets, execute antes a migration 052_planilha_do_sheets.sql no Supabase.',
      );
    }
    throw error;
  }
  if (!row) throw notFound('Time não encontrado.');
  // A barreira que importa: a planilha so existe no time duplicado.
  if (!row.is_copy) throw badRequest('A planilha do Google Sheets é só para time duplicado.');
  return row;
}

/* -------------------------------------------------------------------------
   Configuracao: liga, desliga e troca o link
   ------------------------------------------------------------------------- */

export async function updateSheetSettings(
  clientId: string,
  input: { enabled: boolean; url: string },
): Promise<void> {
  await requireCopy(clientId);

  const texto = input.url.trim();
  const id = texto ? idDaPlanilha(texto) : null;
  if (texto && !id) {
    throw badRequest(
      'Link inválido. Cole o endereço da planilha, como https://docs.google.com/spreadsheets/d/…',
    );
  }
  if (input.enabled && !id) throw badRequest('Cole o link da planilha antes de ligar.');

  await updateRows<ClientRow>(
    TABLES.clients,
    { id: `eq.${clientId}` },
    { sheet_sync_enabled: input.enabled, sheet_url: id ? enderecoLimpo(id) : null },
    'id',
  );
}

/* -------------------------------------------------------------------------
   Leitura
   ------------------------------------------------------------------------- */

async function baixarPlanilha(url: string): Promise<Buffer> {
  const id = idDaPlanilha(url);
  if (!id) throw badRequest('Link da planilha inválido.');

  // O endereco e MONTADO aqui, a partir do id: o servidor so baixa do
  // Google, nunca de um endereco que veio pronto do navegador.
  let resposta: Response;
  try {
    resposta = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`, {
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw badRequest('Não consegui falar com o Google Sheets agora. Tente de novo em instantes.');
  }

  if (!resposta.ok) throw badRequest(`Não consegui abrir a planilha. ${COMPARTILHAR}`);
  // Planilha fechada: o Google responde com a pagina de login, e nao com o
  // arquivo.
  if ((resposta.headers.get('content-type') ?? '').includes('text/html')) {
    throw badRequest(`A planilha não está aberta para leitura. ${COMPARTILHAR}`);
  }

  const dados = Buffer.from(await resposta.arrayBuffer());
  if (dados.length > LIMITE_DO_ARQUIVO) throw badRequest('A planilha é grande demais para ler.');
  return dados;
}

/** Lideres que ja estavam na copia (sem contar os que a planilha criou). */
async function lideresDaCopia(clientId: string): Promise<(LiderDoTime & { userId: string | null })[]> {
  const membros = await selectRows<Pick<MemberRow, 'id' | 'name' | 'recruited_by_role'>>(
    TABLES.members,
    {
      select: 'id,name,recruited_by_role',
      filters: { client_id: `eq.${clientId}`, from_sheet: 'is.false' },
      order: 'created_at.asc',
    },
  );
  const lideres = membros.filter((row) => tierOf(row.recruited_by_role) === 'LIDER');
  if (lideres.length === 0) return [];

  const usuarios = await selectRows<Pick<UserRow, 'id' | 'member_id'>>(TABLES.users, {
    select: 'id,member_id',
    filters: { member_id: inFilter(lideres.map((row) => row.id)) },
  });
  const usuarioDe = new Map(usuarios.map((row) => [row.member_id, row.id]));

  return lideres.map((row) => ({ memberId: row.id, name: row.name, userId: usuarioDe.get(row.id) ?? null }));
}

/**
 * Usuario do Lider, para a Equipe poder apontar para ele.
 *
 * A Equipe e ligada ao Lider pelo USUARIO dele (`recruited_by_user_id`). O
 * Lider da planilha nao tem telefone, entao nao ganha o acesso de sempre
 * (link do time + telefone): ganha um usuario SEM telefone, pelo qual
 * ninguem entra — so serve de vinculo, e para o ADMIN geral poder abrir o
 * painel dele pela ficha.
 */
async function garantirUsuario(clientId: string, memberId: string, name: string): Promise<string> {
  const existente = await selectOne<Pick<UserRow, 'id'>>(TABLES.users, {
    select: 'id',
    filters: { member_id: `eq.${memberId}` },
  });
  if (existente) return existente.id;

  const [criado] = await insertRowsInChunks<Pick<UserRow, 'id'>>(
    TABLES.users,
    [
      {
        name: name.slice(0, 120),
        email: null,
        phone: null,
        role: 'EQUIPE',
        client_id: clientId,
        member_id: memberId,
        password_hash: null,
        must_change_password: false,
        is_active: true,
      },
    ],
    'id',
  );
  return criado.id;
}

/**
 * Le a planilha e troca a Equipe da copia pela dela.
 *
 * `admin` e o ADMIN geral que pediu a leitura: e ele que consta como quem
 * cadastrou o Lider que a planilha cria.
 */
export async function syncSheet(
  clientId: string,
  admin: { id: string; name: string },
): Promise<RelatorioDaPlanilha> {
  const cliente = await requireCopy(clientId);
  if (!cliente.sheet_sync_enabled || !cliente.sheet_url) {
    throw badRequest('Ligue a planilha e cole o link antes de ler.');
  }

  // Uma leitura por vez: duas ao mesmo tempo apagariam o que a outra acabou
  // de gravar. A trava e do banco, e vence sozinha se uma leitura morrer.
  const agora = new Date();
  const travado = await updateRows<Pick<ClientRow, 'id'>>(
    TABLES.clients,
    {
      id: `eq.${clientId}`,
      or: `(sheet_sync_lock_at.is.null,sheet_sync_lock_at.lt.${new Date(agora.getTime() - TRAVA_VENCE_EM_MS).toISOString()})`,
    },
    { sheet_sync_lock_at: agora.toISOString() },
    'id',
  );
  if (travado.length === 0) {
    throw badRequest('A planilha já está sendo lida. Aguarde alguns segundos.');
  }

  let relatorio: RelatorioDaPlanilha;
  try {
    relatorio = await lerEGravar(cliente, admin);
  } catch (error) {
    const mensagem =
      error instanceof PlanilhaInvalidaError
        ? `${error.message} ${COMPARTILHAR}`
        : error instanceof ApiError
          ? error.message
          : 'Não foi possível ler a planilha.';
    await updateRows(
      TABLES.clients,
      { id: `eq.${clientId}` },
      {
        sheet_sync_lock_at: null,
        sheet_sync_report: {
          ok: false,
          erro: mensagem,
          em: new Date().toISOString(),
          abas: 0,
          lideresEncontrados: [],
          lideresCriados: [],
          pessoas: 0,
          abasIgnoradas: [],
          linhasIgnoradas: 0,
        } satisfies RelatorioDaPlanilha,
      },
      'id',
    ).catch(() => undefined);
    if (error instanceof PlanilhaInvalidaError) throw badRequest(mensagem);
    throw error;
  }

  await updateRows(
    TABLES.clients,
    { id: `eq.${clientId}` },
    { sheet_sync_lock_at: null, sheet_synced_at: relatorio.em, sheet_sync_report: relatorio },
    'id',
  );
  return relatorio;
}

async function lerEGravar(
  cliente: ClienteDaPlanilha,
  admin: { id: string; name: string },
): Promise<RelatorioDaPlanilha> {
  // 1. Tudo lido e decidido ANTES de apagar qualquer coisa: se a planilha
  //    estiver fechada ou quebrada, a copia continua como estava.
  const abas = lerXlsx(await baixarPlanilha(cliente.sheet_url!)).map((aba) =>
    lerAbaDoSheets(aba.titulo, aba.linhas),
  );
  if (abas.length === 0) throw badRequest('A planilha não tem nenhuma aba para ler.');

  const lideres = await lideresDaCopia(cliente.id);
  const plano = planejarPlanilha(abas, lideres);
  const usuarioDoLider = new Map(lideres.map((lider) => [lider.memberId, lider.userId]));

  // 2. Sai o que veio da leitura anterior — SO desta copia, SO da planilha.
  //    Usuarios e vinculos de mapa dessas linhas saem junto, pela cascata.
  await deleteRows(TABLES.members, { client_id: `eq.${cliente.id}`, from_sheet: 'is.true' });

  const estado = cliente.state_uf ?? ENDERECO_FIXO.state;
  const cidade = cliente.cities?.[0] ?? ENDERECO_FIXO.city;
  const lideresCriados: string[] = [];
  const lideresEncontrados: string[] = [];
  const linhasEquipe: Record<string, string | boolean | null>[] = [];
  const locais: Record<string, string>[] = [];

  // 3. Lideres: o encontrado ganha usuario se ainda nao tiver; o novo nasce.
  for (const grupo of plano.grupos) {
    let memberId: string;
    const nome = grupo.lider.name;

    if (grupo.lider.tipo === 'existente') {
      memberId = grupo.lider.memberId;
      lideresEncontrados.push(nome);
    } else {
      memberId = crypto.randomUUID();
      await insertRowsInChunks(
        TABLES.members,
        [
          {
            id: memberId,
            client_id: cliente.id,
            name: nome,
            phone: '',
            state: estado,
            city: cidade,
            source: 'admin',
            from_sheet: true,
            recruited_by_user_id: admin.id,
            recruited_by_name: admin.name.slice(0, 120),
            recruited_by_role: 'ADMIN',
          },
        ],
        'id',
      );
      lideresCriados.push(nome);
    }

    const userId = usuarioDoLider.get(memberId) ?? (await garantirUsuario(cliente.id, memberId, nome));

    // 4. A Equipe do Lider, como esta na planilha.
    for (const pessoa of grupo.pessoas) {
      const id = crypto.randomUUID();
      const verificado = verificadoPorFotoParaGravar(pessoa.photoVerified);
      linhasEquipe.push({
        id,
        client_id: cliente.id,
        name: pessoa.name,
        phone: pessoa.phone,
        voter_id: pessoa.voterId || null,
        zone: pessoa.zone || null,
        section: pessoa.section || null,
        state: estado,
        city: cidade,
        source: 'admin',
        from_sheet: true,
        recruited_by_user_id: userId,
        recruited_by_name: nome.slice(0, 120),
        recruited_by_role: 'EQUIPE',
        ...(pessoa.reference ? { reference: pessoa.reference } : {}),
        ...(verificado !== null ? { photo_verified: verificado } : {}),
      });
      // Local de votacao pela zona e secao: sai da tabela do TSE do proprio
      // sistema, sem consulta paga. A moradia nao — a planilha nao tem
      // endereco.
      if (pessoa.zone && pessoa.section) {
        locais.push({
          client_id: cliente.id,
          member_id: id,
          location_kind: 'POLLING_PLACE',
          status: 'PENDING',
        });
      }
    }
  }

  try {
    await insertRowsInChunks(TABLES.members, linhasEquipe, 'id');
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.isMissingSchema) {
      throw badRequest(
        'Faltam colunas no banco. Execute as migrations 050_verificado_por_foto.sql, 051_referencia.sql e 052_planilha_do_sheets.sql no Supabase.',
      );
    }
    throw error;
  }
  if (locais.length > 0) await insertRowsInChunks(TABLES.memberLocations, locais, 'id').catch(() => []);

  return {
    ok: true,
    em: new Date().toISOString(),
    abas: abas.length,
    lideresEncontrados,
    lideresCriados,
    pessoas: linhasEquipe.length,
    abasIgnoradas: plano.abasIgnoradas,
    linhasIgnoradas: plano.linhasIgnoradas,
  };
}
