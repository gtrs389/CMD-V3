-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 019: um link de acesso para cada publico do time
--
-- Execute no SQL Editor do Supabase depois de
-- 018_team_member_phone_access.sql. Nao altera as anteriores. Idempotente,
-- transacional e sem DROP TABLE, DROP COLUMN, DELETE ou TRUNCATE.
--
-- O que muda:
--   1. `cmd_team_access_links` passa a ter DOIS enderecos por time, um por
--      publico: TEAM_ADMIN (Administradores do time) e EQUIPE (membros da
--      equipe). Cada endereco aceita somente os telefones do seu publico.
--   2. O link que ja existia continua sendo o dos Administradores do time,
--      com o MESMO token: ninguem precisa redistribuir o endereco atual.
--   3. Cada time ganha um endereco novo, exclusivo da equipe.
--
-- Renovar um dos dois nao mexe no outro, nem no banco nem na aplicacao: sao
-- linhas independentes, com contagem de tentativas e bloqueio proprios.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Publico do link
--
-- O padrao TEAM_ADMIN preserva o significado das linhas ja gravadas: o link
-- distribuido ate agora era o dos Administradores do time.
-- ---------------------------------------------------------------------------
alter table public.cmd_team_access_links
  add column if not exists audience text not null default 'TEAM_ADMIN';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_team_access_links_audience_check'
  ) then
    alter table public.cmd_team_access_links
      add constraint cmd_team_access_links_audience_check
      check (audience in ('TEAM_ADMIN', 'EQUIPE'));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Um endereco por time E por publico
--
-- A unicidade antiga era so por time e impediria o segundo endereco. O
-- token continua unico no sistema inteiro pelo hash, entao dois times nunca
-- compartilham endereco.
-- ---------------------------------------------------------------------------
alter table public.cmd_team_access_links
  drop constraint if exists cmd_team_access_links_client_uniq;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_team_access_links_client_audience_uniq'
  ) then
    alter table public.cmd_team_access_links
      add constraint cmd_team_access_links_client_audience_uniq
      unique (client_id, audience);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Endereco da equipe para os times que ja existem
--
-- Token aleatorio de 256 bits, montado com gen_random_uuid() e guardado
-- tambem como SHA-256. O endereco dos Administradores nao e tocado: quem ja
-- o distribuiu nao precisa avisar ninguem.
-- ---------------------------------------------------------------------------
insert into public.cmd_team_access_links (client_id, token, token_hash, audience)
select c.id,
       t.token,
       encode(public.cmd_sha256(t.token), 'hex'),
       'EQUIPE'
  from public.cmd_clients c
  cross join lateral (
    select replace(
             gen_random_uuid()::text || gen_random_uuid()::text, '-', ''
           ) as token
  ) t
 where not exists (
   select 1
     from public.cmd_team_access_links l
    where l.client_id = c.id
      and l.audience = 'EQUIPE'
 );

-- ---------------------------------------------------------------------------
-- 4. RLS e privilegios: nada afrouxa
-- ---------------------------------------------------------------------------
alter table public.cmd_team_access_links enable row level security;
alter table public.cmd_team_access_links force row level security;

do $$
declare
  papel text;
begin
  foreach papel in array array['public', 'anon', 'authenticated']
  loop
    if papel = 'public' then
      execute 'revoke all on table public.cmd_team_access_links from public';
    elsif exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on table public.cmd_team_access_links from %I', papel);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.cmd_team_access_links '
         || 'to service_role';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Comentarios
-- ---------------------------------------------------------------------------
comment on column public.cmd_team_access_links.audience is
  'Publico do endereco: TEAM_ADMIN (Administradores do time) ou EQUIPE (membros). Cada endereco aceita somente os telefones do proprio publico, e renovar um nao mexe no outro.';
comment on table public.cmd_team_access_links is
  'Enderecos de acesso do time: um por publico (Administradores e equipe). Nao expiram sozinhos, nao sao consumidos e valem para todas as pessoas ativas daquele publico. Separados de cmd_invites (recrutamento).';

commit;
