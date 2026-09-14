-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 029: API de links de cadastro (chaves de acesso e revogacao)
--
-- Execute no SQL Editor do Supabase depois de 028_public_link_origin.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente (pode ser executada duas vezes seguidas sem efeito
-- adicional) e nao apaga dado nenhum: nao ha DROP TABLE, DROP COLUMN, DELETE
-- nem TRUNCATE. Nenhuma API externa e consultada.
--
-- O QUE ESTA MIGRATION HABILITA
--
-- O link de cadastro — o endereco que o Administrador do time envia para as
-- pessoas se cadastrarem — passa a poder ser gerado tambem por PROGRAMA, e
-- nao so por clique no painel. E a mesma operacao de sempre: mesmo convite
-- unico por usuario (migration 012), mesmo prazo configurado pelo ADMIN
-- (013), mesmo historico imutavel (013/020/021). NAO existe um segundo
-- sistema de links, nem um segundo formato de token.
--
-- O que muda e apenas QUEM PODE PEDIR: alem da sessao do painel, uma chave
-- de API. E ela pertence exclusivamente ao ADMIN GERAL.
--
--   1. public.cmd_api_keys       - chaves da API. Somente o SHA-256 do
--                                  segredo e guardado.
--   2. cmd_api_key_auth()        - autentica a chave e contabiliza o uso, em
--                                  uma unica transacao.
--   3. cmd_invite_revoke()       - derruba um link ja enviado, na hora, sem
--                                  precisar gerar outro no lugar.
--
-- POR QUE A CHAVE PERTENCE A UMA PESSOA
--
-- `created_by` nao e enfeite de auditoria: e a IDENTIDADE com que a chave
-- age. A autenticacao so devolve a chave enquanto esse usuario continuar
-- existindo, ATIVO e com perfil ADMIN. Desativar o ADMIN no painel derruba,
-- no mesmo instante, todas as chaves criadas por ele — sem precisar lembrar
-- de revogar uma por uma.
--
-- O QUE NUNCA E GUARDADO AQUI: o segredo da chave em texto puro (so o
-- SHA-256), senha, token de convite em claro no historico, URL do convite,
-- segredo da reserva, CPF, titulo de eleitor, retorno de consulta cadastral
-- ou IP em texto puro.
--
-- Todo instante e timestamptz calculado com now() (UTC) pelo banco. O
-- relogio do navegador — ou do programa que chama a API — nunca autoriza nem
-- cronometra nada.
--
-- Continua sem Supabase Authentication: nenhuma referencia a auth.users,
-- auth.uid() ou policy baseada em sessao do Supabase. RLS fica habilitado e
-- forcado, sem policy nenhuma, e o acesso acontece somente pelo servidor do
-- Next.js com a chave secreta (service_role).
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. public.cmd_api_keys: as chaves da API
--
-- O segredo tem o formato `cmd_` + 32 bytes aleatorios em base64url, gerado
-- no servidor do Next.js. Ele aparece UMA unica vez, na resposta da criacao,
-- e depois disso nao existe mais em lugar nenhum: o banco guarda apenas o
-- SHA-256 (`token_hash`) e o inicio legivel (`prefix`).
--
-- O `prefix` existe para a tela poder dizer QUAL chave e cada linha sem
-- guardar o segredo. Ele sozinho nao autentica nada: a autenticacao e sempre
-- pelo hash do segredo inteiro.
--
-- `last_used_at` e `request_count` sao o uso da chave, e nao um registro de
-- requisicoes: nenhum caminho chamado, corpo, parametro, IP ou agente de
-- usuario e gravado. Os LINKS gerados pela API continuam sendo auditados
-- onde sempre foram — no rastreamento de `cmd_invite_events` —, com o ADMIN
-- dono da chave registrado como quem gerou.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_api_keys (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  prefix          text not null,
  token_hash      text not null,

  -- Identidade com que a chave age. Anulavel para o registro sobreviver a
  -- exclusao do usuario; sem usuario, a chave para de autenticar.
  created_by      uuid references public.cmd_users (id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now(),

  last_used_at    timestamptz,
  request_count   bigint not null default 0,

  revoked_at      timestamptz,
  revoked_by      uuid references public.cmd_users (id) on delete set null,
  revoked_by_name text,

  constraint cmd_api_keys_name_check
    check (char_length(btrim(name)) between 1 and 60),
  -- `cmd_` + 8 caracteres do proprio segredo. Nunca o segredo inteiro.
  constraint cmd_api_keys_prefix_check
    check (prefix ~ '^cmd_[A-Za-z0-9_-]{8}$'),
  constraint cmd_api_keys_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint cmd_api_keys_count_check
    check (request_count >= 0),
  constraint cmd_api_keys_revogacao_check
    check ((revoked_at is null) or (revoked_at >= created_at))
);

-- Dois segredos nunca colidem, e a colisao seria recusada pelo banco.
create unique index if not exists cmd_api_keys_token_key
  on public.cmd_api_keys (token_hash);

-- Lista da tela: ativas primeiro, mais novas no topo.
create index if not exists cmd_api_keys_listagem_idx
  on public.cmd_api_keys (revoked_at, created_at desc);

create index if not exists cmd_api_keys_dono_idx
  on public.cmd_api_keys (created_by);

comment on table public.cmd_api_keys is
  'Chaves da API de links de cadastro. Exclusivas do ADMIN geral; guarda apenas o SHA-256 do segredo.';
comment on column public.cmd_api_keys.prefix is
  'Inicio legivel do segredo, para identificar a chave na tela. Nao autentica nada sozinho.';
comment on column public.cmd_api_keys.created_by is
  'ADMIN dono da chave. E a identidade com que ela age: inativo ou removido, a chave para de valer.';

-- ---------------------------------------------------------------------------
-- 2. cmd_api_key_auth: autentica e contabiliza o uso
--
-- Recebe SOMENTE o SHA-256 do segredo — o segredo em si nunca chega ao
-- banco, nem em parametro, nem em log.
--
-- Devolve linha nenhuma quando a chave nao existe, foi revogada, perdeu o
-- dono, ou o dono deixou de ser um ADMIN ativo. Nesses casos NADA e
-- atualizado: uma chave revogada nao movimenta contador nem data de uso.
--
-- A contabilizacao acontece na MESMA transacao da autenticacao, para o uso
-- nao depender de uma segunda chamada que pode falhar no meio.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_api_key_auth(p_token_hash text)
returns table (key_id uuid, key_name text, user_id uuid, user_name text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_chave record;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  select k.id, k.created_by, k.name, u.name as user_name
    into v_chave
    from public.cmd_api_keys k
    join public.cmd_users u on u.id = k.created_by
   where k.token_hash = p_token_hash
     and k.revoked_at is null
     and u.is_active
     and u.role::text = 'ADMIN'
   for update of k;

  if v_chave.id is null then
    return;
  end if;

  update public.cmd_api_keys
     set last_used_at = now(),
         request_count = request_count + 1
   where id = v_chave.id;

  return query select v_chave.id, v_chave.name, v_chave.created_by, v_chave.user_name;
end
$$;

comment on function public.cmd_api_key_auth(text) is
  'Autentica a chave da API pelo SHA-256 do segredo e contabiliza o uso. Chave revogada ou dono sem ADMIN ativo nao devolve nada.';

-- ---------------------------------------------------------------------------
-- 3. cmd_invite_revoke: derrubar um link ja enviado
--
-- Ate aqui, um link so deixava de valer de tres formas: vencia o prazo, era
-- usado, ou era substituido pela geracao seguinte. Faltava a quarta, que e
-- justamente a urgente — o link foi enviado para a pessoa errada e precisa
-- parar de funcionar AGORA, sem que um endereco novo tome o seu lugar.
--
-- O que acontece: a geracao corrente vira REVOKED, `active` desliga e o
-- evento REVOKED entra no historico imutavel com quem revogou. O registro da
-- geracao (`cmd_invite_generations`) nao e tocado: ele e imutavel, e e ele
-- que continua reconhecendo o endereco antigo para responder "este link nao
-- esta mais disponivel" a quem clicar.
--
-- Repetir a chamada nao duplica evento nem muda o instante da revogacao: a
-- segunda vez devolve exatamente o que a primeira gravou.
--
-- Link ja consumido NAO e revogado: o cadastro existe, e apagar o estado
-- final falsificaria o historico. Nesse caso a funcao recusa, e a recusa
-- chega a tela como mensagem propria.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_revoke(
  p_invite_id  uuid,
  p_revoked_by uuid
)
returns table (invite_id uuid, generation integer, revoked_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invite  record;
  v_gerador record;
  v_agora   timestamptz := now();
begin
  select i.id, i.client_id, i.user_id, i.generation, i.status, i.revoked_at,
         i.owner_name, i.owner_role
    into v_invite
    from public.cmd_invites i
   where i.id = p_invite_id
   for update;

  if v_invite.id is null then
    raise exception 'link nao encontrado';
  end if;

  if v_invite.status = 'CONSUMED' then
    raise exception 'link ja concluido';
  end if;

  -- Ja revogado, ou vencido: nada a fazer. Devolve o estado que ja existe.
  if v_invite.status in ('REVOKED', 'EXPIRED') then
    return query select v_invite.id, v_invite.generation,
                        coalesce(v_invite.revoked_at, v_agora);
    return;
  end if;

  select u.id, u.name, u.role::text as role
    into v_gerador
    from public.cmd_users u
   where u.id = p_revoked_by;

  update public.cmd_invites
     set status = 'REVOKED',
         active = false,
         revoked_at = v_agora
   where id = v_invite.id;

  insert into public.cmd_invite_events
    (invite_id, client_id, user_id, owner_name, owner_role, generation, event,
     generated_by_user_id, generated_by_name, generated_by_role)
  select v_invite.id, v_invite.client_id, v_invite.user_id,
         v_invite.owner_name, v_invite.owner_role, v_invite.generation, 'REVOKED',
         v_gerador.id, v_gerador.name, v_gerador.role
   where not exists (
     select 1
       from public.cmd_invite_events e
      where e.invite_id = v_invite.id
        and e.generation = v_invite.generation
        and e.event = 'REVOKED'
   );

  return query select v_invite.id, v_invite.generation, v_agora;
end
$$;

comment on function public.cmd_invite_revoke(uuid, uuid) is
  'Revoga a geracao corrente do link de cadastro, registrando quem revogou. Link ja consumido e recusado.';

-- ---------------------------------------------------------------------------
-- 4. RLS habilitado, forcado e SEM nenhuma policy
--
-- Igual ao resto do sistema: ninguem le nem escreve com as chaves publicas.
-- O acesso acontece somente pelo servidor do Next.js, com a chave secreta.
-- ---------------------------------------------------------------------------
alter table public.cmd_api_keys enable row level security;
alter table public.cmd_api_keys force  row level security;

do $$
declare
  tabelas text := 'public.cmd_api_keys';
  funcoes text[] := array[
    'public.cmd_api_key_auth(text)',
    'public.cmd_invite_revoke(uuid, uuid)'
  ];
  assinatura text;
  papel text;
begin
  execute format('revoke all on %s from public', tabelas);

  foreach papel in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on %s from %I', tabelas, papel);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute format('grant select, insert, update, delete on %s to service_role', tabelas);
  end if;

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

commit;
