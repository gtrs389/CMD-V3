import 'server-only';
import {
  escolasDoCandidato,
  type CandidatoDaVotacao,
  type SecaoEleitoral,
  type VotacaoDoCandidato,
  type VotacaoNoMapa,
} from '@/lib/domain/votacao-tse';
import { deleteRows, selectOne, selectRows, upsertRows } from '@/lib/supabase/rest';
import { TABLES, type ElectionSectionRow, type ElectionVotesRow } from '@/lib/supabase/tables';
import { notFound } from './http';
import { pollingPlacesOfZones } from './polling-place.service';

/**
 * Votacao oficial do TSE no mapa (migration 054).
 *
 * A planilha e lida no NAVEGADOR de quem envia: um arquivo de centenas de
 * megas nao cabe numa requisicao, e o servidor so recebe o que sobra da
 * leitura — as secoes e um resumo compacto por candidato. Aqui ela e gravada
 * (repetivel: a mesma planilha de novo atualiza no lugar) e lida de volta,
 * um candidato de cada vez.
 */

export async function gravarSecoes(secoes: SecaoEleitoral[]): Promise<void> {
  await upsertRows(
    TABLES.electionSections,
    secoes.map((s) => ({
      year: s.ano,
      uf: s.uf,
      zone: s.zona,
      section: s.secao,
      city_code: s.municipioCodigo,
      city: s.municipio?.slice(0, 120) ?? null,
      place_number: s.localNumero,
      place_name: s.localNome?.slice(0, 300) ?? null,
      place_address: s.localEndereco?.slice(0, 400) ?? null,
    })),
    'year,uf,zone,section',
  );
}

export async function gravarCandidatos(candidatos: VotacaoDoCandidato[]): Promise<void> {
  // Poucos por vez: o mais votado de um estado carrega milhares de secoes.
  await upsertRows(
    TABLES.electionVotes,
    candidatos.map((c) => ({
      year: c.ano,
      round: c.turno,
      uf: c.uf,
      office_code: c.cargoCodigo,
      office: c.cargo.slice(0, 80),
      number: c.numero,
      name: c.nome.slice(0, 200),
      kind: c.tipo,
      total_votes: c.total,
      sections: c.secoes,
    })),
    'year,round,uf,office_code,number',
    50,
  );
}

const RESUMO = 'id,year,round,uf,office_code,office,number,name,kind,total_votes,official_votes';

function candidato(row: Omit<ElectionVotesRow, 'sections' | 'updated_at'>): CandidatoDaVotacao {
  return {
    id: row.id,
    ano: row.year,
    turno: row.round,
    uf: row.uf,
    cargoCodigo: row.office_code,
    cargo: row.office,
    numero: row.number,
    nome: row.name,
    tipo: row.kind,
    total: row.total_votes,
    totalOficial: row.official_votes ?? null,
  };
}

/** Todos os candidatos gravados, sem as secoes: o seletor filtra na tela. */
export async function candidatosDaVotacao(): Promise<CandidatoDaVotacao[]> {
  const rows = await selectRows<Omit<ElectionVotesRow, 'sections' | 'updated_at'>>(TABLES.electionVotes, {
    select: RESUMO,
    order: 'year.desc,round.asc,office_code.asc,total_votes.desc',
  });
  return rows.map(candidato);
}

/* -------------------------------------------------------------------------
   Favoritos (migration 057)
   ------------------------------------------------------------------------- */

const FAVORITOS = 'cmd_election_favorites';

/**
 * Os favoritos da pessoa, como chaves "ano:uf:cargo:numero".
 *
 * Sem a migration 057, a votacao continua funcionando — so sem favoritos.
 */
export async function favoritosDe(userId: string): Promise<string[]> {
  const rows = await selectRows<{ year: number; uf: string; office_code: number; number: string }>(FAVORITOS, {
    select: 'year,uf,office_code,number',
    filters: { user_id: `eq.${userId}` },
    order: 'created_at.asc',
  }).catch(() => []);
  return rows.map((r) => `${r.year}:${r.uf}:${r.office_code}:${r.number}`);
}

export async function marcarFavorito(
  userId: string,
  c: { ano: number; uf: string; cargoCodigo: number; numero: string },
  favorito: boolean,
): Promise<void> {
  const chave = { user_id: userId, year: c.ano, uf: c.uf, office_code: c.cargoCodigo, number: c.numero };
  if (favorito) {
    await upsertRows(FAVORITOS, [chave], 'user_id,year,uf,office_code,number');
    return;
  }
  await deleteRows(FAVORITOS, {
    user_id: `eq.${userId}`,
    year: `eq.${c.ano}`,
    uf: `eq.${c.uf}`,
    office_code: `eq.${c.cargoCodigo}`,
    number: `eq.${c.numero}`,
  }, 'user_id');
}

/** Os votos de um candidato, escola por escola, zona e secao. */
export async function votacaoNoMapa(id: string): Promise<VotacaoNoMapa> {
  const row = await selectOne<ElectionVotesRow>(TABLES.electionVotes, {
    select: `${RESUMO},sections`,
    filters: { id: `eq.${id}` },
  }).catch(() => null);
  if (!row) throw notFound('Candidato não encontrado na votação.');

  const zonas = [...new Set(row.sections.map(([zona]) => zona))];
  const [locais, secoes] = await Promise.all([
    pollingPlacesOfZones(row.uf, zonas),
    zonas.length === 0
      ? Promise.resolve([] as ElectionSectionRow[])
      : selectRows<ElectionSectionRow>(TABLES.electionSections, {
          select: 'zone,section,city,place_number,place_name,place_address',
          filters: { year: `eq.${row.year}`, uf: `eq.${row.uf}`, zone: `in.(${zonas.join(',')})` },
        }),
  ]);

  return {
    candidato: candidato(row),
    ...escolasDoCandidato(
      row.sections,
      row.uf,
      locais.map((l) => ({ ...l, latitude: l.latitude === null ? null : Number(l.latitude), longitude: l.longitude === null ? null : Number(l.longitude) })),
      secoes,
    ),
  };
}
