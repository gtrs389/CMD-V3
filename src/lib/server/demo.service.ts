import 'server-only';
import { createHash } from 'node:crypto';
import type { Client, TeamPersonInput } from '@/lib/types';
import {
  DEMO_LIMITS,
  DEMO_PROVIDER,
  buildDemoData,
  clampCount,
  type DemoData,
} from '@/lib/domain/demo';
import { normalizePhone } from '@/lib/utils/phone';
import {
  TABLES,
  type MapLocationRow,
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
import { createClient, deleteClient, getClient } from './client.service';
import { badRequest, notFound } from './http';

/**
 * Criacao de um Time DEMO.
 *
 * O Time DEMO e um time DE VERDADE: mesmas tabelas, mesmas telas, mesmos
 * servicos. Nao existe tela falsa, tabela paralela nem numero chumbado em
 * componente — o que a pagina do time mostra sai das mesmas consultas que
 * mostram um time real.
 *
 * O que ele tem de diferente e um sinal, `is_demo`, que o mantem fora de
 * toda metrica global (ver `demo-scope.ts`), e o fato de que os dados dele
 * sao gerados aqui, no servidor, a partir de listas ficticias
 * (`@/lib/domain/demo`).
 *
 * NENHUMA CONSULTA EXTERNA acontece: nem SerpAPI, nem TSE, nem FonteData.
 * As coordenadas vem do proprio conjunto de dados e sao gravadas no cache do
 * mapa com `provider = 'DEMO_SEED'` — a linha diz de onde veio, e ninguem
 * confunde ponto semeado com consulta paga.
 *
 * NENHUM DADO PESSOAL REAL entra: sem CPF, sem titulo de eleitor, sem
 * e-mail, e os telefones sao de uma faixa de demonstracao.
 *
 * QUEM TEM ACESSO AO PAINEL: somente os administradores que o ADMIN geral
 * cadastrou a mao. As pessoas ficticias sao DADOS, e nada mais — elas
 * existem em `cmd_members` e em nenhum outro lugar. Sem usuario, sem senha,
 * sem sessao, sem link de acesso, sem aparelho vinculado e sem convite
 * pessoal: nao ha por onde entrar nem o que gerar em nome delas. Criar trinta
 * contas so para calar um aviso de tela seria fabricar acesso que ninguem
 * pediu.
 *
 * A criacao e ATOMICA na pratica: o PostgREST nao abre transacao entre
 * chamadas, entao qualquer falha depois do time criado desfaz tudo pelo
 * caminho que o proprio sistema ja usa — excluir o time, que leva junto, em
 * cascata, campos, pessoas, acessos, integrantes e vinculos de mapa. Nunca
 * fica um Time DEMO pela metade.
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

/** SHA-256 estavel de um ponto semeado: nunca colide com outra consulta. */
function seededHash(clientId: string, kind: string, index: number): string {
  return createHash('sha256').update(`demo:${clientId}:${kind}:${index}`, 'utf8').digest('hex');
}

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
  /** Coordenadas semeadas: elas nao pertencem ao time, entao saem na mao. */
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
    // pontos junto, e um ponto orfao ficaria no mapa de ninguem.
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

/* -------------------------------------------------------------------------
   Conteudo de demonstracao
   ------------------------------------------------------------------------- */

interface SeedOptions {
  people: number;
  places: number;
  seedKey: string;
}

/**
 * Gera e grava o conteudo: locais, pessoas e vinculos de mapa.
 *
 * Tudo em lote, nas tabelas reais. As pessoas nascem com responsavel (um dos
 * administradores do time), endereco, zona, secao e data de cadastro
 * espalhada entre hoje, os ultimos sete dias e o mes — os mesmos registros
 * que os cartoes, o grafico, as listas e o mapa vao ler.
 *
 * O que elas NAO ganham e acesso: nenhuma linha em `cmd_users`. Elas sao
 * dados de demonstracao, e nao pessoas que entram no sistema.
 */
async function seedDemoContent(
  client: Client,
  options: SeedOptions,
  /** Recebe os pontos criados, para o desfazer poder limpa-los. */
  pontos: string[],
): Promise<void> {
  // Administradores recem-criados: sao eles que aparecem em "Cadastrado por".
  const admins = await selectRows<Pick<UserRow, 'id' | 'name' | 'phone'>>(TABLES.users, {
    select: 'id,name,phone',
    filters: { client_id: `eq.${client.id}`, role: 'eq.CANDIDATE', is_active: 'is.true' },
    order: 'created_at.asc',
  });
  if (admins.length === 0) throw notFound('O Time DEMO ficou sem administrador.');

  const data = buildDemoData({
    seed: options.seedKey,
    people: options.people,
    places: options.places,
    admins: admins.length,
    usedPhones: admins.map((row) => row.phone ?? ''),
  });

  const locations = await seedLocations(client.id, data);
  pontos.push(...locations.places, ...locations.streets);
  const members = await seedMembers(client, data, admins);
  await seedMemberLocations(client.id, data, members, locations);
}

interface SeededLocations {
  /** Coordenada de cada local de votacao, na ordem de `data.places`. */
  places: string[];
  /** Coordenada de cada rua, na ordem de `data.streets`. */
  streets: string[];
}

/**
 * Locais no cache do mapa, com `provider = 'DEMO_SEED'`.
 *
 * Uma coordenada por escola e uma por RUA — e nao uma por pessoa. E o mesmo
 * comportamento do cache real (uma consulta serve a todos os moradores
 * daquela rua), e e o que faz os pinos se agruparem no mapa em vez de virar
 * um borrao de pontos soltos.
 */
async function seedLocations(clientId: string, data: DemoData): Promise<SeededLocations> {
  const linhas = [
    ...data.places.map((place, index) => ({
      query_hash: seededHash(clientId, 'place', index),
      latitude: place.latitude,
      longitude: place.longitude,
      title: place.title,
      address: place.address,
      provider: DEMO_PROVIDER,
    })),
    ...data.streets.map((street, index) => ({
      query_hash: seededHash(clientId, 'street', index),
      latitude: street.latitude,
      longitude: street.longitude,
      title: street.street,
      address: `${street.street} - ${street.district}, ${street.city}/${street.state}`,
      provider: DEMO_PROVIDER,
    })),
  ];

  const gravados = await insertRows<MapLocationRow>(TABLES.mapLocations, linhas, 'id,query_hash');
  const porHash = new Map(gravados.map((row) => [row.query_hash, row.id]));

  const places = data.places.map((_, index) => {
    const id = porHash.get(seededHash(clientId, 'place', index));
    if (!id) throw notFound('Local de votação de demonstração não foi criado.');
    return id;
  });
  const streets = data.streets.map((_, index) => {
    const id = porHash.get(seededHash(clientId, 'street', index));
    if (!id) throw notFound('Endereço de demonstração não foi criado.');
    return id;
  });

  return { places, streets };
}

/** Pessoas ficticias, na tabela real de integrantes. */
async function seedMembers(
  client: Client,
  data: DemoData,
  admins: Pick<UserRow, 'id' | 'name' | 'phone'>[],
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
 * Vinculos do mapa, ja resolvidos.
 *
 * Duas linhas por pessoa, como em um cadastro real que ja passou pela
 * localizacao: a moradia aproximada (pino da camada "Pessoas") e o local de
 * votacao (pino agrupado da escola). Status SUCCESS porque a coordenada
 * existe — ela foi semeada, e a propria linha do cache diz isso.
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

  data.people.forEach((person) => {
    const memberId = porTelefone.get(normalizePhone(person.phone));
    if (!memberId) return;

    linhas.push({
      client_id: clientId,
      member_id: memberId,
      location_kind: 'RESIDENCE',
      status: 'SUCCESS',
      location_id: locations.streets[person.streetIndex] ?? null,
      // O ponto e o da RUA, nunca o da casa: e o mesmo limite que o sistema
      // real respeita ao mostrar moradia no mapa.
      location_precision: 'STREET',
      resolved_at: agora,
    });

    linhas.push({
      client_id: clientId,
      member_id: memberId,
      location_kind: 'POLLING_PLACE',
      status: 'SUCCESS',
      location_id: locations.places[person.placeIndex] ?? null,
      // Nula de proposito, e escrita: precisao e coisa de endereco
      // declarado, nao de local de votacao. Mas a chave PRECISA existir —
      // em um envio em lote, o PostgREST exige que todas as linhas tenham
      // exatamente as mesmas chaves, e recusa o lote inteiro quando uma
      // delas falta (PGRST102).
      location_precision: null,
      resolved_at: agora,
    });
  });

  if (linhas.length > 0) await insertRows(TABLES.memberLocations, linhas, 'id');
}
