-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 021: cada abertura do link de cadastro vira um clique registrado
--
-- Execute no SQL Editor do Supabase depois de 020_recruitment_link_tracking.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA transacao,
-- e idempotente e nao apaga dado nenhum: nao ha DROP, DELETE nem TRUNCATE.
-- Nenhuma API externa e consultada.
--
-- ESCOPO: continua sendo o link de CADASTRO/RECRUTAMENTO da migration 013,
-- ampliado pela 020. Nao existe um segundo sistema de convites nem um modulo
-- paralelo de rastreamento: o que entra aqui pendura nas MESMAS estruturas.
-- O link permanente de acesso ao painel do Time nao e tocado.
--
-- O que entra:
--   1. public.cmd_invite_generations   - registro imutavel por geracao, com o
--      hash do token e os snapshots. E ele que permite reconhecer um link
--      antigo depois de renovado: a renovacao troca o hash em cmd_invites, e
--      sem este registro a geracao anterior deixava de ser identificavel.
--   2. public.cmd_invite_click_attempts - uma linha por ABERTURA real da rota
--      do convite, inclusive quando o link ja esta expirado, reservado,
--      consumido ou revogado.
--   3. funcoes de abertura, desfecho e complementacao do clique.
--
-- REGRAS QUE ESTA MIGRATION NAO MUDA:
--   - uso unico do link: registrar clique NAO reserva, NAO renova, NAO
--     expira e NAO consome nada. Nenhuma funcao daqui escreve em
--     cmd_invites;
--   - a reserva pelo primeiro aparelho continua em cmd_invite_claim;
--   - o historico por geracao da migration 020 continua intacto.
--
-- Token desconhecido nao gera registro: sem geracao correspondente, a funcao
-- devolve zero linhas. Isso evita lixo e enxurrada de linhas por tentativa.
--
-- O que NUNCA e guardado: token em texto puro, URL do convite, segredo da
-- reserva, IP em texto puro, GPS, MAC, IMEI ou canvas fingerprint. Nao
-- existe coluna para nada disso. O IP aparece somente como HMAC, calculado
-- no servidor do Next.js quando DEVICE_IP_HMAC_KEY existe.
--
-- Todo instante e timestamptz calculado com now() (UTC) pelo banco.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. public.cmd_invite_generations: uma linha imutavel por geracao
--
-- cmd_invites guarda SEMPRE a geracao corrente: renovar sobrescreve o token e
-- o hash. Sem este registro, abrir o endereco de uma geracao anterior nao
-- encontrava nada e o clique se perdia.
--
-- Aqui o hash de cada geracao fica para sempre. Encontrar a geracao serve
-- apenas para RECONHECER o link e registrar o clique: nada nesta tabela
-- autoriza cadastro, porque a reserva e o envio continuam procurando o hash
-- em cmd_invites, que so conhece a geracao corrente.
--
-- Identificadores de pessoa sao anulaveis e acompanhados de snapshot, entao
-- excluir o dono, o gerador ou o convite nao apaga a geracao.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_invite_generations (
  id          uuid primary key default gen_random_uuid(),
  invite_ref  uuid not null,
  invite_id   uuid references public.cmd_invites (id) on delete set null,
  client_id   uuid not null references public.cmd_clients (id) on delete cascade,
  generation  integer not null,

  -- SHA-256 do token daquela geracao. O token em texto puro nunca entra aqui.
  token_hash  text not null check (token_hash ~ '^[0-9a-f]{64}$'),

  issued_at   timestamptz not null,
  expires_at  timestamptz not null,

  -- Snapshots, para o registro sobreviver a exclusao das pessoas.
  owner_user_id        uuid references public.cmd_users (id) on delete set null,
  owner_name           text,
  owner_role           text,
  generated_by_user_id uuid references public.cmd_users (id) on delete set null,
  generated_by_name    text,
  generated_by_role    text,

  created_at  timestamptz not null default now(),

  constraint cmd_invite_generations_generation_check check (generation >= 1),
  constraint cmd_invite_generations_prazo_check check (expires_at > issued_at),
  constraint cmd_invite_generations_owner_role_check
    check (owner_role is null or owner_role in ('ADMIN', 'CANDIDATE', 'EQUIPE')),
  constraint cmd_invite_generations_generated_by_role_check
    check (generated_by_role is null
           or generated_by_role in ('ADMIN', 'CANDIDATE', 'EQUIPE'))
);

-- Uma geracao por link, e um hash que nunca se repete.
create unique index if not exists cmd_invite_generations_unica_key
  on public.cmd_invite_generations (invite_ref, generation);
create unique index if not exists cmd_invite_generations_token_key
  on public.cmd_invite_generations (token_hash);
create index if not exists cmd_invite_generations_client_idx
  on public.cmd_invite_generations (client_id, issued_at desc);
create index if not exists cmd_invite_generations_owner_idx
  on public.cmd_invite_generations (owner_user_id);

-- Backfill: somente a geracao DISPONIVEL hoje, que e a corrente de cada
-- convite. Hashes de geracoes anteriores ja foram sobrescritos e nao tem como
-- ser recuperados — links antigos emitidos antes desta migration seguem sem
-- registro, e abri-los continua caindo na tela de link indisponivel.
insert into public.cmd_invite_generations
  (invite_ref, invite_id, client_id, generation, token_hash, issued_at, expires_at,
   owner_user_id, owner_name, owner_role,
   generated_by_user_id, generated_by_name, generated_by_role)
select i.id, i.id, i.client_id, i.generation, i.token_hash, i.issued_at, i.expires_at,
       i.user_id, coalesce(i.owner_name, u.name), coalesce(i.owner_role, u.role::text),
       i.generated_by_user_id, i.generated_by_name, i.generated_by_role
  from public.cmd_invites i
  left join public.cmd_users u on u.id = i.user_id
 where i.token_hash ~ '^[0-9a-f]{64}$'
   and i.expires_at > i.issued_at
on conflict (invite_ref, generation) do nothing;

-- Imutavel de verdade: so passa o desligamento das chaves estrangeiras
-- (pessoa ou convite excluidos) e a cascata do proprio Time. Mesma regra do
-- historico da migration 020.
create or replace function public.cmd_invite_generations_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.cmd_clients c where c.id = old.client_id) then
      return old;
    end if;
    raise exception 'registro de geracao de link e imutavel';
  end if;

  if new.id = old.id
     and new.invite_ref = old.invite_ref
     and new.client_id = old.client_id
     and new.generation = old.generation
     and new.token_hash = old.token_hash
     and new.issued_at = old.issued_at
     and new.expires_at = old.expires_at
     and new.owner_name is not distinct from old.owner_name
     and new.owner_role is not distinct from old.owner_role
     and new.generated_by_name is not distinct from old.generated_by_name
     and new.generated_by_role is not distinct from old.generated_by_role
     and (new.invite_id is null or new.invite_id = old.invite_id)
     and (new.owner_user_id is null or new.owner_user_id = old.owner_user_id)
     and (new.generated_by_user_id is null
          or new.generated_by_user_id = old.generated_by_user_id)
  then
    return new;
  end if;

  raise exception 'registro de geracao de link e imutavel';
end
$$;

comment on function public.cmd_invite_generations_guard() is
  'Recusa reescrita e exclusao do registro de geracao. So aceita desligar chaves estrangeiras.';

drop trigger if exists cmd_invite_generations_imutavel on public.cmd_invite_generations;
create trigger cmd_invite_generations_imutavel
  before update or delete on public.cmd_invite_generations
  for each row execute function public.cmd_invite_generations_guard();

-- ---------------------------------------------------------------------------
-- 2. public.cmd_invite_click_attempts: uma linha por abertura do link
--
-- `click_number` e a numeracao HUMANA, sequencial e independente por link e
-- geracao: 1o clique, 2o clique, 3o clique. Ela e atribuida sob o bloqueio da
-- linha da geracao, entao dois cliques simultaneos nunca recebem o mesmo
-- numero.
--
-- Pre-visualizacao automatica (WhatsApp, Facebook, Telegram, X, prefetch do
-- navegador) entra com `kind = 'PREVIEW'` e `click_number` NULO: ela aparece
-- separada na auditoria e nunca ocupa um numero de clique humano.
--
-- `link_status` e a situacao do link no instante da abertura. `outcome` e o
-- desfecho daquela abertura. Nenhum dos dois altera o link: esta tabela so
-- observa.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_invite_click_attempts (
  id          uuid primary key default gen_random_uuid(),
  invite_ref  uuid not null,
  invite_id   uuid references public.cmd_invites (id) on delete set null,
  client_id   uuid not null references public.cmd_clients (id) on delete cascade,
  generation  integer not null,

  -- 'HUMAN' recebe numero; 'PREVIEW' nunca recebe.
  kind         text not null default 'HUMAN',
  click_number integer,

  occurred_at timestamptz not null default now(),

  link_status text not null,
  outcome     text not null default 'PENDING',

  -- Lidos no servidor, na propria abertura.
  user_agent      text check (user_agent is null or length(user_agent) <= 512),
  accept_language text check (accept_language is null or length(accept_language) <= 128),
  ip_hash         text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),

  -- Derivados do User-Agent e complementados pela pagina.
  device_type      text check (device_type is null or length(device_type) <= 40),
  browser          text check (browser is null or length(browser) <= 40),
  os               text check (os is null or length(os) <= 40),
  platform         text check (platform is null or length(platform) <= 64),
  screen_width     integer check (screen_width is null
                     or (screen_width > 0 and screen_width <= 100000)),
  screen_height    integer check (screen_height is null
                     or (screen_height > 0 and screen_height <= 100000)),
  viewport_width   integer check (viewport_width is null
                     or (viewport_width > 0 and viewport_width <= 100000)),
  viewport_height  integer check (viewport_height is null
                     or (viewport_height > 0 and viewport_height <= 100000)),
  timezone         text check (timezone is null or length(timezone) <= 64),
  languages        text check (languages is null or length(languages) <= 128),
  max_touch_points integer check (max_touch_points is null
                     or (max_touch_points >= 0 and max_touch_points <= 64)),

  -- Momento em que a pagina mandou os dados complementares. Nulo enquanto
  -- nao chegaram: falhar aqui nunca bloqueia nada.
  signals_at  timestamptz,

  constraint cmd_invite_click_attempts_generation_check check (generation >= 1),
  constraint cmd_invite_click_attempts_kind_check check (kind in ('HUMAN', 'PREVIEW')),
  constraint cmd_invite_click_attempts_numero_check
    check ((kind = 'HUMAN' and click_number >= 1) or (kind = 'PREVIEW' and click_number is null)),
  constraint cmd_invite_click_attempts_status_check
    check (link_status in ('ACTIVE', 'CLAIMED', 'SUBMITTING', 'CONSUMED', 'EXPIRED', 'REVOKED')),
  constraint cmd_invite_click_attempts_outcome_check
    check (outcome in ('PENDING', 'ALLOWED', 'EXPIRED', 'TAKEN', 'CONSUMED', 'REVOKED',
                       'UNAVAILABLE', 'PREVIEW'))
);

-- Numeracao humana unica por link e geracao.
create unique index if not exists cmd_invite_click_attempts_numero_key
  on public.cmd_invite_click_attempts (invite_ref, generation, click_number)
  where click_number is not null;

create index if not exists cmd_invite_click_attempts_geracao_idx
  on public.cmd_invite_click_attempts (invite_ref, generation, occurred_at desc);
create index if not exists cmd_invite_click_attempts_client_idx
  on public.cmd_invite_click_attempts (client_id, occurred_at desc);
create index if not exists cmd_invite_click_attempts_occurred_idx
  on public.cmd_invite_click_attempts (occurred_at desc);
create index if not exists cmd_invite_click_attempts_outcome_idx
  on public.cmd_invite_click_attempts (outcome, occurred_at desc);

-- ---------------------------------------------------------------------------
-- 3. Abertura do link: registra o clique ANTES de qualquer liberacao
--
-- Nao escreve em cmd_invites. Nao reserva, nao renova, nao expira e nao
-- consome: apenas LE a situacao e grava a observacao.
--
-- Token sem geracao conhecida devolve zero linhas e nada e gravado.
--
-- O bloqueio da linha da geracao (`for update`) serializa a numeracao: dois
-- cliques ao mesmo tempo no mesmo link recebem numeros diferentes.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_click_open(
  p_token_hash      text,
  p_claim_hash      text,
  p_kind            text,
  p_user_agent      text,
  p_accept_language text,
  p_ip_hash         text,
  p_device_type     text,
  p_browser         text,
  p_os              text,
  p_platform        text
)
returns table (
  click_id     uuid,
  click_number integer,
  link_status  text,
  outcome      text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ger     record;
  v_invite  record;
  v_client  record;
  v_id      uuid;
  v_num     integer := null;
  v_status  text;
  v_outcome text;
  v_preview boolean := (p_kind = 'PREVIEW');
begin
  if p_kind is null or p_kind not in ('HUMAN', 'PREVIEW') then
    raise exception 'tipo de abertura invalido';
  end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'hash de rede invalido';
  end if;
  if p_claim_hash is not null and p_claim_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'reserva invalida';
  end if;

  -- Geracao conhecida? Sem isso nao existe clique para registrar.
  select g.id, g.invite_ref, g.invite_id, g.client_id, g.generation, g.expires_at
    into v_ger
    from public.cmd_invite_generations g
   where g.token_hash = p_token_hash
   for update;

  if v_ger.invite_ref is null then
    return;
  end if;

  select i.id, i.status, i.generation, i.claim_hash, i.active
    into v_invite
    from public.cmd_invites i
   where i.id = v_ger.invite_ref;

  select c.recruiting_active into v_client
    from public.cmd_clients c
   where c.id = v_ger.client_id;

  -- Situacao no instante da abertura.
  if v_invite.id is null or v_invite.generation <> v_ger.generation then
    -- Convite excluido, ou geracao ja substituida por outra.
    v_status := 'REVOKED';
  else
    v_status := v_invite.status;
  end if;

  if v_status in ('ACTIVE', 'CLAIMED', 'SUBMITTING') and v_ger.expires_at <= now() then
    v_status := 'EXPIRED';
  end if;

  -- Desfecho preliminar. O servidor do Next.js confirma depois e grava o
  -- desfecho final com cmd_invite_click_outcome.
  if v_preview then
    v_outcome := 'PREVIEW';
  elsif v_status = 'CONSUMED' then
    v_outcome := 'CONSUMED';
  elsif v_status = 'REVOKED' then
    v_outcome := 'REVOKED';
  elsif v_status = 'EXPIRED' then
    v_outcome := 'EXPIRED';
  elsif not coalesce(v_invite.active, false) or not coalesce(v_client.recruiting_active, false) then
    v_outcome := 'UNAVAILABLE';
  elsif v_status in ('CLAIMED', 'SUBMITTING')
        and v_invite.claim_hash is distinct from p_claim_hash then
    -- Ja reservado por OUTRO aparelho.
    v_outcome := 'TAKEN';
  else
    v_outcome := 'ALLOWED';
  end if;

  -- Numeracao humana, sob o bloqueio acima. Previa nunca recebe numero.
  if not v_preview then
    select coalesce(max(a.click_number), 0) + 1
      into v_num
      from public.cmd_invite_click_attempts a
     where a.invite_ref = v_ger.invite_ref
       and a.generation = v_ger.generation;
  end if;

  insert into public.cmd_invite_click_attempts
    (invite_ref, invite_id, client_id, generation, kind, click_number,
     link_status, outcome, user_agent, accept_language, ip_hash,
     device_type, browser, os, platform)
  values (v_ger.invite_ref, v_ger.invite_id, v_ger.client_id, v_ger.generation,
          p_kind, v_num, v_status, v_outcome,
          left(p_user_agent, 512), left(p_accept_language, 128), p_ip_hash,
          left(p_device_type, 40), left(p_browser, 40), left(p_os, 40), left(p_platform, 64))
  returning id into v_id;

  return query select v_id, v_num, v_status, v_outcome;
end
$$;

comment on function public.cmd_invite_click_open(text, text, text, text, text, text, text, text, text, text) is
  'Registra uma abertura do link de cadastro. So observa: nao reserva, nao renova, nao expira e nao consome.';

-- ---------------------------------------------------------------------------
-- 4. Desfecho final daquela abertura
--
-- Chamado pelo servidor logo depois de decidir o que a pessoa vai ver. So
-- sai de 'PENDING' ou do desfecho preliminar; nunca reabre nada.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_click_outcome(
  p_click_id uuid,
  p_outcome  text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_linhas integer;
begin
  if p_outcome is null or p_outcome not in
     ('ALLOWED', 'EXPIRED', 'TAKEN', 'CONSUMED', 'REVOKED', 'UNAVAILABLE', 'PREVIEW') then
    raise exception 'desfecho invalido';
  end if;

  update public.cmd_invite_click_attempts a
     set outcome = p_outcome
   where a.id = p_click_id
     and a.outcome <> p_outcome;

  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end
$$;

comment on function public.cmd_invite_click_outcome(uuid, text) is
  'Grava o desfecho final da abertura: liberado, expirado, reservado, consumido, revogado ou indisponivel.';

-- ---------------------------------------------------------------------------
-- 5. Complementacao unica dos dados do navegador daquele clique
--
-- Chega depois que a tela carrega — o formulario OU a tela de link
-- indisponivel. Atualiza SOMENTE o clique informado e so enquanto
-- `signals_at` estiver nulo: repetir nao sobrescreve nada.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_click_signals(
  p_click_id         uuid,
  p_device_type      text,
  p_browser          text,
  p_os               text,
  p_platform         text,
  p_screen_width     integer,
  p_screen_height    integer,
  p_viewport_width   integer,
  p_viewport_height  integer,
  p_timezone         text,
  p_languages        text,
  p_max_touch_points integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_linhas integer;
begin
  update public.cmd_invite_click_attempts a
     set device_type = coalesce(left(p_device_type, 40), a.device_type),
         browser = coalesce(left(p_browser, 40), a.browser),
         os = coalesce(left(p_os, 40), a.os),
         platform = coalesce(left(p_platform, 64), a.platform),
         screen_width = coalesce(p_screen_width, a.screen_width),
         screen_height = coalesce(p_screen_height, a.screen_height),
         viewport_width = coalesce(p_viewport_width, a.viewport_width),
         viewport_height = coalesce(p_viewport_height, a.viewport_height),
         timezone = coalesce(left(p_timezone, 64), a.timezone),
         languages = coalesce(left(p_languages, 128), a.languages),
         max_touch_points = coalesce(p_max_touch_points, a.max_touch_points),
         signals_at = now()
   where a.id = p_click_id
     and a.signals_at is null;

  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end
$$;

comment on function public.cmd_invite_click_signals(uuid, text, text, text, text, integer, integer, integer, integer, text, text, integer) is
  'Completa uma unica vez os dados do navegador daquele clique. Nao altera o link.';

-- ---------------------------------------------------------------------------
-- 6. A geracao passa a ser registrada quando o link nasce ou e renovado
--
-- Mesmas assinaturas da migration 020. O unico acrescimo e a linha imutavel
-- em cmd_invite_generations: e ela que mantem a geracao reconhecivel depois
-- de o hash ser substituido em cmd_invites.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_issue(
  p_user_id      uuid,
  p_token        text,
  p_token_hash   text,
  p_generated_by uuid
)
returns table (invite_id uuid, issued_at timestamptz, expires_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user     record;
  v_gerador  record;
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

  select u.id, u.name, u.role::text as role
    into v_gerador
    from public.cmd_users u
   where u.id = coalesce(p_generated_by, p_user_id);

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

    if v_atual.status in ('ACTIVE', 'CLAIMED', 'SUBMITTING') then
      insert into public.cmd_invite_events
        (invite_id, client_id, user_id, owner_name, owner_role, generation, event,
         generated_by_user_id, generated_by_name, generated_by_role)
      select v_id, v_user.client_id, v_user.id, v_user.name, v_user.role,
             v_atual.generation, 'REVOKED',
             v_gerador.id, v_gerador.name, v_gerador.role
       where not exists (
         select 1
           from public.cmd_invite_events e
          where e.invite_id = v_id
            and e.generation = v_atual.generation
            and e.event = 'REVOKED'
       );
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
           revoked_at = null,
           member_id = null,
           generation = v_geracao,
           owner_name = v_user.name,
           owner_role = v_user.role,
           generated_by_user_id = v_gerador.id,
           generated_by_name = v_gerador.name,
           generated_by_role = v_gerador.role
     where id = v_id;
  else
    insert into public.cmd_invites
      (client_id, user_id, token, token_hash, active, issued_at, expires_at, status,
       generation, owner_name, owner_role,
       generated_by_user_id, generated_by_name, generated_by_role)
    values (v_user.client_id, v_user.id, p_token, p_token_hash, true,
            v_agora, v_fim, 'ACTIVE', 1, v_user.name, v_user.role,
            v_gerador.id, v_gerador.name, v_gerador.role)
    returning id into v_id;
  end if;

  insert into public.cmd_invite_events
    (invite_id, client_id, user_id, owner_name, owner_role, generation, event,
     generated_by_user_id, generated_by_name, generated_by_role)
  select v_id, v_user.client_id, v_user.id, v_user.name, v_user.role, v_geracao, 'GENERATED',
         v_gerador.id, v_gerador.name, v_gerador.role
   where not exists (
     select 1
       from public.cmd_invite_events e
      where e.invite_id = v_id
        and e.generation = v_geracao
        and e.event = 'GENERATED'
   );

  -- Registro imutavel da geracao: e ele que reconhece este endereco depois
  -- que o hash em cmd_invites for substituido pela proxima renovacao.
  insert into public.cmd_invite_generations
    (invite_ref, invite_id, client_id, generation, token_hash, issued_at, expires_at,
     owner_user_id, owner_name, owner_role,
     generated_by_user_id, generated_by_name, generated_by_role)
  select v_id, v_id, v_user.client_id, v_geracao, p_token_hash, v_agora, v_fim,
         v_user.id, v_user.name, v_user.role,
         v_gerador.id, v_gerador.name, v_gerador.role
   where not exists (
     select 1
       from public.cmd_invite_generations g
      where g.invite_ref = v_id
        and g.generation = v_geracao
   );

  return query select v_id, v_agora, v_fim;
end
$$;

comment on function public.cmd_invite_issue(uuid, text, text, uuid) is
  'Gera ou renova o link pessoal, registrando dono, gerador e a geracao imutavel.';

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
  v_fim       timestamptz;
  v_hash      text;
begin
  if p_password_hash is not null
     and p_password_hash !~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$' then
    raise exception 'senha deve chegar como hash scrypt';
  end if;

  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'token invalido';
  end if;

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
  v_fim := v_agora + make_interval(secs => v_segundos);
  v_hash := encode(public.cmd_sha256(p_token), 'hex');

  insert into public.cmd_invites
    (client_id, user_id, token, token_hash, active, issued_at, expires_at, status,
     generation, owner_name, owner_role,
     generated_by_user_id, generated_by_name, generated_by_role)
  values (p_client_id, v_user_id, p_token, v_hash, true,
          v_agora, v_fim, 'ACTIVE', 1, p_name, 'EQUIPE', v_user_id, p_name, 'EQUIPE')
  returning id into v_invite_id;

  insert into public.cmd_invite_events
    (invite_id, client_id, user_id, owner_name, owner_role, generation, event,
     generated_by_user_id, generated_by_name, generated_by_role)
  values (v_invite_id, p_client_id, v_user_id, p_name, 'EQUIPE', 1, 'GENERATED',
          v_user_id, p_name, 'EQUIPE')
  on conflict (invite_id, generation, event) do nothing;

  insert into public.cmd_invite_generations
    (invite_ref, invite_id, client_id, generation, token_hash, issued_at, expires_at,
     owner_user_id, owner_name, owner_role,
     generated_by_user_id, generated_by_name, generated_by_role)
  values (v_invite_id, v_invite_id, p_client_id, 1, v_hash, v_agora, v_fim,
          v_user_id, p_name, 'EQUIPE', v_user_id, p_name, 'EQUIPE')
  on conflict (invite_ref, generation) do nothing;

  return v_user_id;
end
$$;

comment on function public.cmd_create_team_access(uuid, uuid, text, text, text, text) is
  'Cria o usuario EQUIPE, o link pessoal e o registro imutavel da geracao.';

-- ---------------------------------------------------------------------------
-- 7. RLS das tabelas novas: habilitado, forcado e sem policy nenhuma.
-- ---------------------------------------------------------------------------
alter table public.cmd_invite_generations    enable row level security;
alter table public.cmd_invite_click_attempts enable row level security;

alter table public.cmd_invite_generations    force row level security;
alter table public.cmd_invite_click_attempts force row level security;

-- ---------------------------------------------------------------------------
-- 8. Privilegios: apenas o servidor, pela chave secreta.
-- ---------------------------------------------------------------------------
do $$
declare
  tabelas constant text := '
    public.cmd_invite_generations,
    public.cmd_invite_click_attempts';
  funcoes constant text[] := array[
    'public.cmd_invite_click_open(text, text, text, text, text, text, text, text, text, text)',
    'public.cmd_invite_click_outcome(uuid, text)',
    'public.cmd_invite_click_signals(uuid, text, text, text, text, integer, integer, integer, integer, text, text, integer)',
    'public.cmd_invite_generations_guard()',
    'public.cmd_invite_issue(uuid, text, text, uuid)',
    'public.cmd_create_team_access(uuid, uuid, text, text, text, text)'
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
    execute format('grant select, insert, update on %s to service_role', tabelas);
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
-- 9. Comentarios de documentacao
-- ---------------------------------------------------------------------------
comment on table public.cmd_invite_generations is
  'Registro imutavel por geracao do link de cadastro: hash do token e snapshots. Reconhece geracoes antigas sem autorizar cadastro.';
comment on column public.cmd_invite_generations.token_hash is
  'SHA-256 do token daquela geracao. O token em texto puro nunca e guardado aqui.';

comment on table public.cmd_invite_click_attempts is
  'Uma linha por abertura do link de cadastro, inclusive expirado, reservado, consumido ou revogado. So observa.';
comment on column public.cmd_invite_click_attempts.kind is
  'HUMAN recebe numero de clique; PREVIEW e pre-visualizacao automatica e nunca recebe.';
comment on column public.cmd_invite_click_attempts.click_number is
  'Numeracao sequencial e atomica por link e geracao: 1o, 2o, 3o clique humano.';
comment on column public.cmd_invite_click_attempts.link_status is
  'Situacao do link no instante da abertura.';
comment on column public.cmd_invite_click_attempts.outcome is
  'Desfecho da abertura: ALLOWED, EXPIRED, TAKEN, CONSUMED, REVOKED, UNAVAILABLE ou PREVIEW.';
comment on column public.cmd_invite_click_attempts.ip_hash is
  'HMAC-SHA256 do IP publico, somente com DEVICE_IP_HMAC_KEY. Nunca sai do servidor.';

commit;
