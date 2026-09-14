-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 031: cada chave da API pertence a UM administrador de UM time
--
-- Execute no SQL Editor do Supabase depois de 030_api_agir_como_dono.sql.
-- Nao altera as migrations 029 e 030 (elas podem ja ter sido executadas):
-- apenas acrescenta colunas, amplia uma lista fechada e cria funcao nova.
-- Roda inteira dentro de UMA transacao, e idempotente e nao apaga dado
-- nenhum: nao ha DROP TABLE, DROP COLUMN, DELETE nem TRUNCATE.
--
-- O QUE MUDA, E POR QUE
--
-- Ate aqui a chave dizia apenas "sou uma chave do ADMIN geral", e quem
-- chamava escolhia no corpo da requisicao o time e o dono do link. Isso e
-- poder demais para um segredo que vive dentro de um sistema externo: uma
-- chave vazada alcancava QUALQUER time e QUALQUER administrador.
--
-- Agora o vinculo nasce com a chave e nao muda mais:
--
--   created_by        o ADMIN geral que criou a chave (coluna da 029; e o
--                     `created_by_user_id` do pedido — quem AUTORIZA);
--   acting_user_id    o Administrador do time em nome de quem a chave age
--                     (quem APARECE no historico do link);
--   acting_client_id  o time daquele administrador.
--
-- A requisicao deixa de escolher: `POST /api/v1/links` nao recebe `donoId`
-- nem `timeId`, e o servidor resolve o dono pela chave. Uma chave do Joao
-- nunca gera, lista, consulta ou revoga link da Maria.
--
-- Para trocar o administrador nao ha edicao: revoga-se a chave e cria-se
-- outra. O gatilho abaixo recusa qualquer alteracao do vinculo no banco,
-- inclusive por engano de codigo.
--
-- CHAVES ANTIGAS (criadas pela 029, sem vinculo) param de funcionar. Nada e
-- escolhido por elas automaticamente: `cmd_api_key_resolve` recusa com o
-- motivo 'sem vinculo', e a tela mostra "Vinculo obrigatorio" ao lado da
-- chave, para o ADMIN geral revogar e criar outra escolhendo time e
-- administrador.
--
-- O que NUNCA e guardado aqui: segredo da chave em texto puro (so o
-- SHA-256), token de convite em claro, URL do convite, senha, CPF, titulo de
-- eleitor, retorno de consulta cadastral ou IP.
--
-- Todo instante e timestamptz calculado com now() (UTC) pelo banco.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. cmd_api_keys: o vinculo
--
-- Identificadores ANULAVEIS com snapshot de nome ao lado, como no resto do
-- sistema: excluir a pessoa ou o time nao apaga o registro da chave — e
-- tambem nao a deixa funcionando, porque a autenticacao exige o vinculo
-- inteiro de pe.
-- ---------------------------------------------------------------------------
alter table public.cmd_api_keys
  add column if not exists acting_user_id    uuid references public.cmd_users (id) on delete set null,
  add column if not exists acting_user_name  text,
  add column if not exists acting_client_id  uuid references public.cmd_clients (id) on delete set null,
  add column if not exists acting_client_name text;

create index if not exists cmd_api_keys_acting_idx
  on public.cmd_api_keys (acting_user_id);

comment on column public.cmd_api_keys.acting_user_id is
  'Administrador do time em nome de quem a chave age. Imutavel: para trocar, revogue e crie outra.';
comment on column public.cmd_api_keys.acting_client_id is
  'Time do administrador vinculado. Imutavel, como o proprio vinculo.';
comment on column public.cmd_api_keys.created_by is
  'ADMIN geral que criou a chave (quem autoriza). Nao e o mesmo que acting_user_id (quem aparece no historico).';

-- ---------------------------------------------------------------------------
-- 2. O vinculo nao muda depois de criado
--
-- Passa apenas o que e uso e encerramento: data do ultimo uso, contador,
-- revogacao e o desligamento das chaves estrangeiras (pessoa ou time
-- excluidos). Nome, prefixo, hash do segredo, quem criou e o vinculo ficam
-- como nasceram. Exclusao de chave e recusada: revogar preserva o historico.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_api_keys_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'chave da API nao e excluida: revogue';
  end if;

  if new.id = old.id
     and new.prefix = old.prefix
     and new.token_hash = old.token_hash
     and new.name = old.name
     and new.created_at = old.created_at
     and new.created_by_name is not distinct from old.created_by_name
     and new.acting_user_name is not distinct from old.acting_user_name
     and new.acting_client_name is not distinct from old.acting_client_name
     and (new.created_by is null or new.created_by = old.created_by)
     and (new.acting_user_id is null or new.acting_user_id = old.acting_user_id)
     and (new.acting_client_id is null or new.acting_client_id = old.acting_client_id)
  then
    return new;
  end if;

  raise exception 'vinculo da chave da API e imutavel';
end
$$;

comment on function public.cmd_api_keys_guard() is
  'Recusa alterar nome, segredo, criador e vinculo da chave. So aceita uso, revogacao e desligamento de chaves estrangeiras.';

drop trigger if exists cmd_api_keys_vinculo_imutavel on public.cmd_api_keys;
create trigger cmd_api_keys_vinculo_imutavel
  before update or delete on public.cmd_api_keys
  for each row execute function public.cmd_api_keys_guard();

-- ---------------------------------------------------------------------------
-- 3. cmd_api_key_events: resultado e motivo
--
-- A auditoria da chave passa a registrar tambem leitura e recusa. Sem isso,
-- uma chave revogada batendo na porta a cada minuto nao deixaria rastro
-- nenhum — e e exatamente o rastro que interessa.
--
-- `detail` guarda o motivo tecnico da recusa, e existe SO do lado de dentro:
-- a resposta da API continua generica, sem dizer qual conferencia falhou.
-- ---------------------------------------------------------------------------
alter table public.cmd_api_key_events
  add column if not exists result text not null default 'SUCESSO',
  add column if not exists detail text;

do $$
begin
  -- Lista fechada ampliada: leitura e recusa entram; nada sai.
  if exists (select 1 from pg_constraint where conname = 'cmd_api_key_events_action_check') then
    alter table public.cmd_api_key_events drop constraint cmd_api_key_events_action_check;
  end if;

  alter table public.cmd_api_key_events add constraint cmd_api_key_events_action_check
    check (action in ('LINK_GERADO', 'LINK_REVOGADO', 'LINK_LISTADO', 'LINK_CONSULTADO',
                      'CHAVE_RECUSADA'));

  if not exists (select 1 from pg_constraint where conname = 'cmd_api_key_events_result_check') then
    alter table public.cmd_api_key_events add constraint cmd_api_key_events_result_check
      check (result in ('SUCESSO', 'RECUSADO'));
  end if;
end
$$;

-- O historico da chave continua imutavel, agora conferindo as colunas novas.
create or replace function public.cmd_api_key_events_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'registro de acao da API e imutavel';
  end if;

  if new.id = old.id
     and new.action = old.action
     and new.occurred_at = old.occurred_at
     and new.result = old.result
     and new.detail is not distinct from old.detail
     and new.key_name is not distinct from old.key_name
     and new.admin_name is not distinct from old.admin_name
     and new.client_name is not distinct from old.client_name
     and new.owner_name is not distinct from old.owner_name
     and new.owner_role is not distinct from old.owner_role
     and (new.api_key_id is null or new.api_key_id = old.api_key_id)
     and (new.admin_user_id is null or new.admin_user_id = old.admin_user_id)
     and (new.invite_id is null or new.invite_id = old.invite_id)
     and (new.client_id is null or new.client_id = old.client_id)
     and (new.owner_user_id is null or new.owner_user_id = old.owner_user_id)
  then
    return new;
  end if;

  raise exception 'registro de acao da API e imutavel';
end
$$;

-- ---------------------------------------------------------------------------
-- 4. cmd_api_key_resolve: a unica porta da API
--
-- Recebe SOMENTE o SHA-256 do segredo. Confere, em uma transacao, TUDO o que
-- precisa estar de pe para a chave valer:
--
--   1. a chave existe;
--   2. nao foi revogada;
--   3. tem vinculo (chave antiga, da 029, nao tem);
--   4. o ADMIN geral que a criou continua existindo, ativo e ADMIN;
--   5. o administrador vinculado continua existindo, ativo e com perfil de
--      Administrador do time (CANDIDATE);
--   6. esse administrador continua ligado AO MESMO time da chave;
--   7. o time continua existindo.
--
-- Qualquer uma que falhe derruba a chave na hora, sem periodo de tolerancia.
--
-- A funcao devolve `allowed` e `reason` em vez de simplesmente nao devolver
-- nada: o servidor precisa do motivo para REGISTRAR a recusa junto da chave
-- (auditoria), e responde sempre a mesma coisa para fora. O motivo nunca sai
-- do servidor.
--
-- Sem chave nenhuma com aquele hash, nao volta linha alguma — ai nem ha o que
-- registrar, e a resposta e a mesma.
--
-- O uso (data e contador) so e contabilizado quando a chave passa.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_api_key_resolve(p_token_hash text)
returns table (
  key_id           uuid,
  key_name         text,
  admin_user_id    uuid,
  admin_name       text,
  acting_user_id   uuid,
  acting_user_name text,
  client_id        uuid,
  client_name      text,
  allowed          boolean,
  reason           text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_chave   record;
  v_admin   record;
  v_dono    record;
  v_time    record;
  v_motivo  text := null;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  select k.id, k.name, k.created_by, k.created_by_name, k.revoked_at,
         k.acting_user_id, k.acting_user_name, k.acting_client_id, k.acting_client_name
    into v_chave
    from public.cmd_api_keys k
   where k.token_hash = p_token_hash
   for update;

  if v_chave.id is null then
    return;
  end if;

  if v_chave.revoked_at is not null then
    v_motivo := 'chave revogada';
  elsif v_chave.acting_user_id is null or v_chave.acting_client_id is null then
    -- Chave da 029, sem vinculo. Nao se escolhe administrador por ela.
    v_motivo := 'sem vinculo';
  end if;

  if v_motivo is null then
    select u.id, u.is_active, u.role::text as role
      into v_admin
      from public.cmd_users u
     where u.id = v_chave.created_by;

    if v_admin.id is null or not v_admin.is_active or v_admin.role <> 'ADMIN' then
      v_motivo := 'admin geral inativo';
    end if;
  end if;

  if v_motivo is null then
    select u.id, u.name, u.is_active, u.role::text as role, u.client_id
      into v_dono
      from public.cmd_users u
     where u.id = v_chave.acting_user_id;

    if v_dono.id is null or not v_dono.is_active then
      v_motivo := 'administrador do time inativo';
    elsif v_dono.role <> 'CANDIDATE' then
      v_motivo := 'perfil do vinculo mudou';
    elsif v_dono.client_id is null or v_dono.client_id <> v_chave.acting_client_id then
      -- Trocou de time depois da criacao da chave: o vinculo nao vale mais.
      v_motivo := 'vinculo com o time mudou';
    end if;
  end if;

  if v_motivo is null then
    select c.id, c.name into v_time
      from public.cmd_clients c
     where c.id = v_chave.acting_client_id;

    if v_time.id is null then
      v_motivo := 'time removido';
    end if;
  end if;

  if v_motivo is null then
    update public.cmd_api_keys
       set last_used_at = now(),
           request_count = request_count + 1
     where id = v_chave.id;
  end if;

  return query
    select v_chave.id,
           v_chave.name,
           v_chave.created_by,
           v_chave.created_by_name,
           v_chave.acting_user_id,
           coalesce(v_dono.name, v_chave.acting_user_name),
           v_chave.acting_client_id,
           coalesce(v_time.name, v_chave.acting_client_name),
           v_motivo is null,
           v_motivo;
end
$$;

comment on function public.cmd_api_key_resolve(text) is
  'Autentica a chave da API e devolve o vinculo. Confere revogacao, vinculo, ADMIN geral, administrador do time e o time, tudo em uma transacao.';

-- ---------------------------------------------------------------------------
-- 5. A porta antiga sai de cena
--
-- `cmd_api_key_auth` (029) autenticava SEM conferir vinculo: era ela que
-- permitia uma chave agir em nome de qualquer administrador. Nenhum codigo a
-- chama mais, e deixa-la de pe seria manter uma segunda porta, mais fraca,
-- para o mesmo segredo.
-- ---------------------------------------------------------------------------
drop function if exists public.cmd_api_key_auth(text);

-- ---------------------------------------------------------------------------
-- 6. Permissoes: so o servidor, com a chave secreta
-- ---------------------------------------------------------------------------
do $$
declare
  funcoes text[] := array[
    'public.cmd_api_key_resolve(text)',
    'public.cmd_api_keys_guard()',
    'public.cmd_api_key_events_guard()'
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
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute format('grant execute on function public.cmd_api_key_resolve(text) to service_role');
  end if;
end
$$;

commit;
