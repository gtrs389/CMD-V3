-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 054: votacao por secao do TSE (resultado oficial da eleicao)
--
-- Execute no SQL Editor do Supabase depois de 053_inconsistencias_desligadas.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE,
-- DROP COLUMN, DELETE nem TRUNCATE. Nenhuma API externa e consultada.
--
-- O QUE E
--
-- O TSE publica, no Portal de Dados Abertos, a "votacao por secao
-- eleitoral": quantos votos cada candidato teve em cada secao. O ADMIN geral
-- envia essa planilha pelo mapa, e o mapa passa a mostrar a votacao de
-- qualquer candidato por escola, zona e secao.
--
-- COMO E GUARDADO
--
-- A planilha tem uma linha por candidato por secao — mais de um milhao de
-- linhas em um estado so. Guardar assim encheria o banco sem necessidade:
-- quem le e o mapa, e ele sempre le UM candidato de cada vez. Entao:
--
--   cmd_election_sections  uma linha por secao: municipio e local de votacao
--                          (alguns milhares de linhas por estado);
--   cmd_election_votes     uma linha por candidato, com as secoes onde teve
--                          voto numa lista compacta [[zona, secao, votos]].
--
-- Dado publico, sem vinculo com integrante ou cadastro. Nenhum dado pessoal
-- entra aqui.
--
-- IDEMPOTENTE: as chaves unicas deixam a mesma planilha ser enviada de novo
-- quantas vezes for preciso — a linha existente e atualizada, nunca
-- duplicada.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. As secoes eleitorais, com o local onde funcionam
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_election_sections (
  id uuid primary key default gen_random_uuid(),

  year integer not null check (year between 2000 and 2100),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  zone integer not null check (zone between 1 and 9999),
  section integer not null check (section between 1 and 99999),

  -- Codigo do municipio no TSE (nao e o do IBGE), como em cmd_polling_places.
  city_code integer check (city_code > 0),
  city text check (length(city) <= 120),

  place_number integer check (place_number >= 0),
  place_name text check (length(place_name) <= 300),
  place_address text check (length(place_address) <= 400),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cmd_election_sections_uniq unique (year, uf, zone, section)
);

create index if not exists cmd_election_sections_zone_idx
  on public.cmd_election_sections (year, uf, zone);

-- ---------------------------------------------------------------------------
-- 2. Os votos de cada candidato (ou legenda, branco e nulo), secao a secao
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_election_votes (
  id uuid primary key default gen_random_uuid(),

  year integer not null check (year between 2000 and 2100),
  round smallint not null check (round in (1, 2)),
  uf text not null check (uf ~ '^[A-Z]{2}$'),

  -- Codigo e nome do cargo como o TSE escreve: 1 Presidente, 3 Governador,
  -- 5 Senador, 6 Deputado Federal, 7 Deputado Estadual...
  office_code integer not null check (office_code > 0),
  office text not null check (length(office) between 1 and 80),

  -- Numero na urna. 95 e branco, 96 e nulo; nos cargos proporcionais, dois
  -- digitos e voto de legenda (no partido).
  number text not null check (number ~ '^[0-9]{1,6}$'),
  name text not null check (length(name) between 1 and 200),
  kind text not null check (kind in ('CANDIDATO', 'LEGENDA', 'BRANCO', 'NULO')),

  total_votes integer not null default 0 check (total_votes >= 0),
  -- [[zona, secao, votos], ...]: so as secoes onde houve voto.
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cmd_election_votes_uniq unique (year, round, uf, office_code, number)
);

-- A busca do seletor: cargo e turno, do mais votado para o menos votado.
create index if not exists cmd_election_votes_office_idx
  on public.cmd_election_votes (year, uf, round, office_code, total_votes desc);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'cmd_election_sections_updated_at') then
    create trigger cmd_election_sections_updated_at
      before update on public.cmd_election_sections
      for each row execute function public.cmd_set_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'cmd_election_votes_updated_at') then
    create trigger cmd_election_votes_updated_at
      before update on public.cmd_election_votes
      for each row execute function public.cmd_set_updated_at();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. RLS e privilegios, no mesmo padrao das migrations anteriores
-- ---------------------------------------------------------------------------
alter table public.cmd_election_sections enable row level security;
alter table public.cmd_election_sections force row level security;
alter table public.cmd_election_votes enable row level security;
alter table public.cmd_election_votes force row level security;

do $$
declare
  papel text;
  tabela text;
begin
  foreach tabela in array array['cmd_election_sections', 'cmd_election_votes']
  loop
    foreach papel in array array['public', 'anon', 'authenticated']
    loop
      if papel = 'public' then
        execute format('revoke all on table public.%I from public', tabela);
      elsif exists (select 1 from pg_roles where rolname = papel) then
        execute format('revoke all on table public.%I from %I', tabela, papel);
      end if;
    end loop;

    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant select, insert, update, delete on table public.%I to service_role', tabela);
    end if;
  end loop;
end
$$;

comment on table public.cmd_election_sections is
  'Secoes eleitorais da votacao por secao do TSE (migration 054): municipio e local de cada uma. Dado publico.';
comment on table public.cmd_election_votes is
  'Votos de cada candidato por secao, do resultado oficial do TSE (migration 054). Dado publico.';
comment on column public.cmd_election_votes.sections is
  'Lista compacta [[zona, secao, votos], ...], so com as secoes onde houve voto.';

commit;
