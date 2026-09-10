-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 001: estrutura inicial
--
-- Como usar: abra o SQL Editor do Supabase, cole este arquivo inteiro e
-- execute. Pode ser executado mais de uma vez com seguranca: tudo aqui e
-- idempotente. O arquivo nao contem DROP, dados secretos nem comandos
-- destrutivos, e roda inteiro dentro de uma transacao: ou tudo e aplicado,
-- ou nada e.
--
-- Este projeto NAO usa Supabase Authentication. Nao ha referencia a
-- auth.users, auth.uid() nem a qualquer politica baseada em sessao do
-- Supabase. Usuarios, senhas e sessoes ficam em cmd_users e cmd_sessions,
-- acessadas apenas pelo servidor do Next.js com a chave secreta.
--
-- O bucket de fotos NAO e criado aqui. Mexer direto em storage.buckets ignora
-- a logica do proprio Storage e pode divergir entre versoes. Use, depois desta
-- migration:
--
--     npm run configurar-storage
--
-- ou crie o bucket pelo painel, conforme supabase/SETUP.md.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Observacoes de ambiente
--
-- gen_random_uuid() faz parte do proprio PostgreSQL desde a versao 13, entao
-- nenhuma extensao precisa ser criada aqui.
--
-- E-mail nao usa citext: a coluna guarda sempre em minusculas (garantido por
-- check) e a unicidade e uma constraint simples. Evita depender do search_path
-- do SQL Editor e mantem `on conflict (email)` valido no seed.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2. Tipos
--
-- A verificacao usa to_regtype com o schema explicito: um tipo de mesmo nome
-- em outro schema nao pode ser confundido com o nosso.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regtype('public.cmd_role') is null then
    create type public.cmd_role as enum ('ADMIN', 'EQUIPE');
  end if;

  if to_regtype('public.cmd_field_type') is null then
    create type public.cmd_field_type as enum (
      'text', 'textarea', 'phone', 'email', 'number',
      'date', 'select', 'multiselect', 'checkbox', 'photo'
    );
  end if;

  if to_regtype('public.cmd_system_field_key') is null then
    create type public.cmd_system_field_key as enum ('photo', 'name', 'phone');
  end if;

  if to_regtype('public.cmd_member_source') is null then
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
--     `role` nao tem default: o papel e sempre informado explicitamente.
create table if not exists public.cmd_users (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 2 and 120),
  email           text not null unique
                    check (length(email) between 6 and 254)
                    check (email = lower(email))
                    check (email ~ '^[^@[:space:]]{1,64}@[^@[:space:]]{1,189}\.[a-z]{2,24}$'),
  password_hash   text not null check (password_hash ~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$'),
  role            public.cmd_role not null,
  is_active       boolean not null default true,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
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
--     As tres colunas da foto andam juntas: ou todas nulas, ou todas
--     preenchidas, com o mesmo teto de 2 MB aplicado no servidor.
create table if not exists public.cmd_clients (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null check (length(btrim(name)) between 2 and 80),
  email                   text not null
                            check (length(email) between 6 and 254)
                            check (email = lower(email))
                            check (email ~ '^[^@[:space:]]{1,64}@[^@[:space:]]{1,189}\.[a-z]{2,24}$'),
  photo_path              text check (photo_path is null
                            or (length(photo_path) between 1 and 512
                                and photo_path !~ '^/' and photo_path !~ '\.\.')),
  photo_mime              text check (photo_mime in ('image/jpeg', 'image/png', 'image/webp')),
  photo_size              integer check (photo_size is null
                            or (photo_size > 0 and photo_size <= 2097152)),
  notes                   text not null default '' check (length(notes) <= 500),
  form_intro_text         text not null default '' check (length(form_intro_text) <= 1000),
  form_success_message    text not null default 'Cadastro enviado com sucesso.'
                            check (length(form_success_message) between 1 and 200),
  privacy_enabled         boolean not null default false,
  privacy_title           text not null default 'Aviso de privacidade'
                            check (length(privacy_title) <= 80),
  privacy_text            text not null default '' check (length(privacy_text) <= 4000),
  privacy_require_consent boolean not null default false,
  privacy_consent_label   text not null default 'Li e concordo com o aviso de privacidade.'
                            check (length(privacy_consent_label) <= 200),
  form_updated_at         timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint cmd_clients_photo_completa check (
    (photo_path is null and photo_mime is null and photo_size is null)
    or (photo_path is not null and photo_mime is not null and photo_size is not null)
  )
);

-- 4.4 Campos do formulario publico de cada cliente.
--     O par (id, client_id) e unico para servir de alvo da chave estrangeira
--     composta usada em cmd_member_responses.
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
  position    integer not null default 0 check (position >= 0 and position <= 999),
  options     jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint cmd_form_fields_id_client_uniq unique (id, client_id)
);

-- 4.5 Integrantes cadastrados.
--
--     Evidencia do consentimento: alem da data, guardamos o texto exatamente
--     como foi aceito, o hash SHA-256 desse texto e a versao do formulario
--     vigente no momento. O texto canonico e montado no servidor a partir de
--     cmd_clients; nada disso vem do navegador.
create table if not exists public.cmd_members (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.cmd_clients (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 2 and 120),
  -- Telefone normalizado: apenas digitos, sem mascara.
  phone      text not null default '' check (phone ~ '^[0-9]{0,15}$'),
  photo_path text check (photo_path is null
               or (length(photo_path) between 1 and 512
                   and photo_path !~ '^/' and photo_path !~ '\.\.')),
  photo_mime text check (photo_mime in ('image/jpeg', 'image/png', 'image/webp')),
  photo_size integer check (photo_size is null
               or (photo_size > 0 and photo_size <= 2097152)),
  consent_at timestamptz,
  consent_privacy_hash     text check (consent_privacy_hash ~ '^[0-9a-f]{64}$'),
  consent_privacy_snapshot text check (length(consent_privacy_snapshot) <= 8000),
  consent_privacy_version  timestamptz,
  source     public.cmd_member_source not null default 'invite',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cmd_members_id_client_uniq unique (id, client_id),
  constraint cmd_members_photo_completa check (
    (photo_path is null and photo_mime is null and photo_size is null)
    or (photo_path is not null and photo_mime is not null and photo_size is not null)
  ),
  -- Consentimento so existe com a evidencia completa, e a evidencia so existe
  -- com consentimento.
  constraint cmd_members_consentimento_completo check (
    (consent_at is null
      and consent_privacy_hash is null
      and consent_privacy_snapshot is null
      and consent_privacy_version is null)
    or (consent_at is not null
      and consent_privacy_hash is not null
      and consent_privacy_snapshot is not null
      and consent_privacy_version is not null)
  )
);

-- 4.6 Respostas dos campos.
--
--     `client_id` e redundante de proposito: com as duas chaves estrangeiras
--     compostas abaixo, o PostgreSQL garante que o integrante e o campo
--     pertencem ao MESMO cliente. Nao ha como gravar uma resposta que ligue
--     integrante de um cliente a campo de outro.
--
--     Sem o campo ou sem o integrante a resposta perde o sentido: por isso a
--     cascata nos dois lados.
create table if not exists public.cmd_member_responses (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  member_id uuid not null,
  field_id  uuid not null,
  value     jsonb,
  constraint cmd_member_responses_member_fk
    foreign key (member_id, client_id)
    references public.cmd_members (id, client_id) on delete cascade,
  constraint cmd_member_responses_field_fk
    foreign key (field_id, client_id)
    references public.cmd_form_fields (id, client_id) on delete cascade,
  constraint cmd_member_responses_member_field_uniq unique (member_id, field_id)
);

-- 4.7 Convites. Guardamos apenas o hash SHA-256 do token do link.
create table if not exists public.cmd_invites (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.cmd_clients (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  constraint cmd_invites_client_uniq unique (client_id)
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
create index if not exists cmd_member_responses_field_client_idx
  on public.cmd_member_responses (field_id, client_id);
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
-- 7. RLS
--
-- Todas as tabelas ficam com RLS habilitado e SEM nenhuma policy: assim
-- ninguem le nem escreve com as chaves publicas. O acesso acontece somente
-- pelo servidor do Next.js, com a chave secreta (service_role, que ignora
-- RLS). Nenhuma policy usa auth.uid().
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

-- ---------------------------------------------------------------------------
-- 8. Privilegios
--
-- Revogamos tudo de PUBLIC, anon e authenticated (inclusive da funcao do
-- gatilho, que por padrao e executavel por PUBLIC) e concedemos ao
-- service_role apenas o necessario.
--
-- Cada bloco confere se o papel existe: assim a migration tambem roda em um
-- PostgreSQL limpo, sem os papeis do Supabase.
-- ---------------------------------------------------------------------------
revoke all on function public.cmd_set_updated_at() from public;

do $$
declare
  tabelas constant text := '
    public.cmd_users,
    public.cmd_sessions,
    public.cmd_clients,
    public.cmd_form_fields,
    public.cmd_members,
    public.cmd_member_responses,
    public.cmd_invites';
  papel text;
begin
  -- Retirada de acesso das chaves publicas.
  foreach papel in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on table %s from %I', tabelas, papel);
      execute format('revoke all on function public.cmd_set_updated_at() from %I', papel);
    end if;
  end loop;

  -- Acesso do servidor: apenas o que a aplicacao usa.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute format(
      'grant select, insert, update, delete on table %s to service_role', tabelas
    );
    execute 'grant usage on schema public to service_role';
    execute 'grant execute on function public.cmd_set_updated_at() to service_role';
  end if;
end
$$;

-- Sequencias do CMD: hoje nao existe nenhuma (todas as chaves sao uuid),
-- mas o bloco mantem a concessao correta caso alguma seja criada depois.
do $$
declare
  sequencia text;
begin
  for sequencia in
    select format('%I.%I', schemaname, sequencename)
      from pg_sequences
     where schemaname = 'public' and sequencename like 'cmd\_%'
  loop
    execute format('revoke all on sequence %s from public', sequencia);

    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on sequence %s from anon', sequencia);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on sequence %s from authenticated', sequencia);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant usage, select on sequence %s to service_role', sequencia);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 9. Comentarios de documentacao
-- ---------------------------------------------------------------------------
comment on table public.cmd_users is 'Usuarios do painel CMD. Autenticacao propria, sem Supabase Auth.';
comment on column public.cmd_users.role is 'Sem default: o papel e sempre informado na insercao.';
comment on column public.cmd_users.password_hash is 'scrypt$<salt-hex>$<hash-hex>. Nunca sai do servidor.';
comment on table public.cmd_sessions is 'Sessoes ativas. Guarda apenas o hash SHA-256 do token do cookie.';
comment on table public.cmd_invites is 'Convites publicos. Guarda apenas o hash SHA-256 do token do link.';
comment on table public.cmd_clients is 'Clientes e configuracao do formulario publico.';
comment on table public.cmd_form_fields is 'Campos do formulario. system_key marca os campos nativos.';
comment on table public.cmd_members is 'Integrantes cadastrados pelo link publico ou pelo painel.';
comment on column public.cmd_members.consent_privacy_snapshot is
  'Texto de privacidade exatamente como foi aceito. Montado no servidor.';
comment on column public.cmd_members.consent_privacy_hash is
  'SHA-256 do snapshot, para conferencia rapida de integridade.';
comment on column public.cmd_members.consent_privacy_version is
  'form_updated_at do cliente no momento do aceite.';
comment on table public.cmd_member_responses is
  'Respostas por campo. As chaves estrangeiras compostas garantem que integrante e campo sao do mesmo cliente.';

commit;
