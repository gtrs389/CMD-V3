-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 001: estrutura inicial
--
-- Como usar: abra o SQL Editor do Supabase, cole este arquivo inteiro e
-- execute. Pode ser executado mais de uma vez com seguranca: tudo aqui e
-- idempotente. O arquivo nao contem DROP, dados secretos nem comandos
-- destrutivos.
--
-- Este projeto NAO usa Supabase Authentication. Nao ha referencia a
-- auth.users, auth.uid() nem a qualquer politica baseada em sessao do
-- Supabase. Usuarios, senhas e sessoes ficam em cmd_users e cmd_sessions,
-- acessadas apenas pelo servidor do Next.js com a chave secreta.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Extensoes
-- ---------------------------------------------------------------------------
-- gen_random_uuid() ja faz parte do Postgres 15 usado pelo Supabase.
-- pgcrypto fica disponivel para funcoes auxiliares de hash, se necessario.
create extension if not exists "pgcrypto" with schema extensions;

-- E-mail nao usa citext: a coluna guarda sempre em minusculas (garantido por
-- check) e a unicidade e uma constraint simples. Evita depender do search_path
-- do SQL Editor e mantem `on conflict (email)` valido no seed.

-- ---------------------------------------------------------------------------
-- 2. Tipos
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'cmd_role') then
    create type public.cmd_role as enum ('ADMIN', 'EQUIPE');
  end if;

  if not exists (select 1 from pg_type where typname = 'cmd_field_type') then
    create type public.cmd_field_type as enum (
      'text', 'textarea', 'phone', 'email', 'number',
      'date', 'select', 'multiselect', 'checkbox', 'photo'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'cmd_system_field_key') then
    create type public.cmd_system_field_key as enum ('photo', 'name', 'phone');
  end if;

  if not exists (select 1 from pg_type where typname = 'cmd_member_source') then
    create type public.cmd_member_source as enum ('invite', 'admin');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Gatilho de updated_at
-- ---------------------------------------------------------------------------
create or replace function public.cmd_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Tabelas
-- ---------------------------------------------------------------------------

-- 4.1 Usuarios do painel. Senha guardada como scrypt$salt$hash.
create table if not exists public.cmd_users (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(btrim(name)) between 2 and 120),
  email          text not null unique check (email = lower(email)
                   and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  password_hash  text not null check (password_hash like 'scrypt$%'),
  role           public.cmd_role not null default 'ADMIN',
  is_active      boolean not null default true,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until   timestamptz,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 4.2 Sessoes. Guardamos apenas o hash SHA-256 do token do cookie.
create table if not exists public.cmd_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.cmd_users (id) on delete cascade,
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- 4.3 Clientes. A foto fica no bucket privado; aqui so o caminho e metadados.
create table if not exists public.cmd_clients (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null check (length(btrim(name)) between 2 and 80),
  email                   text not null check (email = lower(email)),
  photo_path              text,
  photo_mime              text check (photo_mime in ('image/jpeg', 'image/png', 'image/webp')),
  photo_size              integer check (photo_size is null or photo_size > 0),
  notes                   text not null default '' check (length(notes) <= 500),
  form_intro_text         text not null default '' check (length(form_intro_text) <= 1000),
  form_success_message    text not null default 'Cadastro enviado com sucesso.',
  privacy_enabled         boolean not null default false,
  privacy_title           text not null default 'Aviso de privacidade',
  privacy_text            text not null default '' check (length(privacy_text) <= 4000),
  privacy_require_consent boolean not null default false,
  privacy_consent_label   text not null default 'Li e concordo com o aviso de privacidade.',
  form_updated_at         timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- 4.4 Campos do formulario publico de cada cliente.
create table if not exists public.cmd_form_fields (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.cmd_clients (id) on delete cascade,
  system_key  public.cmd_system_field_key,
  type        public.cmd_field_type not null,
  label       text not null default '' check (length(label) <= 80),
  placeholder text not null default '' check (length(placeholder) <= 80),
  help_text   text not null default '' check (length(help_text) <= 160),
  required    boolean not null default false,
  enabled     boolean not null default true,
  position    integer not null default 0 check (position >= 0),
  options     jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 4.5 Integrantes cadastrados.
create table if not exists public.cmd_members (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.cmd_clients (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 2 and 120),
  -- Telefone normalizado: apenas digitos, sem mascara.
  phone      text not null default '' check (phone ~ '^[0-9]{0,15}$'),
  photo_path text,
  photo_mime text check (photo_mime in ('image/jpeg', 'image/png', 'image/webp')),
  photo_size integer check (photo_size is null or photo_size > 0),
  consent_at timestamptz,
  source     public.cmd_member_source not null default 'invite',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4.6 Respostas dos campos. Sem o campo ou sem o integrante a resposta
--     perde o sentido: por isso a cascata nos dois lados.
create table if not exists public.cmd_member_responses (
  id        uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.cmd_members (id) on delete cascade,
  field_id  uuid not null references public.cmd_form_fields (id) on delete cascade,
  value     jsonb,
  unique (member_id, field_id)
);

-- 4.7 Convites. Guardamos apenas o hash SHA-256 do token do link.
create table if not exists public.cmd_invites (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.cmd_clients (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  unique (client_id)
);

-- ---------------------------------------------------------------------------
-- 5. Indices
-- ---------------------------------------------------------------------------
create index if not exists cmd_sessions_user_id_idx on public.cmd_sessions (user_id);
create index if not exists cmd_sessions_expires_at_idx on public.cmd_sessions (expires_at);
create index if not exists cmd_clients_created_at_idx on public.cmd_clients (created_at desc);
create index if not exists cmd_form_fields_client_position_idx
  on public.cmd_form_fields (client_id, position);
create unique index if not exists cmd_form_fields_system_key_uniq
  on public.cmd_form_fields (client_id, system_key)
  where system_key is not null;
create index if not exists cmd_members_client_created_idx
  on public.cmd_members (client_id, created_at desc);
create index if not exists cmd_member_responses_member_idx
  on public.cmd_member_responses (member_id);
create index if not exists cmd_member_responses_field_idx
  on public.cmd_member_responses (field_id);
create index if not exists cmd_invites_client_idx on public.cmd_invites (client_id);

-- ---------------------------------------------------------------------------
-- 6. Gatilhos de updated_at
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
begin
  foreach target in array array[
    'cmd_users', 'cmd_clients', 'cmd_form_fields', 'cmd_members'
  ]
  loop
    if not exists (
      select 1 from pg_trigger
      where tgname = format('%s_set_updated_at', target)
        and tgrelid = format('public.%I', target)::regclass
    ) then
      execute format(
        'create trigger %I before update on public.%I
           for each row execute function public.cmd_set_updated_at()',
        format('%s_set_updated_at', target), target
      );
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS e revogacao de acesso
--
-- Todas as tabelas ficam com RLS habilitado e SEM nenhuma policy: assim
-- ninguem le nem escreve com as chaves publicas. O acesso acontece somente
-- pelo servidor do Next.js, com a chave secreta (que ignora RLS por ser
-- service role). Nenhuma policy usa auth.uid().
-- ---------------------------------------------------------------------------
alter table public.cmd_users            enable row level security;
alter table public.cmd_sessions         enable row level security;
alter table public.cmd_clients          enable row level security;
alter table public.cmd_form_fields      enable row level security;
alter table public.cmd_members          enable row level security;
alter table public.cmd_member_responses enable row level security;
alter table public.cmd_invites          enable row level security;

alter table public.cmd_users            force row level security;
alter table public.cmd_sessions         force row level security;
alter table public.cmd_clients          force row level security;
alter table public.cmd_form_fields      force row level security;
alter table public.cmd_members          force row level security;
alter table public.cmd_member_responses force row level security;
alter table public.cmd_invites          force row level security;

revoke all on table
  public.cmd_users,
  public.cmd_sessions,
  public.cmd_clients,
  public.cmd_form_fields,
  public.cmd_members,
  public.cmd_member_responses,
  public.cmd_invites
from anon, authenticated;

revoke all on function public.cmd_set_updated_at() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Bucket privado das fotos
--
-- Somente o servidor toca no bucket, sempre com a chave secreta. Nenhuma
-- policy de storage e criada: sem policy, anon e authenticated nao acessam.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('cmd-media', 'cmd-media', false)
on conflict (id) do nothing;

-- Garante que o bucket permaneca privado mesmo se ja existisse.
update storage.buckets set public = false where id = 'cmd-media';

-- Limite de tamanho e tipos aceitos, quando as colunas existirem nesta versao.
do $$
begin
  begin
    update storage.buckets
       set file_size_limit = 2097152,
           allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
     where id = 'cmd-media';
  exception
    when undefined_column then
      raise notice 'storage.buckets sem file_size_limit/allowed_mime_types: limites ficam a cargo da aplicacao.';
  end;
end
$$;

-- ---------------------------------------------------------------------------
-- 9. Comentarios de documentacao
-- ---------------------------------------------------------------------------
comment on table public.cmd_users is 'Usuarios do painel CMD. Autenticacao propria, sem Supabase Auth.';
comment on column public.cmd_users.password_hash is 'scrypt$<salt-hex>$<hash-hex>. Nunca sai do servidor.';
comment on table public.cmd_sessions is 'Sessoes ativas. Guarda apenas o hash SHA-256 do token do cookie.';
comment on table public.cmd_invites is 'Convites publicos. Guarda apenas o hash SHA-256 do token do link.';
comment on table public.cmd_clients is 'Clientes e configuracao do formulario publico.';
comment on table public.cmd_form_fields is 'Campos do formulario. system_key marca os campos nativos.';
comment on table public.cmd_members is 'Integrantes cadastrados pelo link publico ou pelo painel.';
comment on table public.cmd_member_responses is 'Respostas por campo, referenciadas pelo id estavel do campo.';
