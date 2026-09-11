-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 013: expiracao obrigatoria, link de uso unico e historico
--
-- Execute no SQL Editor do Supabase depois de 012. Nao altera nenhuma
-- migration anterior. Roda inteira dentro de UMA transacao, e idempotente
-- (pode ser executada duas vezes seguidas sem efeito adicional) e nao apaga
-- dado nenhum: nao ha DROP TABLE, DROP COLUMN, DELETE nem TRUNCATE.
--
-- Reutiliza a estrutura de convites pessoais da 012: continua UM link por
-- usuario em public.cmd_invites. Nao existe um segundo sistema de convites.
--
-- O que entra aqui:
--   1. public.cmd_settings         - duracao dos links, uma linha global.
--   2. colunas de prazo e reserva  - em public.cmd_invites.
--   3. public.cmd_invite_events    - historico imutavel dos links.
--   4. funcoes de transicao atomica ACTIVE -> CLAIMED -> SUBMITTING ->
--      CONSUMED, com bloqueio da linha.
--
-- Continua sem Supabase Authentication: nenhuma referencia a auth.users,
-- auth.uid() ou policy baseada em sessao do Supabase. RLS fica habilitado e
-- forcado, sem policy nenhuma, e o acesso acontece somente pelo servidor do
-- Next.js com a chave secreta (service_role).
--
-- O que NUNCA e guardado aqui: token em texto puro no historico, segredo da
-- reserva (apenas o SHA-256), senha, CPF, IP em texto puro ou retorno de
-- consulta cadastral.
--
-- Todo instante e timestamptz, calculado com now() (UTC) pelo servidor do
-- banco. O relogio do navegador nunca autoriza nada.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. public.cmd_settings: duracao dos links
--
-- Uma unica linha, garantida pela chave primaria booleana com check. Os dois
-- prazos vivem em colunas separadas e independentes, em SEGUNDOS inteiros:
-- de 60 (1 minuto) a 31.536.000 (365 dias). Nenhum intervalo e montado com
-- texto recebido do usuario; a conversao para interval acontece com
-- make_interval(secs => inteiro), a partir de um valor ja validado pelo
-- check da coluna.
--
-- Sem configuracao, os dois prazos valem 24 horas (86400 segundos).
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_settings (
  id                         boolean primary key default true,
  candidate_invite_seconds   integer not null default 86400,
  team_invite_seconds        integer not null default 86400,
  updated_at                 timestamptz not null default now(),
  constraint cmd_settings_singleton_check check (id),
  constraint cmd_settings_candidate_seconds_check
    check (candidate_invite_seconds between 60 and 31536000),
  constraint cmd_settings_team_seconds_check
    check (team_invite_seconds between 60 and 31536000)
);

insert into public.cmd_settings (id) values (true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. public.cmd_invites: prazo, estado e reserva do primeiro acesso
--
-- `status` e o ciclo de vida do link:
--   ACTIVE      gerado, ainda sem ninguem.
--   CLAIMED     reservado pelo primeiro navegador que abriu.
--   SUBMITTING  envio em andamento (impede dois envios ao mesmo tempo).
--   CONSUMED    cadastro concluido. Definitivo.
--   EXPIRED     prazo terminou.
--   REVOKED     substituido por um link novo.
--
-- `claim_hash` guarda SOMENTE o SHA-256 do segredo que vai no cookie
-- HttpOnly. O segredo em si nunca entra no banco, nem em log, nem em JSON.
--
-- `generation` conta as geracoes do mesmo link pessoal: cada "gerar novo
-- link" incrementa, e o historico e escrito por geracao. Assim continua
-- existindo um unico convite por usuario (migration 012) com historico
-- completo de todas as geracoes.
-- ---------------------------------------------------------------------------
alter table public.cmd_invites
  add column if not exists issued_at   timestamptz,
  add column if not exists expires_at  timestamptz,
  add column if not exists status      text,
  add column if not exists claim_hash  text,
  add column if not exists claimed_at  timestamptz,
  add column if not exists consumed_at timestamptz,
  add column if not exists revoked_at  timestamptz,
  add column if not exists generation  integer;

-- Link ativo antigo, sem prazo, deixa de ser eterno: 24 horas a partir de
-- agora. Nada e apagado; apenas o que estava nulo passa a ter prazo.
update public.cmd_invites
   set issued_at = now(),
       expires_at = now() + interval '24 hours'
 where expires_at is null;

update public.cmd_invites set issued_at  = coalesce(issued_at, created_at, now()) where issued_at is null;
update public.cmd_invites set status     = 'ACTIVE' where status is null;
update public.cmd_invites set generation = 1        where generation is null;

alter table public.cmd_invites
  alter column issued_at  set not null,
  alter column expires_at set not null,
  alter column status     set not null,
  alter column generation set not null;

alter table public.cmd_invites
  alter column status     set default 'ACTIVE',
  alter column generation set default 1;

do $$
begin
  -- O prazo sempre termina depois de comecar.
  if not exists (select 1 from pg_constraint where conname = 'cmd_invites_prazo_check') then
    alter table public.cmd_invites add constraint cmd_invites_prazo_check
      check (expires_at > issued_at);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cmd_invites_status_check') then
    alter table public.cmd_invites add constraint cmd_invites_status_check
      check (status in ('ACTIVE', 'CLAIMED', 'SUBMITTING', 'CONSUMED', 'EXPIRED', 'REVOKED'));
  end if;

  -- Reserva e hash de 64 hexadecimais (SHA-256). Nunca o segredo.
  if not exists (select 1 from pg_constraint where conname = 'cmd_invites_claim_hash_check') then
    alter table public.cmd_invites add constraint cmd_invites_claim_hash_check
      check (claim_hash is null or claim_hash ~ '^[0-9a-f]{64}$');
  end if;

  -- Estado reservado exige reserva registrada.
  if not exists (select 1 from pg_constraint where conname = 'cmd_invites_claim_coerencia_check') then
    alter table public.cmd_invites add constraint cmd_invites_claim_coerencia_check
      check (
        (status in ('CLAIMED', 'SUBMITTING') and claim_hash is not null and claimed_at is not null)
        or status not in ('CLAIMED', 'SUBMITTING')
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cmd_invites_generation_check') then
    alter table public.cmd_invites add constraint cmd_invites_generation_check
      check (generation >= 1);
  end if;
end
$$;

create index if not exists cmd_invites_status_expires_idx
  on public.cmd_invites (status, expires_at);

-- ---------------------------------------------------------------------------
-- 3. public.cmd_invite_events: historico imutavel
--
-- Uma linha por acontecimento, por geracao do link. O snapshot do
-- responsavel (nome e perfil) permanece mesmo que o usuario seja excluido
-- depois, para o historico nao perder a autoria.
--
-- Guarda apenas instantes e identificadores internos. Nada de token em
-- texto puro, segredo do cookie, senha, CPF, IP ou dado de consulta.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_invite_events (
  id           uuid primary key default gen_random_uuid(),
  invite_id    uuid not null references public.cmd_invites (id) on delete cascade,
  client_id    uuid not null references public.cmd_clients (id) on delete cascade,
  user_id      uuid references public.cmd_users (id) on delete set null,
  owner_name   text,
  owner_role   text,
  generation   integer not null default 1,
  event        text not null,
  occurred_at  timestamptz not null default now(),
  constraint cmd_invite_events_event_check
    check (event in ('GENERATED', 'CLAIMED', 'CONSUMED', 'EXPIRED', 'REVOKED')),
  constraint cmd_invite_events_owner_role_check
    check (owner_role is null or owner_role in ('ADMIN', 'CANDIDATE', 'EQUIPE')),
  constraint cmd_invite_events_generation_check check (generation >= 1)
);

-- Um acontecimento de cada tipo por geracao: recarregar a pagina no mesmo
-- navegador nao cria um segundo CLAIMED.
create unique index if not exists cmd_invite_events_unicos_key
  on public.cmd_invite_events (invite_id, generation, event);

create index if not exists cmd_invite_events_client_idx
  on public.cmd_invite_events (client_id, occurred_at desc);

create index if not exists cmd_invite_events_user_idx
  on public.cmd_invite_events (user_id, occurred_at desc);

-- Imutavel de verdade: o banco recusa alteracao e exclusao de evento.
create or replace function public.cmd_invite_events_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'historico de links e imutavel';
end
$$;

comment on function public.cmd_invite_events_guard() is
  'Recusa UPDATE e DELETE em cmd_invite_events: o historico nunca e reescrito.';

drop trigger if exists cmd_invite_events_imutavel on public.cmd_invite_events;
create trigger cmd_invite_events_imutavel
  before update or delete on public.cmd_invite_events
  for each row execute function public.cmd_invite_events_guard();

-- ---------------------------------------------------------------------------
-- 4. Prazo configurado, por perfil do dono do link
--
-- CANDIDATE usa candidate_invite_seconds; EQUIPE usa team_invite_seconds.
-- Sem linha de configuracao, 24 horas. O valor sai sempre da tabela, nunca
-- do navegador.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_seconds(p_role text)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select case when p_role = 'EQUIPE' then s.team_invite_seconds
                 else s.candidate_invite_seconds end
       from public.cmd_settings s where s.id),
    86400
  );
$$;

comment on function public.cmd_invite_seconds(text) is
  'Duracao configurada do link, em segundos, conforme o perfil do dono.';

-- ---------------------------------------------------------------------------
-- 5. Marcar como expirado o que passou do prazo
--
-- Nao existe cron: o estado e atualizado quando o link ou o historico sao
-- consultados. A comparacao usa sempre now() do banco.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_expire_due()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_linha record;
begin
  for v_linha in
    select i.id, i.client_id, i.user_id, i.generation
      from public.cmd_invites i
     where i.status in ('ACTIVE', 'CLAIMED', 'SUBMITTING')
       and i.expires_at <= now()
     order by i.expires_at
     for update skip locked
  loop
    update public.cmd_invites
       set status = 'EXPIRED'
     where id = v_linha.id;

    insert into public.cmd_invite_events
      (invite_id, client_id, user_id, owner_name, owner_role, generation, event)
    select v_linha.id, v_linha.client_id, v_linha.user_id, u.name, u.role::text,
           v_linha.generation, 'EXPIRED'
      from public.cmd_users u
     where u.id = v_linha.user_id
    union all
    select v_linha.id, v_linha.client_id, null, null, null, v_linha.generation, 'EXPIRED'
     where v_linha.user_id is null
    on conflict (invite_id, generation, event) do nothing;

    v_total := v_total + 1;
  end loop;

  return v_total;
end
$$;

comment on function public.cmd_invite_expire_due() is
  'Marca EXPIRED os links vencidos pelo horario do banco e registra o evento.';

-- ---------------------------------------------------------------------------
-- 6. Gerar ou renovar o link pessoal
--
-- Revoga imediatamente a geracao anterior (mesmo reservada) e grava a nova
-- com issued_at = now() e expires_at = now() + prazo do perfil. O token
-- chega pronto do servidor (aleatorio) e somente o hash e usado na busca.
--
-- Continua sendo UMA linha por usuario: a geracao e incrementada, e o
-- historico distingue as geracoes.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_issue(
  p_user_id    uuid,
  p_token      text,
  p_token_hash text
)
returns table (invite_id uuid, issued_at timestamptz, expires_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user     record;
  v_atual    record;
  v_id       uuid;
  v_geracao  integer := 1;
  v_segundos integer;
  v_agora    timestamptz := now();
  v_fim      timestamptz;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'token invalido';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'hash do token invalido';
  end if;

  select u.id, u.client_id, u.name, u.role::text as role, u.is_active
    into v_user
    from public.cmd_users u
   where u.id = p_user_id
   for share;

  if v_user is null or v_user.client_id is null then
    raise exception 'usuario sem operacao';
  end if;
  if not v_user.is_active then
    raise exception 'usuario inativo';
  end if;
  if v_user.role not in ('CANDIDATE', 'EQUIPE') then
    raise exception 'perfil sem link pessoal';
  end if;

  v_segundos := public.cmd_invite_seconds(v_user.role);
  v_fim := v_agora + make_interval(secs => v_segundos);

  select i.id, i.generation, i.status
    into v_atual
    from public.cmd_invites i
   where i.user_id = p_user_id
   for update;

  if v_atual.id is not null then
    v_id := v_atual.id;
    v_geracao := v_atual.generation + 1;

    -- A geracao anterior morre agora: token anterior deixa de valer na hora.
    if v_atual.status in ('ACTIVE', 'CLAIMED', 'SUBMITTING') then
      insert into public.cmd_invite_events
        (invite_id, client_id, user_id, owner_name, owner_role, generation, event)
      values (v_id, v_user.client_id, v_user.id, v_user.name, v_user.role,
              v_atual.generation, 'REVOKED')
      on conflict (invite_id, generation, event) do nothing;
    end if;

    update public.cmd_invites
       set token = p_token,
           token_hash = p_token_hash,
           active = true,
           rotated_at = v_agora,
           issued_at = v_agora,
           expires_at = v_fim,
           status = 'ACTIVE',
           claim_hash = null,
           claimed_at = null,
           consumed_at = null,
           -- A geracao nova nasce limpa. A revogacao da anterior fica no
           -- evento REVOKED, que preserva o instante exato.
           revoked_at = null,
           generation = v_geracao
     where id = v_id;
  else
    insert into public.cmd_invites
      (client_id, user_id, token, token_hash, active, issued_at, expires_at, status, generation)
    values (v_user.client_id, v_user.id, p_token, p_token_hash, true,
            v_agora, v_fim, 'ACTIVE', 1)
    returning id into v_id;
  end if;

  insert into public.cmd_invite_events
    (invite_id, client_id, user_id, owner_name, owner_role, generation, event)
  values (v_id, v_user.client_id, v_user.id, v_user.name, v_user.role, v_geracao, 'GENERATED')
  on conflict (invite_id, generation, event) do nothing;

  return query select v_id, v_agora, v_fim;
end
$$;

comment on function public.cmd_invite_issue(uuid, text, text) is
  'Gera ou renova o link pessoal: revoga a geracao anterior e aplica o prazo do perfil.';

-- ---------------------------------------------------------------------------
-- 6b. cmd_create_team_access: o link do integrante nasce com prazo
--
-- A funcao da migration 012 continua com a MESMA assinatura e o mesmo
-- comportamento (usuario EQUIPE + link pessoal em uma transacao so). Aqui
-- ela passa a gravar issued_at/expires_at com o prazo configurado para a
-- EQUIPE e a registrar o evento GENERATED no historico.
--
-- Senha continua chegando apenas como hash scrypt, e pode ser nula: nesse
-- caso o acesso nasce pendente, sem senha utilizavel.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_create_team_access(
  p_client_id     uuid,
  p_member_id     uuid,
  p_name          text,
  p_email         text,
  p_password_hash text,
  p_token         text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id   uuid;
  v_invite_id uuid;
  v_agora     timestamptz := now();
  v_segundos  integer;
begin
  if p_password_hash is not null
     and p_password_hash !~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$' then
    raise exception 'senha deve chegar como hash scrypt';
  end if;

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'token invalido';
  end if;

  -- O integrante precisa ser mesmo daquele candidato.
  if not exists (
    select 1 from public.cmd_members m
     where m.id = p_member_id and m.client_id = p_client_id
  ) then
    raise exception 'integrante nao pertence ao candidato';
  end if;

  insert into public.cmd_users
    (name, email, role, client_id, member_id, password_hash, must_change_password, is_active)
  values (p_name, p_email, 'EQUIPE'::public.cmd_role, p_client_id, p_member_id,
          p_password_hash, true, true)
  returning id into v_user_id;

  v_segundos := public.cmd_invite_seconds('EQUIPE');

  insert into public.cmd_invites
    (client_id, user_id, token, token_hash, active, issued_at, expires_at, status, generation)
  values (p_client_id, v_user_id, p_token, encode(public.cmd_sha256(p_token), 'hex'), true,
          v_agora, v_agora + make_interval(secs => v_segundos), 'ACTIVE', 1)
  returning id into v_invite_id;

  insert into public.cmd_invite_events
    (invite_id, client_id, user_id, owner_name, owner_role, generation, event)
  values (v_invite_id, p_client_id, v_user_id, p_name, 'EQUIPE', 1, 'GENERATED')
  on conflict (invite_id, generation, event) do nothing;

  return v_user_id;
end
$$;

comment on function public.cmd_create_team_access(uuid, uuid, text, text, text, text) is
  'Cria o usuario EQUIPE e o link pessoal (com prazo e historico) em uma transacao so.';

-- ---------------------------------------------------------------------------
-- 7. Reserva do primeiro acesso
--
-- Transicao atomica, com a linha bloqueada:
--   ACTIVE  + reserva nova         -> CLAIMED   (devolve 'OK')
--   CLAIMED + mesma reserva        -> CLAIMED   (devolve 'OK', sem novo evento)
--   CLAIMED + reserva diferente    -> 'TAKEN'
--   vencido                        -> EXPIRED, devolve 'GONE'
--   CONSUMED / EXPIRED / REVOKED   -> 'GONE'
--
-- Reservar nao renova nem aumenta o prazo: expires_at nao e tocado.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_claim(
  p_token_hash text,
  p_claim_hash text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invite record;
  v_user   record;
begin
  if p_claim_hash is null or p_claim_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'reserva invalida';
  end if;

  select i.id, i.client_id, i.user_id, i.status, i.claim_hash, i.expires_at, i.generation
    into v_invite
    from public.cmd_invites i
   where i.token_hash = p_token_hash
   for update;

  if v_invite.id is null then
    return 'GONE';
  end if;

  select u.name, u.role::text as role into v_user
    from public.cmd_users u where u.id = v_invite.user_id;

  -- Vencido: passa a EXPIRED aqui mesmo, sem depender de cron.
  if v_invite.status in ('ACTIVE', 'CLAIMED', 'SUBMITTING') and v_invite.expires_at <= now() then
    update public.cmd_invites set status = 'EXPIRED' where id = v_invite.id;

    insert into public.cmd_invite_events
      (invite_id, client_id, user_id, owner_name, owner_role, generation, event)
    values (v_invite.id, v_invite.client_id, v_invite.user_id, v_user.name, v_user.role,
            v_invite.generation, 'EXPIRED')
    on conflict (invite_id, generation, event) do nothing;

    return 'GONE';
  end if;

  if v_invite.status in ('CONSUMED', 'EXPIRED', 'REVOKED') then
    return 'GONE';
  end if;

  if v_invite.status = 'ACTIVE' then
    update public.cmd_invites
       set status = 'CLAIMED', claim_hash = p_claim_hash, claimed_at = now()
     where id = v_invite.id;

    insert into public.cmd_invite_events
      (invite_id, client_id, user_id, owner_name, owner_role, generation, event)
    values (v_invite.id, v_invite.client_id, v_invite.user_id, v_user.name, v_user.role,
            v_invite.generation, 'CLAIMED')
    on conflict (invite_id, generation, event) do nothing;

    return 'OK';
  end if;

  -- Ja reservado: continua somente para a mesma reserva.
  if v_invite.claim_hash = p_claim_hash then
    return 'OK';
  end if;

  return 'TAKEN';
end
$$;

comment on function public.cmd_invite_claim(text, text) is
  'Reserva o link para o primeiro navegador e recusa qualquer outro.';

-- ---------------------------------------------------------------------------
-- 8. Envio: CLAIMED -> SUBMITTING -> CONSUMED
--
-- `cmd_invite_begin_submit` impede dois envios ao mesmo tempo e recusa
-- reserva diferente, prazo vencido ou link ja consumido.
-- `cmd_invite_release_submit` devolve para CLAIMED quando o cadastro falha
-- antes de ser salvo, apenas para a mesma reserva e dentro do prazo.
-- `cmd_invite_consume` fecha o link em definitivo.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_begin_submit(
  p_token_hash text,
  p_claim_hash text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invite record;
  v_user   record;
begin
  if p_claim_hash is null or p_claim_hash !~ '^[0-9a-f]{64}$' then
    return 'TAKEN';
  end if;

  select i.id, i.client_id, i.user_id, i.status, i.claim_hash, i.expires_at, i.generation
    into v_invite
    from public.cmd_invites i
   where i.token_hash = p_token_hash
   for update;

  if v_invite.id is null then
    return 'GONE';
  end if;

  if v_invite.status in ('ACTIVE', 'CLAIMED', 'SUBMITTING') and v_invite.expires_at <= now() then
    select u.name, u.role::text as role into v_user
      from public.cmd_users u where u.id = v_invite.user_id;

    update public.cmd_invites set status = 'EXPIRED' where id = v_invite.id;

    insert into public.cmd_invite_events
      (invite_id, client_id, user_id, owner_name, owner_role, generation, event)
    values (v_invite.id, v_invite.client_id, v_invite.user_id, v_user.name, v_user.role,
            v_invite.generation, 'EXPIRED')
    on conflict (invite_id, generation, event) do nothing;

    return 'GONE';
  end if;

  if v_invite.status in ('CONSUMED', 'EXPIRED', 'REVOKED') then
    return 'GONE';
  end if;

  if v_invite.claim_hash is distinct from p_claim_hash then
    return 'TAKEN';
  end if;

  -- Envio ja em andamento para a mesma reserva: o segundo nao passa.
  if v_invite.status = 'SUBMITTING' then
    return 'BUSY';
  end if;

  update public.cmd_invites set status = 'SUBMITTING' where id = v_invite.id;
  return 'OK';
end
$$;

comment on function public.cmd_invite_begin_submit(text, text) is
  'Abre o envio (CLAIMED -> SUBMITTING) e impede dois envios simultaneos.';

create or replace function public.cmd_invite_release_submit(
  p_token_hash text,
  p_claim_hash text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_afetadas integer;
begin
  update public.cmd_invites
     set status = 'CLAIMED'
   where token_hash = p_token_hash
     and status = 'SUBMITTING'
     and claim_hash = p_claim_hash
     and expires_at > now();

  get diagnostics v_afetadas = row_count;
  return v_afetadas > 0;
end
$$;

comment on function public.cmd_invite_release_submit(text, text) is
  'Devolve o link para CLAIMED quando o cadastro falha antes de ser salvo.';

create or replace function public.cmd_invite_consume(p_token_hash text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invite record;
  v_user   record;
begin
  select i.id, i.client_id, i.user_id, i.status, i.generation
    into v_invite
    from public.cmd_invites i
   where i.token_hash = p_token_hash
   for update;

  if v_invite.id is null then
    return false;
  end if;

  -- Consumido e definitivo: nunca volta para tras.
  if v_invite.status = 'CONSUMED' then
    return true;
  end if;

  update public.cmd_invites
     set status = 'CONSUMED', consumed_at = now(), active = false
   where id = v_invite.id;

  select u.name, u.role::text as role into v_user
    from public.cmd_users u where u.id = v_invite.user_id;

  insert into public.cmd_invite_events
    (invite_id, client_id, user_id, owner_name, owner_role, generation, event)
  values (v_invite.id, v_invite.client_id, v_invite.user_id, v_user.name, v_user.role,
          v_invite.generation, 'CONSUMED')
  on conflict (invite_id, generation, event) do nothing;

  return true;
end
$$;

comment on function public.cmd_invite_consume(text) is
  'Fecha o link em definitivo depois que o integrante foi salvo.';

-- ---------------------------------------------------------------------------
-- 9. RLS das tabelas novas
--
-- Habilitado e forcado, sem nenhuma policy: ninguem le nem escreve com as
-- chaves publicas. O acesso e somente pelo servidor, com a chave secreta.
-- ---------------------------------------------------------------------------
alter table public.cmd_settings      enable row level security;
alter table public.cmd_invite_events enable row level security;

alter table public.cmd_settings      force row level security;
alter table public.cmd_invite_events force row level security;

-- ---------------------------------------------------------------------------
-- 10. Privilegios: apenas o servidor, pela chave secreta.
-- ---------------------------------------------------------------------------
do $$
declare
  tabelas constant text := '
    public.cmd_settings,
    public.cmd_invite_events';
  funcoes constant text[] := array[
    'public.cmd_invite_seconds(text)',
    'public.cmd_invite_expire_due()',
    'public.cmd_invite_issue(uuid, text, text)',
    'public.cmd_invite_claim(text, text)',
    'public.cmd_invite_begin_submit(text, text)',
    'public.cmd_invite_release_submit(text, text)',
    'public.cmd_invite_consume(text)',
    'public.cmd_invite_events_guard()'
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
    execute format(
      'grant select, insert, update on %s to service_role', tabelas
    );
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

-- ---------------------------------------------------------------------------
-- 11. Comentarios de documentacao
-- ---------------------------------------------------------------------------
comment on table public.cmd_settings is
  'Configuracao global do CMD. Uma linha. Prazos dos links em segundos.';
comment on column public.cmd_settings.candidate_invite_seconds is
  'Duracao do link do candidato, em segundos. De 60 a 31536000 (365 dias).';
comment on column public.cmd_settings.team_invite_seconds is
  'Duracao do link do integrante da equipe, em segundos. De 60 a 31536000.';
comment on table public.cmd_invite_events is
  'Historico imutavel dos links. Sem token, segredo, senha, CPF ou IP.';
comment on column public.cmd_invites.issued_at is
  'Momento da geracao, pelo horario do banco (UTC).';
comment on column public.cmd_invites.expires_at is
  'Fim do prazo, sempre maior que issued_at. Autorizacao e sempre do servidor.';
comment on column public.cmd_invites.status is
  'ACTIVE, CLAIMED, SUBMITTING, CONSUMED, EXPIRED ou REVOKED.';
comment on column public.cmd_invites.claim_hash is
  'SHA-256 do segredo da reserva enviado em cookie HttpOnly. O segredo nao e guardado.';
comment on column public.cmd_invites.generation is
  'Contador de geracoes do mesmo link pessoal. O historico e escrito por geracao.';

commit;
