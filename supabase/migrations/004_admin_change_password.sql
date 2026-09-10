-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 004: troca de senha do proprio usuario
--
-- Execute no SQL Editor do Supabase depois de 001, 002 e 003.
-- Nao altera as migrations anteriores. Idempotente, sem DROP de dados e
-- dentro de uma transacao.
--
-- Cria uma funcao que grava o novo hash e revoga TODAS as sessoes do usuario
-- em uma unica transacao. Sem isso, um cookie roubado continuaria valendo
-- depois da troca de senha.
--
-- Nada aqui usa Supabase Authentication. A funcao recebe o hash ja calculado
-- pelo servidor do Next.js: senha em texto puro nunca chega ao banco.
-- ===========================================================================

begin;

create or replace function public.cmd_change_password(
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
  -- O formato do hash e conferido tambem aqui, nao so na aplicacao.
  if p_password_hash !~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$' then
    raise exception 'formato de hash invalido';
  end if;

  update public.cmd_users
     set password_hash   = p_password_hash,
         failed_attempts = 0,
         locked_until    = null
   where id = p_user_id
     and is_active;

  if not found then
    raise exception 'usuario nao encontrado';
  end if;

  -- Inclui a sessao que fez a troca: todos os aparelhos entram de novo.
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

comment on function public.cmd_change_password(uuid, text) is
  'Grava o novo hash e revoga todas as sessoes do usuario na mesma transacao. Somente service_role.';

-- ---------------------------------------------------------------------------
-- Privilegios: apenas o servidor, pela chave secreta, pode executar.
-- ---------------------------------------------------------------------------
revoke all on function public.cmd_change_password(uuid, text) from public;

do $$
declare
  papel text;
begin
  foreach papel in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format(
        'revoke all on function public.cmd_change_password(uuid, text) from %I', papel
      );
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.cmd_change_password(uuid, text) to service_role';
  end if;
end
$$;

commit;
