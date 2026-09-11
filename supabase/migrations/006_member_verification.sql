-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 006: confirmacao final do cadastro e verificacao cadastral
--
-- Execute no SQL Editor do Supabase depois de 005_member_relationship.sql.
-- Nao altera nada das anteriores. Idempotente, sem DROP e dentro de uma
-- transacao: pode ser executada mais de uma vez com seguranca.
--
-- O que fica aqui:
--   1. cmd_member_confirmations - prova de que a pessoa confirmou os dados
--      antes do envio, com a versao e o texto integral do aviso mostrado.
--   2. cmd_member_verifications - resultado da verificacao cadastral feita
--      pelo servidor (FonteData), sempre CIFRADO com AES-256-GCM antes de
--      chegar aqui. O banco nunca ve o conteudo em claro.
--   3. cmd_member_verification_views - auditoria de quem abriu o resultado.
--      Registra quem e quando, nunca o que foi visto.
--
-- Nenhuma tabela recebe policy: o acesso e exclusivo do servidor, com a chave
-- secreta, como nas migrations anteriores.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Tipos
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regtype('public.cmd_verification_status') is null then
    create type public.cmd_verification_status as enum (
      'PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED'
    );
  end if;

  if to_regtype('public.cmd_verification_step_status') is null then
    create type public.cmd_verification_step_status as enum (
      'PENDING', 'SUCCESS', 'FAILED', 'SKIPPED_MISSING_DATA'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Confirmacao final do cadastro
--
-- O texto e a versao sao os que estavam na tela no momento da confirmacao.
-- O hash permite conferir o texto sem depender da coluna longa.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_member_confirmations (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  member_id uuid not null,

  notice_version text not null check (length(notice_version) between 1 and 64),
  notice_text    text not null check (length(notice_text) between 1 and 4000),
  notice_hash    text not null check (notice_hash ~ '^[0-9a-f]{64}$'),

  confirmed_at timestamptz not null default now(),

  constraint cmd_member_confirmations_member_fk
    foreign key (member_id, client_id)
    references public.cmd_members (id, client_id) on delete cascade,
  constraint cmd_member_confirmations_member_uniq unique (member_id)
);

create index if not exists cmd_member_confirmations_client_idx
  on public.cmd_member_confirmations (client_id, confirmed_at desc);

-- ---------------------------------------------------------------------------
-- 3. Verificacao cadastral
--
-- Uma linha por integrante (unique em member_id): a idempotencia comeca aqui.
-- `locked_at` e `lock_token` garantem que apenas uma execucao consulta por vez;
-- cada consulta e cobrada, entao nada aqui repete sozinho.
--
-- As respostas ficam em `cpf_payload` e `tse_payload`, sempre como texto
-- cifrado (AES-256-GCM, chave MEMBER_VERIFICATION_ENCRYPTION_KEY, que existe
-- so no servidor). O banco nao tem como ler o conteudo.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_member_verifications (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  member_id uuid not null,

  status public.cmd_verification_status not null default 'PENDING',

  cpf_status public.cmd_verification_step_status not null default 'PENDING',
  tse_status public.cmd_verification_step_status not null default 'PENDING',

  cpf_requested_at timestamptz,
  cpf_completed_at timestamptz,
  tse_requested_at timestamptz,
  tse_completed_at timestamptz,

  cpf_attempts integer not null default 0 check (cpf_attempts between 0 and 50),
  tse_attempts integer not null default 0 check (tse_attempts between 0 and 50),

  -- Codigo curto e seguro (ex.: INVALID_KEY, TIMEOUT). Nunca o corpo do erro.
  cpf_error_code text check (cpf_error_code ~ '^[A-Z_]{1,40}$'),
  tse_error_code text check (tse_error_code ~ '^[A-Z_]{1,40}$'),

  -- Conteudo cifrado em base64. Nunca texto em claro.
  cpf_payload text check (length(cpf_payload) <= 20000),
  tse_payload text check (length(tse_payload) <= 20000),

  locked_at  timestamptz,
  lock_token text check (lock_token ~ '^[0-9a-f]{32}$'),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cmd_member_verifications_member_fk
    foreign key (member_id, client_id)
    references public.cmd_members (id, client_id) on delete cascade,
  constraint cmd_member_verifications_member_uniq unique (member_id)
);

create index if not exists cmd_member_verifications_client_idx
  on public.cmd_member_verifications (client_id, updated_at desc);
create index if not exists cmd_member_verifications_status_idx
  on public.cmd_member_verifications (status);

-- Mesmo gatilho de updated_at usado pelas demais tabelas (criado na 001).
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'cmd_member_verifications_updated_at'
  ) then
    create trigger cmd_member_verifications_updated_at
      before update on public.cmd_member_verifications
      for each row execute function public.cmd_set_updated_at();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Auditoria de leitura
--
-- Registra que um ADMIN abriu o resultado. Nao guarda nada do conteudo.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_member_verification_views (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  member_id uuid not null,
  user_id   uuid not null references public.cmd_users (id) on delete cascade,
  viewed_at timestamptz not null default now(),

  constraint cmd_member_verification_views_member_fk
    foreign key (member_id, client_id)
    references public.cmd_members (id, client_id) on delete cascade
);

create index if not exists cmd_member_verification_views_member_idx
  on public.cmd_member_verification_views (member_id, viewed_at desc);
create index if not exists cmd_member_verification_views_user_idx
  on public.cmd_member_verification_views (user_id, viewed_at desc);

-- ---------------------------------------------------------------------------
-- 5. RLS e privilegios, no mesmo padrao das migrations anteriores
-- ---------------------------------------------------------------------------
alter table public.cmd_member_confirmations      enable row level security;
alter table public.cmd_member_verifications      enable row level security;
alter table public.cmd_member_verification_views enable row level security;

alter table public.cmd_member_confirmations      force row level security;
alter table public.cmd_member_verifications      force row level security;
alter table public.cmd_member_verification_views force row level security;

do $$
declare
  papel  text;
  tabela text;
  tabelas constant text[] := array[
    'cmd_member_confirmations',
    'cmd_member_verifications',
    'cmd_member_verification_views'
  ];
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
comment on table public.cmd_member_confirmations is
  'Prova da confirmacao final feita pela pessoa, com a versao e o texto do aviso.';
comment on table public.cmd_member_verifications is
  'Verificacao cadastral do integrante. Respostas sempre cifradas (AES-256-GCM).';
comment on column public.cmd_member_verifications.cpf_payload is
  'Resposta da consulta de CPF cifrada no servidor. Nunca texto em claro.';
comment on column public.cmd_member_verifications.tse_payload is
  'Resposta da consulta eleitoral cifrada no servidor. Nunca texto em claro.';
comment on column public.cmd_member_verifications.lock_token is
  'Bloqueio atomico: impede consultas simultaneas, que seriam cobradas duas vezes.';
comment on table public.cmd_member_verification_views is
  'Auditoria: quem abriu o resultado e quando. O conteudo visto nao e registrado.';

commit;
