-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 057: candidatos favoritos na votacao do mapa
--
-- Execute no SQL Editor do Supabase depois de 056_votacao_ao_vivo_rapida.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum.
--
-- Cada pessoa marca os candidatos que acompanha; eles aparecem primeiro no
-- seletor da votacao, em qualquer aparelho. A chave e cargo + numero (e nao
-- a linha da votacao): o favorito do 1o turno continua favorito no 2o.
-- ===========================================================================

begin;

create table if not exists public.cmd_election_favorites (
  -- Quem marcou: o usuario da sessao. Sem chave estrangeira, de proposito:
  -- o favorito e preferencia de tela, e nao pode impedir excluir alguem.
  user_id text not null check (length(user_id) between 1 and 100),
  year integer not null check (year between 2000 and 2100),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  office_code integer not null check (office_code > 0),
  number text not null check (number ~ '^[0-9]{1,6}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, year, uf, office_code, number)
);

alter table public.cmd_election_favorites enable row level security;
alter table public.cmd_election_favorites force row level security;

do $$
declare
  papel text;
begin
  foreach papel in array array['public', 'anon', 'authenticated']
  loop
    if papel = 'public' then
      execute 'revoke all on table public.cmd_election_favorites from public';
    elsif exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on table public.cmd_election_favorites from %I', papel);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.cmd_election_favorites to service_role';
  end if;
end
$$;

comment on table public.cmd_election_favorites is
  'Candidatos favoritos de cada usuario na votacao do mapa (migration 057).';

commit;
