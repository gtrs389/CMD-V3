-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 008: coordenadas do mapa (moradia aproximada e local de votacao)
--
-- Execute no SQL Editor do Supabase depois de 007_member_street.sql.
-- Nao altera as anteriores. Idempotente, sem DROP de dados e dentro de uma
-- transacao: pode ser executada mais de uma vez com seguranca.
--
-- Duas tabelas:
--   1. cmd_map_locations  - cache das coordenadas, por consulta normalizada.
--      A consulta em si nunca e guardada: fica apenas o SHA-256 dela. Uma
--      mesma escola ou rua e consultada (e paga) uma unica vez e serve a
--      todos os integrantes daquele lugar.
--   2. cmd_member_locations - vinculo entre o integrante e o lugar, com um
--      registro por tipo (moradia e local de votacao).
--
-- Nenhuma consulta externa acontece aqui: a migration apenas cria os vinculos
-- PENDING dos cadastros que ja existem.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Tipos
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regtype('public.cmd_location_kind') is null then
    create type public.cmd_location_kind as enum ('RESIDENCE', 'POLLING_PLACE');
  end if;

  if to_regtype('public.cmd_location_status') is null then
    create type public.cmd_location_status as enum (
      'PENDING', 'PROCESSING', 'SUCCESS', 'NOT_FOUND', 'FAILED'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Cache das coordenadas
--
-- `query_hash` e o SHA-256 da consulta ja normalizada. O texto da consulta
-- nao e guardado: o endereco reconstruido pelo provedor fica em `address`,
-- que e o que o proprio provedor devolveu.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_map_locations (
  id         uuid primary key default gen_random_uuid(),
  query_hash text not null unique check (query_hash ~ '^[0-9a-f]{64}$'),

  latitude  double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),

  title    text check (length(title) <= 300),
  address  text check (length(address) <= 500),
  place_id text check (length(place_id) <= 200),
  data_id  text check (length(data_id) <= 200),

  provider text not null default 'SERPAPI_GOOGLE_MAPS'
    check (provider in ('SERPAPI_GOOGLE_MAPS')),

  searched_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Vinculo entre integrante e lugar
--
-- Um registro por tipo: o mesmo integrante tem a moradia aproximada e o local
-- de votacao lado a lado, sem um apagar o outro. Excluir o integrante remove
-- apenas o vinculo; o lugar continua servindo aos demais (`on delete set null`
-- na referencia ao cache).
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_member_locations (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  member_id uuid not null,

  location_kind public.cmd_location_kind not null,
  status        public.cmd_location_status not null default 'PENDING',

  -- Consulta pendente e o lugar ja encontrado.
  query_hash  text check (query_hash ~ '^[0-9a-f]{64}$'),
  location_id uuid references public.cmd_map_locations (id) on delete set null,

  attempts   integer not null default 0 check (attempts between 0 and 50),
  error_code text check (error_code ~ '^[A-Z_]{1,40}$'),

  requested_at timestamptz,
  resolved_at  timestamptz,

  -- Bloqueio atomico: impede duas consultas simultaneas do mesmo vinculo.
  locked_at  timestamptz,
  lock_token text check (lock_token ~ '^[0-9a-f]{32}$'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cmd_member_locations_member_fk
    foreign key (member_id, client_id)
    references public.cmd_members (id, client_id) on delete cascade,
  constraint cmd_member_locations_member_kind_uniq unique (member_id, location_kind)
);

create index if not exists cmd_member_locations_client_idx
  on public.cmd_member_locations (client_id, location_kind, status);
create index if not exists cmd_member_locations_status_idx
  on public.cmd_member_locations (status, location_kind);
create index if not exists cmd_member_locations_location_idx
  on public.cmd_member_locations (location_id);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'cmd_member_locations_updated_at'
  ) then
    create trigger cmd_member_locations_updated_at
      before update on public.cmd_member_locations
      for each row execute function public.cmd_set_updated_at();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Vinculos dos cadastros que ja existem
--
-- Nada e consultado agora: os vinculos nascem PENDING e o ADMIN decide quando
-- localizar, porque cada consulta e paga.
-- ---------------------------------------------------------------------------

-- Moradia: exige rua, bairro, municipio e UF declarados.
insert into public.cmd_member_locations (client_id, member_id, location_kind, status)
select m.client_id, m.id, 'RESIDENCE', 'PENDING'
  from public.cmd_members m
 where coalesce(btrim(m.street), '') <> ''
   and coalesce(btrim(m.district), '') <> ''
   and coalesce(btrim(m.city), '') <> ''
   and coalesce(btrim(m.state), '') <> ''
   and not exists (
     select 1 from public.cmd_member_locations l
      where l.member_id = m.id and l.location_kind = 'RESIDENCE'
   );

-- Local de votacao: so quem ja teve a consulta eleitoral concluida.
insert into public.cmd_member_locations (client_id, member_id, location_kind, status)
select v.client_id, v.member_id, 'POLLING_PLACE', 'PENDING'
  from public.cmd_member_verifications v
 where v.tse_status = 'SUCCESS'
   and not exists (
     select 1 from public.cmd_member_locations l
      where l.member_id = v.member_id and l.location_kind = 'POLLING_PLACE'
   );

-- ---------------------------------------------------------------------------
-- 5. RLS e privilegios, no mesmo padrao das migrations anteriores
-- ---------------------------------------------------------------------------
alter table public.cmd_map_locations    enable row level security;
alter table public.cmd_member_locations enable row level security;

alter table public.cmd_map_locations    force row level security;
alter table public.cmd_member_locations force row level security;

do $$
declare
  papel  text;
  tabela text;
  tabelas constant text[] := array['cmd_map_locations', 'cmd_member_locations'];
begin
  foreach tabela in array tabelas
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
      execute format(
        'grant select, insert, update, delete on table public.%I to service_role', tabela
      );
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Comentarios
-- ---------------------------------------------------------------------------
comment on table public.cmd_map_locations is
  'Coordenadas ja consultadas, compartilhadas por consulta normalizada (SHA-256).';
comment on column public.cmd_map_locations.query_hash is
  'SHA-256 da consulta normalizada. O texto da consulta nunca e guardado.';
comment on table public.cmd_member_locations is
  'Vinculo do integrante com a moradia aproximada e com o local de votacao.';
comment on column public.cmd_member_locations.location_kind is
  'RESIDENCE e um ponto aproximado da rua declarada; POLLING_PLACE e o local de votacao.';
comment on column public.cmd_member_locations.lock_token is
  'Bloqueio atomico: impede consultas simultaneas, que seriam cobradas duas vezes.';

commit;
