-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 015: Pessoas do time
--
-- Execute no SQL Editor do Supabase depois de 014_electoral_zone_section.sql.
-- Nao altera as anteriores. Idempotente, sem DROP de dados e dentro de uma
-- transacao: pode ser executada mais de uma vez com seguranca.
--
-- Registro interno, vinculado ao time (cmd_clients), para o ADMIN cadastrar
-- as pessoas que fazem parte da equipe do time. Nao tem nenhuma relacao com
-- cmd_members (integrantes recrutados pelo link publico) nem com cmd_users
-- (acesso ao sistema): nao entra na hierarquia de recrutamento, nao gera
-- usuario, senha ou acesso, e nao altera o responsavel por nenhum cadastro.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Tabela
--
-- Mesmo padrao de foto de cmd_members: caminho, mime e tamanho no bucket
-- privado cmd-media, sempre os tres juntos ou os tres ausentes. `position`
-- preserva a ordem em que as pessoas foram cadastradas.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_team_people (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.cmd_clients (id) on delete cascade,

  name  text not null check (length(btrim(name)) between 2 and 120),
  -- Telefone normalizado: apenas digitos, sem mascara. Fixo (10) ou celular (11).
  phone text not null check (phone ~ '^[0-9]{10,11}$'),

  photo_path text check (photo_path is null
               or (length(photo_path) between 1 and 512
                   and photo_path !~ '^/' and photo_path !~ '\.\.')),
  photo_mime text check (photo_mime in ('image/jpeg', 'image/png', 'image/webp')),
  photo_size integer check (photo_size is null
               or (photo_size > 0 and photo_size <= 2097152)),

  position integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cmd_team_people_photo_completa check (
    (photo_path is null and photo_mime is null and photo_size is null)
    or (photo_path is not null and photo_mime is not null and photo_size is not null)
  )
);

create index if not exists cmd_team_people_client_position_idx
  on public.cmd_team_people (client_id, position);

-- Mesmo gatilho de updated_at usado pelas demais tabelas (criado na 001).
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'cmd_team_people_updated_at'
  ) then
    create trigger cmd_team_people_updated_at
      before update on public.cmd_team_people
      for each row execute function public.cmd_set_updated_at();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. RLS e privilegios, no mesmo padrao das migrations anteriores
--
-- RLS habilitado e forcado, sem nenhuma policy: ninguem alcanca esta tabela
-- por PostgREST direto (anon/authenticated) nem por qualquer papel padrao
-- (public). Todo acesso passa pelo servidor da aplicacao, com service_role.
-- ---------------------------------------------------------------------------
alter table public.cmd_team_people enable row level security;
alter table public.cmd_team_people force row level security;

do $$
declare
  papel text;
begin
  foreach papel in array array['public', 'anon', 'authenticated']
  loop
    if papel = 'public' then
      execute 'revoke all on table public.cmd_team_people from public';
    elsif exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on table public.cmd_team_people from %I', papel);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.cmd_team_people to service_role';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Comentarios
-- ---------------------------------------------------------------------------
comment on table public.cmd_team_people is
  'Pessoas do time: registro interno do ADMIN, sem relacao com cmd_members ou cmd_users. Nao recebe acesso ao sistema nem entra na hierarquia de recrutamento.';
comment on column public.cmd_team_people.position is
  'Preserva a ordem de cadastro das pessoas dentro do time.';

commit;
