import 'server-only';
import type { Client, TeamPersonInput } from '@/lib/types';
import {
  DEMO_DEFAULTS,
  DEMO_LIMITS,
  DEMO_PROVIDER,
  buildDemoData,
  clampCount,
  type DemoData,
} from '@/lib/domain/demo';
import {
  DEMO_POLLING_PLACES,
  DEMO_SEED_VERSION,
  DEMO_STATE,
} from '@/lib/domain/demo-catalog';
import { normalizePhone } from '@/lib/utils/phone';
import {
  TABLES,
  type MapLocationRow,
  type MemberLocationRow,
  type MemberRow,
  type UserRow,
} from '@/lib/supabase/tables';
import {
  callFunction,
  deleteRows,
  inFilter,
  insertRows,
  selectRows,
  updateRows,
} from '@/lib/supabase/rest';
import { deleteImage } from '@/lib/supabase/storage';
import { createClient, deleteClient, getClient } from './client.service';
import { pollingPlaceLookup, residenceLookupFor, resolveDemoPoint } from './demo-locations';
import { badRequest, notFound } from './http';

/**
 * Criacao e correcao de um Time DEMO.
 *
 * O Time DEMO e um time DE VERDADE: mesmas tabelas, mesmas telas, mesmos
 * servicos. Nao existe tela falsa, tabela paralela nem numero chumbado em
 * componente — o que a pagina do time mostra sai das mesmas consultas que
 * mostram um time real.
 *
 * O que ele tem de diferente e um sinal, `is_demo`, que o mantem fora de
 * toda metrica global (ver `demo-scope.ts`), e o fato de que os dados dele
 * sao gerados aqui, no servidor.
 *
 * OS LUGARES SAO REAIS, E DE ALAGOAS. Escola, rua, bairro, municipio, UF,
 * zona e secao vem do catalogo (`demo-catalog.ts`), que so tem local de
 * votacao divulgado pelo TRE/AL, com a fonte anotada. As coordenadas vem da
 * consulta de endereco do proprio sistema (`demo-locations.ts`) e nenhuma e
 * escrita a mao nem deslocada: o que nao passa pelas barreiras de Alagoas
 * simplesmente nao vira ponto.
 *
 * AS PESSOAS sao ficticias: nome montado de listas, telefone de uma faixa de
 * demonstracao com DDD 82. Sem CPF, sem titulo de eleitor, sem e-mail e sem
 * nenhum retorno de consulta cadastral.
 *
 * QUEM TEM ACESSO AO PAINEL: somente os administradores que o ADMIN geral
 * cadastrou a mao. As pessoas ficticias sao DADOS, e nada mais — elas
 * existem em `cmd_members` e em nenhum outro lugar. Sem usuario, sem senha,
 * sem sessao, sem link de acesso, sem aparelho vinculado e sem convite
 * pessoal.
 *
 * A criacao e ATOMICA na pratica: o PostgREST nao abre transacao entre
 * chamadas, entao qualquer falha depois do time criado desfaz tudo pelo
 * caminho que o proprio sistema ja usa — excluir o time, que leva junto, em
 * cascata, campos, pessoas, acessos, integrantes e vinculos de mapa.
 *
 * Repetir a requisicao NAO duplica: a chave de idempotencia e reservada no
 * banco antes de qualquer escrita (migration 033), e a segunda chamada
 * recebe o time que a primeira criou.
 */

export interface DemoAdminInput {
  name: string;
  phone: string;
  /** Data URL da foto. Opcional. */
  photo?: string | null;
}

export interface CreateDemoTeamInput {
  name: string;
  /** Foto ou banner do time. Opcional. */
  photo?: string | null;
  admins: DemoAdminInput[];
  people: number;
  places: number;
  /** Chave de idempotencia criada pelo navegador. */
  seedKey: string;
}

interface ClaimRow {
  seed_id: string;
  client_id: string | null;
  claimed: boolean;
}

type Admin = Pick<UserRow, 'id' | 'name' | 'phone'>;

/* -------------------------------------------------------------------------
   Criacao
   ------------------------------------------------------------------------- */

export async function createDemoTeam(
  input: CreateDemoTeamInput,
  admin: { id: string },
): Promise<Client> {
  const nome = input.name.trim();
  if (nome.length < 2) throw badRequest('Dê um nome ao Time DEMO.');

  if (!input.admins?.length) {
    throw badRequest('Cadastre pelo menos um administrador do time.');
  }
  const people = clampCount(input.people, DEMO_LIMITS.minPeople, DEMO_LIMITS.maxPeople);
  const places = clampCount(input.places, DEMO_LIMITS.minPlaces, DEMO_LIMITS.maxPlaces);

  // 1. Reserva a chave ANTES de escrever qualquer coisa. Dois cliques, um
  //    duplo envio ou uma repeticao automatica caem aqui.
  const rows = await callFunction<ClaimRow[]>('cmd_demo_claim', {
    p_seed_key: input.seedKey,
    p_user_id: admin.id,
  });
  const claim = Array.isArray(rows) ? rows[0] : null;
  if (!claim) throw badRequest('Não foi possível iniciar a criação.');

  if (!claim.claimed) {
    // Chave ja usada: devolve o time daquela criacao, em vez de criar outro.
    if (!claim.client_id) {
      throw badRequest('A criação deste Time DEMO já está em andamento. Aguarde um instante.');
    }
    const existente = await getClient(claim.client_id);
    if (existente) return existente;
    throw notFound('Time DEMO não encontrado.');
  }

  let clientId: string | null = null;
  /** Coordenadas criadas AQUI: so elas podem ser desfeitas. */
  const pontos: string[] = [];

  try {
    // 2. O time nasce pelo MESMO caminho de um time real: campos padrao dos
    //    formularios, administradores com acesso por telefone e os dois
    //    enderecos de acesso. A unica diferenca e o sinal `is_demo`.
    const criado = await createClient(
      {
        name: nome,
        photo: input.photo ?? null,
        notes: 'Time de demonstração. Os dados são fictícios e ficam fora dos números reais.',
        people: input.admins.map<TeamPersonInput>((person) => ({
          name: person.name,
          phone: person.phone,
          photo: person.photo ?? null,
        })),
      },
      { isDemo: true },
    );
    clientId = criado.id;

    await seedDemoContent(criado, { people, places, seedKey: input.seedKey }, pontos);
    await markSeeded(criado.id);
    await updateSeed(claim.seed_id, criado.id);

    // Recarrega pelo caminho normal: e exatamente o que a pagina do time vai
    // ler depois.
    const pronto = await getClient(criado.id);
    if (!pronto) throw notFound('Time DEMO não encontrado depois da criação.');
    return pronto;
  } catch (error) {
    // 3. Desfaz tudo. Excluir o time leva junto, em cascata, campos,
    //    administradores, acessos, integrantes e vinculos de mapa — e a
    //    reserva sai para a mesma chave poder tentar de novo.
    if (clientId) await deleteClient(clientId).catch(() => undefined);
    // O cache de coordenadas nao tem `client_id`: excluir o time nao leva os
    // pontos junto. Saem apenas os que ESTA criacao gravou — um ponto que ja
    // existia serve a outros times e nao e nosso para apagar.
    if (pontos.length > 0) {
      await deleteRows(TABLES.mapLocations, { id: inFilter(pontos) }).catch(() => []);
    }
    await deleteRows(TABLES.demoSeeds, { id: `eq.${claim.seed_id}` }).catch(() => []);
    throw error;
  }
}

/**
 * Fecha a reserva, ligando-a ao time criado.
 *
 * E o que faz a segunda requisicao com a mesma chave devolver ESTE time em
 * vez de criar outro.
 */
async function updateSeed(seedId: string, clientId: string): Promise<void> {
  await updateRows(
    TABLES.demoSeeds,
    { id: `eq.${seedId}` },
    { client_id: clientId, finished_at: new Date().toISOString() },
    'id',
  );
}

/** Anota no time qual catalogo gerou os dados que ele tem agora. */
async function markSeeded(clientId: string): Promise<void> {
  await updateRows(
    TABLES.clients,
    { id: `eq.${clientId}` },
    { demo_seed_version: DEMO_SEED_VERSION },
    'id',
  );
}

/* -------------------------------------------------------------------------
   Correcao de um Time DEMO ja criado
   ------------------------------------------------------------------------- */

export interface DemoRefreshReport {
  clientId: string;
  /** Catalogo aplicado. */
  version: string;
  /** Pessoas ficticias removidas (as da geracao anterior). */
  removed: number;
  /** Pessoas ficticias criadas agora. */
  people: number;
  /** Locais de votacao do catalogo usados. */
  places: number;
  /** Coordenadas aceitas e recusadas nesta passagem. */
  points: { resolved: number; missing: number };
}

/**
 * Regenera SOMENTE os dados gerados de um Time DEMO.
 *
 * O que NAO e tocado: o time, o nome, a foto, os administradores, os acessos
 * deles, os links do time, o formulario, o questionario, as configuracoes e
 * qualquer pessoa cadastrada a mao. Sai apenas o que carrega a marca
 * `demo_seed` — ou seja, o que este gerador criou.
 *
 * RODAR DUAS VEZES NAO DUPLICA: a rotina apaga a geracao anterior antes de
 * escrever a nova, e a semente e a mesma (a chave da criacao original), entao
 * o resultado e identico. Nao ha o que somar.
 *
 * Time real nunca entra aqui: sem `is_demo`, a rotina recusa.
 */
export async function refreshDemoTeam(clientId: string): Promise<DemoRefreshReport> {
  const client = await getClient(clientId);
  if (!client) throw notFound('Time não encontrado.');
  if (!client.isDemo) throw badRequest('Só um Time DEMO pode ter os dados regerados.');

  const admins = await demoAdmins(clientId);

  // Quantas pessoas o time tinha: a escolha de quem o criou e mantida.
  const anteriores = await selectRows<Pick<MemberRow, 'id' | 'photo_path'>>(TABLES.members, {
    select: 'id,photo_path',
    filters: { client_id: `eq.${clientId}`, demo_seed: 'not.is.null' },
    limit: DEMO_LIMITS.maxPeople,
  });
  // A equipe nunca encolhe na correcao: um time criado com o padrao antigo
  // (trinta pessoas em seis escolas) sobe para o padrao atual, e um time que
  // o ADMIN montou maior continua do tamanho que ele escolheu.
  const people = clampCount(
    Math.max(anteriores.length, DEMO_DEFAULTS.people),
    DEMO_LIMITS.minPeople,
    DEMO_LIMITS.maxPeople,
  );

  // A semente original: os nomes e a distribuicao continuam os mesmos do time
  // que o ADMIN ja conhece.
  const [reserva] = await selectRows<{ seed_key: string }>(TABLES.demoSeeds, {
    select: 'seed_key',
    filters: { client_id: `eq.${clientId}` },
    order: 'created_at.asc',
    limit: 1,
  });

  // 1. Fora a geracao anterior. A cascata leva junto os vinculos de mapa dela.
  //    A foto sai antes da linha: o arquivo mora no Storage privado, que
  //    nenhuma cascata do banco alcanca — apagar so a linha deixaria o
  //    arquivo la para sempre.
  if (anteriores.length > 0) {
    for (const row of anteriores) await deleteImage(row.photo_path).catch(() => undefined);
    await deleteRows(TABLES.members, { id: inFilter(anteriores.map((row) => row.id)) });
  }

  // 2. Fora os pontos semeados que sobraram sem dono. Sao as coordenadas
  //    inventadas da versao antiga — as que punham marcador em Recife e no
  //    mar. Um ponto ainda usado por outro Time DEMO nao e apagado.
  await dropOrphanSeededPoints();

  // 3. A geracao nova, pelo mesmo caminho da criacao.
  const pontos: string[] = [];
  // A correcao usa o catalogo INTEIRO: e a unica vez em que aquele time passa
  // por aqui, e e o que da ao mapa todos os municipios do catalogo. O custo e uma
  // consulta por endereco inedito, uma unica vez no sistema todo — o cache e
  // por endereco, entao o proximo Time DEMO nao consulta mais nada.
  //
  const resumo = await seedDemoContent(
    client,
    {
      people,
      places: DEMO_POLLING_PLACES.length,
      seedKey: reserva?.seed_key ?? clientId,
    },
    pontos,
    admins,
  );

  await markSeeded(clientId);

  return {
    clientId,
    version: DEMO_SEED_VERSION,
    removed: anteriores.length,
    people: resumo.people,
    places: resumo.places,
    points: resumo.points,
  };
}

/**
 * Apaga pontos `DEMO_SEED` que nao pertencem mais a ninguem.
 *
 * `DEMO_SEED` era a marca das coordenadas que o gerador antigo escrevia de
 * memoria. Elas nao sao mais criadas: hoje toda coordenada do Time DEMO vem
 * da consulta de endereco. As que sobraram de um time ja regenerado seriam
 * lixo no cache, entao saem — e somente as que nenhum vinculo aponta.
 */
async function dropOrphanSeededPoints(): Promise<void> {
  const semeados = await selectRows<Pick<MapLocationRow, 'id'>>(TABLES.mapLocations, {
    select: 'id',
    filters: { provider: `eq.${DEMO_PROVIDER}` },
    limit: 2000,
  });
  if (semeados.length === 0) return;

  const ids = semeados.map((row) => row.id);
  const emUso = await selectRows<Pick<MemberLocationRow, 'location_id'>>(TABLES.memberLocations, {
    select: 'location_id',
    filters: { location_id: inFilter(ids) },
    limit: 4000,
  });

  const ocupados = new Set(emUso.map((row) => row.location_id));
  const orfaos = ids.filter((id) => !ocupados.has(id));
  if (orfaos.length > 0) {
    await deleteRows(TABLES.mapLocations, { id: inFilter(orfaos) }).catch(() => []);
  }
}

/* -------------------------------------------------------------------------
   Conteudo de demonstracao
   ------------------------------------------------------------------------- */

interface SeedOptions {
  people: number;
  places: number;
  seedKey: string;
}

interface SeedSummary {
  people: number;
  places: number;
  points: { resolved: number; missing: number };
}

/** Administradores do time: sao eles que aparecem em "Cadastrado por". */
async function demoAdmins(clientId: string): Promise<Admin[]> {
  const admins = await selectRows<Admin>(TABLES.users, {
    select: 'id,name,phone',
    filters: { client_id: `eq.${clientId}`, role: 'eq.CANDIDATE', is_active: 'is.true' },
    order: 'created_at.asc',
  });
  if (admins.length === 0) throw notFound('O Time DEMO ficou sem administrador.');
  return admins;
}

/**
 * Gera e grava o conteudo: coordenadas, pessoas e vinculos de mapa.
 *
 * Tudo em lote, nas tabelas reais. As pessoas nascem com responsavel (um dos
 * administradores do time), endereco de Alagoas, zona e secao quando o
 * TRE/AL as publicou, e data de cadastro espalhada entre hoje, os ultimos
 * sete dias e o mes — os mesmos registros que os cartoes, o grafico, as
 * listas e o mapa vao ler.
 *
 * O que elas NAO ganham e acesso: nenhuma linha em `cmd_users`.
 */
async function seedDemoContent(
  client: Client,
  options: SeedOptions,
  /** Recebe os pontos criados AQUI, para o desfazer poder limpa-los. */
  pontos: string[],
  known?: Admin[],
): Promise<SeedSummary> {
  const admins = known ?? (await demoAdmins(client.id));

  const data = buildDemoData({
    seed: options.seedKey,
    people: options.people,
    places: options.places,
    admins: admins.length,
    usedPhones: admins.map((row) => row.phone ?? ''),
  });

  const locations = await seedLocations(data, pontos);
  const members = await seedMembers(client, data, admins);
  await seedMemberLocations(client.id, data, members, locations);

  const encontrados = [...locations.places, ...locations.residences].filter(
    (outcome) => outcome.point !== null,
  ).length;
  const total = locations.places.length + locations.residences.length;

  return {
    people: data.people.length,
    places: data.places.length,
    points: { resolved: encontrados, missing: total - encontrados },
  };
}

interface PointSlot {
  point: { locationId: string } | null;
  hash: string;
  error: string | null;
  /** Ate onde o endereco chega: rua, bairro ou municipio. */
  precision: string | null;
}

interface SeededLocations {
  /** Resultado de cada local de votacao, na ordem de `data.places`. */
  places: PointSlot[];
  /** Resultado de cada endereco de moradia, na ordem de `data.residences`. */
  residences: PointSlot[];
}

/**
 * Coordenadas de cada escola e de cada RUA — e nao uma por pessoa.
 *
 * E o mesmo comportamento do cache real (uma consulta serve a todos os
 * moradores daquela rua), e e o que faz os pinos se agruparem no mapa em vez
 * de virar um borrao de pontos soltos. Como o catalogo e curto e o cache e
 * compartilhado por consulta, o segundo Time DEMO nao consulta nada.
 *
 * Sequencial de proposito: duas consultas simultaneas do mesmo endereco
 * perguntariam duas vezes antes de existir cache — e cada consulta e cobrada.
 */
async function seedLocations(data: DemoData, pontos: string[]): Promise<SeededLocations> {
  const places: PointSlot[] = [];
  const residences: PointSlot[] = [];

  for (const entry of data.places) {
    const query = pollingPlaceLookup(entry.place);
    if (!query) {
      places.push({ point: null, hash: '', error: 'MISSING_DATA', precision: null });
      continue;
    }
    const outcome = await resolveDemoPoint(query, {
      city: entry.place.city,
      state: entry.place.state,
    });
    if (outcome.point?.created) pontos.push(outcome.point.locationId);
    places.push({
      point: outcome.point,
      hash: outcome.hash,
      error: outcome.error,
      // Precisao e coisa de endereco declarado, nao de local de votacao: o
      // pino da escola esta no predio, e a tela nao fala em aproximacao.
      precision: null,
    });
  }

  for (const entry of data.residences) {
    const lookup = residenceLookupFor(entry);
    if (!lookup) {
      residences.push({ point: null, hash: '', error: 'MISSING_DATA', precision: null });
      continue;
    }
    const outcome = await resolveDemoPoint(lookup.query, {
      city: entry.city,
      state: entry.state,
    });
    if (outcome.point?.created) pontos.push(outcome.point.locationId);
    residences.push({
      point: outcome.point,
      hash: outcome.hash,
      error: outcome.error,
      precision: lookup.precision,
    });
  }

  return { places, residences };
}

/** Pessoas ficticias, na tabela real de integrantes. */
async function seedMembers(
  client: Client,
  data: DemoData,
  admins: Admin[],
): Promise<Pick<MemberRow, 'id' | 'name' | 'phone'>[]> {
  // Opcoes de vinculo do formulario recem-criado: o Time DEMO usa o MESMO
  // construtor de formulario, entao os identificadores sao os dele.
  const vinculo = client.form.fields.find((field) => field.systemKey === 'relationship');
  const opcoes = vinculo?.options ?? [];

  const linhas = data.people.map((person) => {
    const responsavel = admins[person.adminIndex % admins.length];
    const opcao = opcoes.length > 0 ? opcoes[person.relationshipIndex % opcoes.length] : null;

    return {
      client_id: client.id,
      name: person.name,
      phone: normalizePhone(person.phone),
      gender: person.gender,
      street: person.street,
      district: person.district,
      city: person.city,
      state: person.state,
      zone: person.zone,
      section: person.section,
      relationship_option_id: opcao?.id ?? null,
      relationship_label: opcao?.label ?? null,
      // Cadastro pelo link, como a maior parte de um time real.
      source: 'invite',
      // A marca da geracao: e por ela, e so por ela, que a correcao sabe o
      // que pode refazer. Quem foi cadastrado a mao nao a tem, e fica.
      demo_seed: DEMO_SEED_VERSION,
      // O responsavel e um administrador do proprio time: a guarda do banco
      // confere time e perfil linha a linha.
      recruited_by_user_id: responsavel.id,
      recruited_by_name: responsavel.name,
      recruited_by_role: 'CANDIDATE',
      // Datas espalhadas entre hoje, os sete dias e o mes: sao estes mesmos
      // registros que alimentam os tres indicadores e o grafico.
      created_at: person.createdAt,
      updated_at: person.createdAt,
      // CPF, titulo, e-mail e consentimento ficam vazios de proposito.
    };
  });

  return insertRows<MemberRow>(TABLES.members, linhas, 'id,name,phone');
}

/**
 * Vinculos do mapa.
 *
 * Duas linhas por pessoa, como em um cadastro real que ja passou pela
 * localizacao: a moradia aproximada (pino da camada "Pessoas") e o local de
 * votacao (pino agrupado da escola).
 *
 * SUCCESS somente quando existe coordenada conferida. Sem ela o vinculo fica
 * NOT_FOUND (o provedor nao devolveu resultado confiavel) ou FAILED (a
 * consulta nao pode ser feita) — a tela conta o integrante como pendente, e
 * o mapa nao ganha um pino que nao corresponde a lugar nenhum.
 */
async function seedMemberLocations(
  clientId: string,
  data: DemoData,
  members: Pick<MemberRow, 'id' | 'phone'>[],
  locations: SeededLocations,
): Promise<void> {
  const agora = new Date().toISOString();
  const linhas: Record<string, string | null>[] = [];

  // O vinculo e feito pelo TELEFONE, que e unico no time, e nao pela ordem
  // em que o banco devolveu as linhas: depender da ordem faria a pessoa
  // receber o endereco e a escola de outra no dia em que ela mudasse.
  const porTelefone = new Map(members.map((member) => [normalizePhone(member.phone), member.id]));

  /**
   * Uma linha, com as MESMAS chaves em todos os casos: em um envio em lote o
   * PostgREST exige que todas as linhas tenham exatamente as mesmas chaves e
   * recusa o lote inteiro quando uma delas falta (PGRST102).
   */
  function link(
    memberId: string,
    kind: 'RESIDENCE' | 'POLLING_PLACE',
    slot: PointSlot | undefined,
  ): Record<string, string | null> {
    const found = slot?.point ?? null;
    return {
      client_id: clientId,
      member_id: memberId,
      location_kind: kind,
      status: found ? 'SUCCESS' : slot?.error ? 'FAILED' : 'NOT_FOUND',
      query_hash: slot?.hash || null,
      location_id: found?.locationId ?? null,
      location_precision: found ? (slot?.precision ?? null) : null,
      error_code: found ? null : (slot?.error ?? null),
      resolved_at: agora,
    };
  }

  data.people.forEach((person) => {
    const memberId = porTelefone.get(normalizePhone(person.phone));
    if (!memberId) return;

    // O ponto e o da RUA (ou do bairro, ou do municipio), nunca o da casa: e
    // o mesmo limite que o sistema real respeita ao mostrar moradia no mapa.
    linhas.push(link(memberId, 'RESIDENCE', locations.residences[person.residenceIndex]));
    linhas.push(link(memberId, 'POLLING_PLACE', locations.places[person.placeIndex]));
  });

  if (linhas.length > 0) await insertRows(TABLES.memberLocations, linhas, 'id');
}

/** UF unica do Time DEMO, exposta para quem precisar conferir. */
export const DEMO_TEAM_STATE = DEMO_STATE;
