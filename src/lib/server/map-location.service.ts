import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import {
  normalizeQuery,
  pollingPlaceQuery,
  residenceLookup,
  type AddressParts,
  type LocationKind,
  type LocationPrecision,
  type MapErrorCode,
  type MapPlace,
} from '@/lib/domain/map-location';
import type { MapOverviewPayload, MapPin } from '@/lib/domain/map-pin';
import type { TseResult } from '@/lib/domain/verification';
import {
  TABLES,
  type MapLocationRow,
  type MemberLocationRow,
  type MemberRow,
  type MemberVerificationRow,
} from '@/lib/supabase/tables';
import { deleteRows, inFilter, insertOne, selectOne, selectRows, updateRows } from '@/lib/supabase/rest';
import { signedUrls } from '@/lib/supabase/storage';
import { decryptJson } from './crypto';
import { lookupPlace, MapLookupError } from './serpapi.service';

/**
 * Coordenadas do integrante: moradia aproximada e local de votacao.
 *
 * Regras que valem em todo o arquivo:
 *   - o cadastro e a verificacao nunca dependem daqui;
 *   - cada consulta e cobrada: nada repete sozinho e o cache por consulta
 *     normalizada faz uma mesma rua ou escola ser perguntada uma unica vez;
 *   - um bloqueio atomico impede duas consultas simultaneas do mesmo vinculo;
 *   - nada disso vai para log: nem a consulta, nem a chave, nem a resposta.
 */

const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

export function queryHash(query: string): string {
  return createHash('sha256').update(normalizeQuery(query), 'utf8').digest('hex');
}

/* -------------------------------------------------------------------------
   Vinculos
   ------------------------------------------------------------------------- */

async function findLink(
  memberId: string,
  kind: LocationKind,
): Promise<MemberLocationRow | null> {
  return selectOne<MemberLocationRow>(TABLES.memberLocations, {
    select: '*',
    filters: { member_id: `eq.${memberId}`, location_kind: `eq.${kind}` },
  });
}

/** Cria o vinculo PENDING. Idempotente: um registro por integrante e tipo. */
export async function createPendingLocation(
  clientId: string,
  memberId: string,
  kind: LocationKind,
): Promise<void> {
  const existing = await findLink(memberId, kind);
  if (existing) return;

  await insertOne(
    TABLES.memberLocations,
    { client_id: clientId, member_id: memberId, location_kind: kind, status: 'PENDING' },
    'id',
  ).catch(() => undefined);
}

/**
 * Invalida apenas o tipo informado.
 *
 * Mudar o endereco declarado nao mexe no local de votacao, e uma nova consulta
 * eleitoral nao mexe na moradia.
 */
export async function invalidateLocation(
  clientId: string,
  memberId: string,
  kind: LocationKind,
): Promise<void> {
  const existing = await findLink(memberId, kind);
  if (!existing) {
    await createPendingLocation(clientId, memberId, kind);
    return;
  }

  await updateRows(
    TABLES.memberLocations,
    { member_id: `eq.${memberId}`, location_kind: `eq.${kind}` },
    {
      status: 'PENDING',
      query_hash: null,
      location_id: null,
      error_code: null,
      resolved_at: null,
      lock_token: null,
      locked_at: null,
    },
    'id',
  );
}

/* -------------------------------------------------------------------------
   Consulta
   ------------------------------------------------------------------------- */

async function cached(hash: string): Promise<MapLocationRow | null> {
  return selectOne<MapLocationRow>(TABLES.mapLocations, {
    select: '*',
    filters: { query_hash: `eq.${hash}` },
  });
}

async function remember(hash: string, place: MapPlace): Promise<MapLocationRow | null> {
  const row = await insertOne<MapLocationRow>(TABLES.mapLocations, {
    query_hash: hash,
    latitude: place.latitude,
    longitude: place.longitude,
    title: place.title,
    address: place.address,
    place_id: place.placeId,
    data_id: place.dataId,
    provider: 'SERPAPI_GOOGLE_MAPS',
    searched_at: new Date().toISOString(),
  }).catch(() => null);

  // Corrida entre duas execucoes: a unicidade decide e a outra linha serve.
  return row ?? (await cached(hash));
}

async function acquireLock(memberId: string, kind: LocationKind): Promise<MemberLocationRow | null> {
  const token = randomBytes(16).toString('hex');
  const now = new Date();
  const stale = new Date(now.getTime() - LOCK_TIMEOUT_MS).toISOString();

  const [locked] = await updateRows<MemberLocationRow>(
    TABLES.memberLocations,
    {
      member_id: `eq.${memberId}`,
      location_kind: `eq.${kind}`,
      or: `(lock_token.is.null,locked_at.lt.${stale})`,
    },
    { lock_token: token, locked_at: now.toISOString(), status: 'PROCESSING' },
  );

  return locked ?? null;
}

async function release(
  memberId: string,
  kind: LocationKind,
  patch: Record<string, string | number | null>,
): Promise<void> {
  await updateRows(
    TABLES.memberLocations,
    { member_id: `eq.${memberId}`, location_kind: `eq.${kind}` },
    { ...patch, lock_token: null, locked_at: null },
    'id',
  );
}

function errorCodeOf(error: unknown): MapErrorCode {
  return error instanceof MapLookupError ? error.code : 'UNEXPECTED';
}

/** Endereco de cada tipo, montado a partir do que ja esta guardado. */
async function addressFor(
  memberId: string,
  kind: LocationKind,
): Promise<{ query: string; expected: AddressParts; precision: LocationPrecision } | null> {
  const member = await selectOne<MemberRow>(TABLES.members, {
    select: 'id,client_id,street,district,city,state',
    filters: { id: `eq.${memberId}` },
  });
  if (!member) return null;

  if (kind === 'RESIDENCE') {
    const lookup = residenceLookup(member);
    return lookup
      ? {
          query: lookup.query,
          expected: { city: member.city, state: member.state },
          precision: lookup.precision,
        }
      : null;
  }

  const verification = await selectOne<MemberVerificationRow>(TABLES.memberVerifications, {
    select: 'tse_payload,tse_status',
    filters: { member_id: `eq.${memberId}` },
  });
  const eleitoral = decryptJson<TseResult>(verification?.tse_payload);
  if (!eleitoral) return null;

  const query = pollingPlaceQuery(eleitoral);
  return query
    ? { query, expected: { city: eleitoral.municipio, state: eleitoral.uf }, precision: 'STREET' }
    : null;
}

/**
 * Resolve um vinculo pendente.
 *
 * Consulta o cache primeiro; so chama o provedor quando aquela consulta e
 * inedita. Nunca repete uma consulta que falhou: isso e decisao do ADMIN.
 */
export async function resolveLocation(memberId: string, kind: LocationKind): Promise<void> {
  const current = await findLink(memberId, kind);
  if (!current || current.status === 'SUCCESS' || current.status === 'PROCESSING') return;

  const locked = await acquireLock(memberId, kind);
  if (!locked) return;

  const address = await addressFor(memberId, kind);
  if (!address) {
    await release(memberId, kind, {
      status: 'NOT_FOUND',
      error_code: 'MISSING_DATA',
      resolved_at: new Date().toISOString(),
    });
    return;
  }

  const hash = queryHash(address.query);
  const hit = await cached(hash);

  if (hit) {
    // Mesma rua ou mesma escola de outro integrante: nada e consultado.
    await release(memberId, kind, {
      status: 'SUCCESS',
      query_hash: hash,
      location_id: hit.id,
      location_precision: address.precision,
      error_code: null,
      requested_at: locked.requested_at ?? new Date().toISOString(),
      resolved_at: new Date().toISOString(),
    });
    return;
  }

  const startedAt = new Date().toISOString();

  try {
    const place = await lookupPlace(address.query, address.expected);

    if (!place) {
      await release(memberId, kind, {
        status: 'NOT_FOUND',
        query_hash: hash,
        location_id: null,
        error_code: null,
        attempts: locked.attempts + 1,
        requested_at: startedAt,
        resolved_at: new Date().toISOString(),
      });
      return;
    }

    const saved = await remember(hash, place);
    await release(memberId, kind, {
      status: saved ? 'SUCCESS' : 'FAILED',
      query_hash: hash,
      location_id: saved?.id ?? null,
      location_precision: saved ? address.precision : null,
      error_code: saved ? null : 'UNEXPECTED',
      attempts: locked.attempts + 1,
      requested_at: startedAt,
      resolved_at: new Date().toISOString(),
    });
  } catch (error) {
    await release(memberId, kind, {
      status: 'FAILED',
      query_hash: hash,
      error_code: errorCodeOf(error),
      attempts: locked.attempts + 1,
      requested_at: startedAt,
      resolved_at: new Date().toISOString(),
    });
  }
}

/**
 * Garante o vinculo de moradia de quem ainda nao tem.
 *
 * Basta municipio e UF: rua e bairro apenas deixam o ponto mais preciso.
 * Idempotente e sem consultar nada.
 */
export async function ensureResidenceLinks(limit = 200): Promise<void> {
  const [members, links] = await Promise.all([
    selectRows<MemberRow>(TABLES.members, {
      select: 'id,client_id,city,state',
      order: 'created_at.desc',
      limit,
    }),
    selectRows<MemberLocationRow>(TABLES.memberLocations, {
      select: 'member_id,location_kind',
      filters: { location_kind: 'eq.RESIDENCE' },
      limit: 2000,
    }),
  ]);

  const existing = new Set(links.map((link) => link.member_id));

  for (const member of members) {
    if (existing.has(member.id)) continue;
    if (!member.city?.trim() || !member.state?.trim()) continue;
    await createPendingLocation(member.client_id, member.id, 'RESIDENCE');
  }
}

/**
 * Processa os vinculos pendentes, um de cada vez.
 *
 * Sequencial de proposito: consultas simultaneas poderiam perguntar duas vezes
 * o mesmo endereco antes de o cache existir.
 */
export async function resolvePending(limit = 25): Promise<{ processed: number }> {
  const pending = await selectRows<MemberLocationRow>(TABLES.memberLocations, {
    select: 'member_id,location_kind',
    filters: { status: `eq.PENDING`, lock_token: 'is.null' },
    order: 'created_at.asc',
    limit,
  });

  let processed = 0;
  for (const row of pending) {
    await resolveLocation(row.member_id, row.location_kind);
    processed += 1;
  }

  return { processed };
}

/** Nova tentativa manual, pedida pelo ADMIN. Pode gerar cobranca. */
export async function retryLocation(memberId: string, kind: LocationKind): Promise<void> {
  await updateRows(
    TABLES.memberLocations,
    { member_id: `eq.${memberId}`, location_kind: `eq.${kind}` },
    { status: 'PENDING', error_code: null, lock_token: null, locked_at: null },
    'id',
  );
  await resolveLocation(memberId, kind);
}

/* -------------------------------------------------------------------------
   Leitura pelo ADMIN
   ------------------------------------------------------------------------- */

/**
 * Monta o mapa para o painel.
 *
 * Nada sensivel sai daqui: sem CPF, telefone, endereco residencial completo,
 * numero, ou qualquer parte do retorno da consulta cadastral.
 */
export async function mapOverview(): Promise<MapOverviewPayload> {
  const links = await selectRows<MemberLocationRow>(TABLES.memberLocations, {
    select: '*',
    order: 'updated_at.desc',
    limit: 2000,
  });

  const totals = { residence: 0, pollingPlace: 0, pending: 0, notFound: 0 };
  const resolved = links.filter((link) => link.status === 'SUCCESS' && link.location_id);

  for (const link of links) {
    if (link.status === 'SUCCESS' && link.location_id) {
      if (link.location_kind === 'RESIDENCE') totals.residence += 1;
      else totals.pollingPlace += 1;
    } else if (link.status === 'NOT_FOUND') totals.notFound += 1;
    else totals.pending += 1;
  }

  if (resolved.length === 0) return { pins: [], totals };

  const locationIds = [...new Set(resolved.map((link) => link.location_id as string))];
  const memberIds = [...new Set(resolved.map((link) => link.member_id))];

  const [places, members] = await Promise.all([
    selectRows<MapLocationRow>(TABLES.mapLocations, {
      select: 'id,latitude,longitude,title',
      filters: { id: inFilter(locationIds) },
    }),
    selectRows<MemberRow>(TABLES.members, {
      select: 'id,client_id,name,photo_path,street,district,city,state',
      filters: { id: inFilter(memberIds) },
    }),
  ]);

  const clientIds = [...new Set(members.map((member) => member.client_id))];
  const [clients, photos, verifications] = await Promise.all([
    selectRows<{ id: string; name: string }>(TABLES.clients, {
      select: 'id,name',
      filters: { id: inFilter(clientIds) },
    }),
    signedUrls(members.map((member) => member.photo_path)),
    selectRows<MemberVerificationRow>(TABLES.memberVerifications, {
      select: 'member_id,tse_payload',
      filters: { member_id: inFilter(memberIds) },
    }),
  ]);

  const placeById = new Map(places.map((place) => [place.id, place]));
  const memberById = new Map(members.map((member, index) => [member.id, { member, photo: photos[index] ?? null }]));
  const clientById = new Map(clients.map((client) => [client.id, client.name]));
  const tseById = new Map(
    verifications.map((row) => [row.member_id, decryptJson<TseResult>(row.tse_payload)]),
  );

  const pins: MapPin[] = [];

  for (const link of resolved) {
    const place = placeById.get(link.location_id as string);
    const entry = memberById.get(link.member_id);
    if (!place || !entry) continue;

    const { member, photo } = entry;
    const eleitoral = link.location_kind === 'POLLING_PLACE' ? tseById.get(member.id) : null;

    pins.push({
      memberId: member.id,
      memberName: member.name,
      memberPhoto: photo,
      clientId: member.client_id,
      clientName: clientById.get(member.client_id) ?? 'Cliente',
      locationKind: link.location_kind,
      latitude: place.latitude,
      longitude: place.longitude,
      place: link.location_kind === 'RESIDENCE' ? member.street : (place.title ?? eleitoral?.local ?? null),
      district: link.location_kind === 'RESIDENCE' ? member.district : (eleitoral?.bairro ?? null),
      city: link.location_kind === 'RESIDENCE' ? member.city : (eleitoral?.municipio ?? null),
      state: link.location_kind === 'RESIDENCE' ? member.state : (eleitoral?.uf ?? null),
      zone: eleitoral?.zona ?? null,
      section: eleitoral?.secao ?? null,
      precision: link.location_precision ?? (link.location_kind === 'RESIDENCE' ? 'CITY' : 'STREET'),
    });
  }

  return { pins, totals };
}

/** Usado quando o integrante e removido: o lugar continua servindo aos demais. */
export async function deleteMemberLocations(memberId: string): Promise<void> {
  await deleteRows(TABLES.memberLocations, { member_id: `eq.${memberId}` }, 'id');
}
