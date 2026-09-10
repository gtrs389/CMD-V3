-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 002: registro tecnico do aparelho usado no cadastro publico
--
-- Execute no SQL Editor do Supabase depois de 001_cmd_initial.sql.
-- Nao altera nada da 001. Idempotente, sem DROP e dentro de uma transacao.
--
-- Estes dados sao apenas SINAIS DE SEGURANCA. Nesta etapa eles nao autorizam
-- nenhum acesso: o status nasce como OBSERVED e nada no sistema promove um
-- aparelho a TRUSTED.
--
-- O que NAO e coletado, por decisao de projeto: MAC, IMEI, numero de serie,
-- GPS, contatos, aplicativos instalados, canvas fingerprint e WebGL
-- fingerprint. O IP puro nunca e gravado, apenas o HMAC-SHA256 dele.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Tipo
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regtype('public.cmd_device_status') is null then
    create type public.cmd_device_status as enum ('OBSERVED', 'TRUSTED', 'BLOCKED');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Tabela
--
-- `client_id` acompanha `member_id` na chave estrangeira composta, seguindo o
-- mesmo padrao de cmd_member_responses: o aparelho fica preso ao cliente do
-- proprio integrante.
--
-- Toda coluna de sinal aceita nulo de proposito: a ausencia de qualquer
-- informacao nunca pode impedir o cadastro.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_member_devices (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null,
  member_id  uuid not null,

  -- Token aleatorio guardado no cookie do navegador. Aqui fica so o hash.
  device_token_hash text not null check (device_token_hash ~ '^[0-9a-f]{64}$'),

  -- Nunca nasce TRUSTED.
  status public.cmd_device_status not null default 'OBSERVED',

  -- Cabecalhos enviados pelo navegador.
  user_agent      text check (length(user_agent) <= 512),
  ch_ua           text check (length(ch_ua) <= 256),
  ch_ua_mobile    text check (length(ch_ua_mobile) <= 16),
  ch_ua_platform  text check (length(ch_ua_platform) <= 64),

  -- Sinais lidos na propria pagina.
  platform         text check (length(platform) <= 64),
  is_mobile        boolean,
  language         text check (length(language) <= 32),
  timezone         text check (length(timezone) <= 64),
  screen_width     integer check (screen_width is null or (screen_width between 1 and 100000)),
  screen_height    integer check (screen_height is null or (screen_height between 1 and 100000)),
  max_touch_points integer check (max_touch_points is null or (max_touch_points between 0 and 64)),

  -- HMAC-SHA256 do IP publico, calculado somente no servidor.
  -- O endereco em si nunca e gravado nem registrado em log.
  ip_hash text check (ip_hash ~ '^[0-9a-f]{64}$'),

  -- Geolocalizacao grosseira informada pela Vercel, quando houver.
  geo_country text check (length(geo_country) <= 8),
  geo_region  text check (length(geo_region) <= 16),

  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),

  constraint cmd_member_devices_member_fk
    foreign key (member_id, client_id)
    references public.cmd_members (id, client_id) on delete cascade,
  constraint cmd_member_devices_member_token_uniq unique (member_id, device_token_hash)
);

-- ---------------------------------------------------------------------------
-- 3. Indices
-- ---------------------------------------------------------------------------
create index if not exists cmd_member_devices_member_idx
  on public.cmd_member_devices (member_id);
create index if not exists cmd_member_devices_client_idx
  on public.cmd_member_devices (client_id, last_seen_at desc);
create index if not exists cmd_member_devices_token_idx
  on public.cmd_member_devices (device_token_hash);
create index if not exists cmd_member_devices_ip_idx
  on public.cmd_member_devices (ip_hash);

-- ---------------------------------------------------------------------------
-- 4. RLS e privilegios, no mesmo padrao da 001
-- ---------------------------------------------------------------------------
alter table public.cmd_member_devices enable row level security;
alter table public.cmd_member_devices force row level security;

do $$
declare
  papel text;
begin
  foreach papel in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on table public.cmd_member_devices from %I', papel);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.cmd_member_devices to service_role';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Comentarios
-- ---------------------------------------------------------------------------
comment on table public.cmd_member_devices is
  'Sinais tecnicos do aparelho usado no cadastro publico. Nao autorizam acesso.';
comment on column public.cmd_member_devices.device_token_hash is
  'SHA-256 do token aleatorio guardado em cookie HttpOnly. O token nunca e gravado.';
comment on column public.cmd_member_devices.ip_hash is
  'HMAC-SHA256 do IP publico, com chave do servidor. O IP puro nunca e gravado.';
comment on column public.cmd_member_devices.status is
  'Nasce OBSERVED. Nada no sistema promove a TRUSTED nesta etapa.';

commit;
