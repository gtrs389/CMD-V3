-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 011: acesso dos candidatos
--
-- Execute no SQL Editor do Supabase depois de 010. Idempotente, sem DROP de
-- dados e sem comando destrutivo: rodar duas vezes nao duplica usuario nem
-- apaga nada.
--
-- O arquivo tem DUAS partes. A primeira acrescenta o valor 'CANDIDATE' ao
-- enum cmd_role e precisa ser confirmada (commit) antes que o novo valor
-- possa ser usado; a segunda faz o restante. Cole o arquivo inteiro de uma
-- vez: as duas partes estao demarcadas com begin/commit explicitos.
--
-- Continua sem Supabase Authentication: nenhuma referencia a auth.users,
-- auth.uid() ou policy baseada em sessao do Supabase. Usuarios, senhas e
-- sessoes seguem em cmd_users e cmd_sessions, acessadas somente pelo
-- servidor do Next.js com a chave secreta.
--
-- Senha em texto puro nunca chega ao banco: as funcoes abaixo recebem
-- somente o hash scrypt ja calculado pelo servidor.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- PARTE 1: novo perfil no enum
-- ---------------------------------------------------------------------------
begin;

alter type public.cmd_role add value if not exists 'CANDIDATE';

commit;

-- ---------------------------------------------------------------------------
-- PARTE 2: vinculo, estado do acesso e funcoes
-- ---------------------------------------------------------------------------
begin;

-- 1. Vinculo obrigatorio do candidato com um unico registro de cmd_clients.
alter table public.cmd_users
  add column if not exists client_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_users_client_id_fkey'
  ) then
    alter table public.cmd_users
      add constraint cmd_users_client_id_fkey
      foreign key (client_id) references public.cmd_clients (id) on delete cascade;
  end if;
end
$$;

-- Um acesso por candidato. O indice parcial deixa os ADMINs livres (null).
create unique index if not exists cmd_users_client_id_key
  on public.cmd_users (client_id)
  where client_id is not null;

-- 2. Coerencia entre perfil e vinculo: so o candidato tem client_id.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_users_client_role_check'
  ) then
    alter table public.cmd_users
      add constraint cmd_users_client_role_check
      check (
        (role = 'CANDIDATE' and client_id is not null)
        or (role <> 'CANDIDATE' and client_id is null)
      );
  end if;
end
$$;

-- 3. Troca obrigatoria da senha temporaria no primeiro acesso.
alter table public.cmd_users
  add column if not exists must_change_password boolean not null default false;

-- 4. Acesso pendente: usuario existe, mas sem senha utilizavel.
--    A troca do check nao apaga dado nenhum; o formato continua exigido
--    sempre que houver senha.
alter table public.cmd_users
  alter column password_hash drop not null;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'cmd_users_password_hash_check'
  ) then
    alter table public.cmd_users drop constraint cmd_users_password_hash_check;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cmd_users_password_hash_format'
  ) then
    alter table public.cmd_users
      add constraint cmd_users_password_hash_format
      check (
        password_hash is null
        or password_hash ~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$'
      );
  end if;
end
$$;

-- 5. Candidatos que ja existiam ganham o vinculo em "Acesso pendente".
--    Sem senha utilizavel: o ADMIN gera a senha temporaria na tela de
--    Configuracoes. O e-mail ja usado por outro usuario nao e sobrescrito.
insert into public.cmd_users (name, email, role, client_id, is_active, must_change_password)
select c.name,
       c.email,
       'CANDIDATE'::public.cmd_role,
       c.id,
       true,
       true
  from public.cmd_clients c
 where not exists (select 1 from public.cmd_users u where u.client_id = c.id)
   and not exists (select 1 from public.cmd_users u where u.email = c.email)
on conflict (email) do nothing;

-- 6. Senha temporaria: grava o hash, exige a troca e derruba as sessoes.
create or replace function public.cmd_set_temp_password(
  p_user_id       uuid,
  p_password_hash text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_revogadas integer;
begin
  if p_password_hash !~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$' then
    raise exception 'formato de hash invalido';
  end if;

  update public.cmd_users
     set password_hash        = p_password_hash,
         must_change_password = true,
         failed_attempts      = 0,
         locked_until         = null
   where id = p_user_id;

  if not found then
    raise exception 'usuario nao encontrado';
  end if;

  with revogadas as (
    update public.cmd_sessions
       set revoked_at = now()
     where user_id = p_user_id
       and revoked_at is null
    returning 1
  )
  select count(*) into v_revogadas from revogadas;

  return v_revogadas;
end;
$$;

comment on function public.cmd_set_temp_password(uuid, text) is
  'Senha temporaria do acesso: grava o hash, marca a troca obrigatoria e revoga todas as sessoes.';

-- 7. Primeiro acesso concluido: grava a nova senha, libera a navegacao e
--    mantem apenas a sessao que fez a troca.
create or replace function public.cmd_complete_first_access(
  p_user_id         uuid,
  p_password_hash   text,
  p_keep_token_hash text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_revogadas integer;
begin
  if p_password_hash !~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$' then
    raise exception 'formato de hash invalido';
  end if;

  if p_keep_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'sessao invalida';
  end if;

  update public.cmd_users
     set password_hash        = p_password_hash,
         must_change_password = false,
         failed_attempts      = 0,
         locked_until         = null
   where id = p_user_id
     and is_active;

  if not found then
    raise exception 'usuario nao encontrado';
  end if;

  with revogadas as (
    update public.cmd_sessions
       set revoked_at = now()
     where user_id = p_user_id
       and revoked_at is null
       and token_hash <> p_keep_token_hash
    returning 1
  )
  select count(*) into v_revogadas from revogadas;

  return v_revogadas;
end;
$$;

comment on function public.cmd_complete_first_access(uuid, text, text) is
  'Troca da senha temporaria: mantem viva somente a sessao informada.';

-- 8. Revogacao de todas as sessoes de um usuario.
create or replace function public.cmd_revoke_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_revogadas integer;
begin
  with revogadas as (
    update public.cmd_sessions
       set revoked_at = now()
     where user_id = p_user_id
       and revoked_at is null
    returning 1
  )
  select count(*) into v_revogadas from revogadas;

  return v_revogadas;
end;
$$;

comment on function public.cmd_revoke_user_sessions(uuid) is
  'Encerra todas as sessoes ativas do usuario. Somente service_role.';

-- 9. Privilegios: apenas o servidor, pela chave secreta.
do $$
declare
  funcoes constant text[] := array[
    'public.cmd_set_temp_password(uuid, text)',
    'public.cmd_complete_first_access(uuid, text, text)',
    'public.cmd_revoke_user_sessions(uuid)'
  ];
  assinatura text;
  papel text;
begin
  foreach assinatura in array funcoes
  loop
    execute format('revoke all on function %s from public', assinatura);

    foreach papel in array array['anon', 'authenticated']
    loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('revoke all on function %s from %I', assinatura, papel);
      end if;
    end loop;

    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', assinatura);
    end if;
  end loop;
end
$$;

comment on column public.cmd_users.client_id is
  'Candidato vinculado. Obrigatorio no perfil CANDIDATE e sempre nulo nos demais.';
comment on column public.cmd_users.must_change_password is
  'Senha temporaria em uso: nenhuma rota alem do primeiro acesso e liberada.';
comment on column public.cmd_users.password_hash is
  'scrypt$<salt-hex>$<hash-hex>. Nulo significa acesso pendente, sem senha utilizavel.';

commit;
