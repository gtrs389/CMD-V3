-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 020: rastreamento completo dos links de recrutamento
--
-- Execute no SQL Editor do Supabase depois de 019_team_access_link_audience.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA transacao,
-- e idempotente (pode ser executada duas vezes seguidas sem efeito adicional)
-- e nao apaga dado nenhum: nao ha DROP TABLE, DROP COLUMN, DELETE nem
-- TRUNCATE. Nenhuma API externa e consultada.
--
-- ESCOPO: somente os links de CADASTRO/RECRUTAMENTO de pessoas, gerados pelo
-- Administrador do time (perfil CANDIDATE) e pelo integrante EQUIPE. O link
-- persistente de acesso ao painel do Time (cmd_team_access_links, migrations
-- 016 e 019) NAO e tocado aqui.
--
-- Reutiliza e amplia a estrutura da migration 013: continua UM convite por
-- usuario em public.cmd_invites, com historico por geracao em
-- public.cmd_invite_events. Nao existe um segundo sistema de tokens.
--
-- O que entra aqui:
--   1. snapshots de DONO e de QUEM GEROU, em cmd_invites e cmd_invite_events;
--   2. vinculo do convite com o integrante criado (member_id anulavel);
--   3. public.cmd_invite_access_devices - aparelho do PRIMEIRO acesso, um
--      registro por convite e geracao;
--   4. indices de Time, dono, gerador, status e datas;
--   5. funcoes de geracao, primeiro acesso e conclusao, ampliadas.
--
-- DONO x GERADOR:
--   `user_id`               - dono do link (o `owner_user_id` do pedido): a
--                             pessoa cuja hierarquia recebe o cadastro e que
--                             permanece como "Cadastrado por".
--   `generated_by_user_id`  - quem clicou para gerar ou renovar. Quando o
--                             ADMIN geral gera em nome de outra pessoa, ele
--                             aparece aqui e o dono continua sendo `user_id`.
--
-- Historico sobrevive a exclusao: todo identificador de pessoa e ANULAVEL
-- (`on delete set null`) e acompanhado de snapshot de nome e perfil.
--
-- O que NUNCA e guardado: token em texto puro no historico, URL do convite,
-- segredo da reserva, senha, CPF, titulo, retorno de consulta cadastral ou
-- IP em texto puro. O IP so aparece como HMAC, calculado no servidor do
-- Next.js quando DEVICE_IP_HMAC_KEY existe, e nunca chega ao navegador.
-- Nada de MAC, IMEI, numero de serie, GPS, canvas ou WebGL.
--
-- Todo instante e timestamptz calculado com now() (UTC) pelo banco. O
-- relogio do navegador nunca autoriza nem cronometra nada.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. cmd_invites: snapshots do dono, do gerador e do integrante criado
--
-- `user_id` ja e o dono do link desde a migration 012 e continua sendo: nao
-- existe coluna duplicada para a mesma informacao. O que faltava era o
-- snapshot (para o historico sobreviver a exclusao do usuario) e a
-- identificacao de quem executou a geracao.
-- ---------------------------------------------------------------------------
alter table public.cmd_invites
  add column if not exists owner_name            text,
  add column if not exists owner_role            text,
  add column if not exists generated_by_user_id  uuid,
  add column if not exists generated_by_name     text,
  add column if not exists generated_by_role     text,
  add column if not exists member_id             uuid;

do $$
begin
  -- Identificadores anulaveis: excluir a pessoa nao apaga o historico.
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_invites_generated_by_fkey'
  ) then
    alter table public.cmd_invites
      add constraint cmd_invites_generated_by_fkey
      foreign key (generated_by_user_id) references public.cmd_users (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cmd_invites_member_fkey'
  ) then
    alter table public.cmd_invites
      add constraint cmd_invites_member_fkey
      foreign key (member_id) references public.cmd_members (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cmd_invites_owner_role_check'
  ) then
    alter table public.cmd_invites add constraint cmd_invites_owner_role_check
      check (owner_role is null or owner_role in ('ADMIN', 'CANDIDATE', 'EQUIPE'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cmd_invites_generated_by_role_check'
  ) then
    alter table public.cmd_invites add constraint cmd_invites_generated_by_role_check
      check (generated_by_role is null or generated_by_role in ('ADMIN', 'CANDIDATE', 'EQUIPE'));
  end if;
end
$$;

-- Preenche o que ja existe, sem apagar nada. Link antigo nao sabe quem
-- clicou: assume-se o proprio dono, que era o unico caminho possivel ate
-- aqui.
update public.cmd_invites i
   set owner_name = coalesce(i.owner_name, u.name),
       owner_role = coalesce(i.owner_role, u.role::text)
  from public.cmd_users u
 where u.id = i.user_id
   and (i.owner_name is null or i.owner_role is null);

update public.cmd_invites i
   set generated_by_user_id = i.user_id,
       generated_by_name = coalesce(i.generated_by_name, i.owner_name),
       generated_by_role = coalesce(i.generated_by_role, i.owner_role)
 where i.generated_by_user_id is null
   and i.user_id is not null;

-- ---------------------------------------------------------------------------
-- 2. cmd_invite_events: quem gerou, qual integrante nasceu e historico que
--    sobrevive a exclusao das pessoas
--
-- Ate aqui o evento apontava para o convite com `on delete cascade`: excluir
-- o dono do link levava o convite junto e o historico inteiro sumia. Agora
-- existe `invite_ref`, um identificador ESTAVEL da geracao, que nunca e
-- apagado, e `invite_id` vira anulavel com `on delete set null`: o evento se
-- desliga do convite em vez de morrer com ele.
--
-- `invite_ref` e preenchido sozinho no INSERT (gatilho abaixo), entao as
-- funcoes da migration 013 que gravam eventos continuam iguais, sem
-- alteracao nenhuma.
--
-- O historico continua imutavel: o gatilho de guarda so passa a aceitar o
-- DESLIGAMENTO das chaves estrangeiras (pessoa ou convite excluidos), com
-- todos os snapshots e instantes intactos.
-- ---------------------------------------------------------------------------
alter table public.cmd_invite_events
  add column if not exists invite_ref           uuid,
  add column if not exists generated_by_user_id uuid,
  add column if not exists generated_by_name    text,
  add column if not exists generated_by_role    text,
  add column if not exists member_id            uuid;

-- A guarda antiga recusa QUALQUER update, inclusive o preenchimento abaixo.
-- Ela e recriada logo em seguida, ja com a regra nova.
drop trigger if exists cmd_invite_events_imutavel on public.cmd_invite_events;

update public.cmd_invite_events
   set invite_ref = invite_id
 where invite_ref is null;

alter table public.cmd_invite_events
  alter column invite_ref set not null;

alter table public.cmd_invite_events
  alter column invite_id drop not null;

do $$
begin
  -- O convite deixa de arrastar o historico junto quando e excluido.
  if exists (
    select 1 from pg_constraint where conname = 'cmd_invite_events_invite_id_fkey'
  ) then
    alter table public.cmd_invite_events drop constraint cmd_invite_events_invite_id_fkey;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cmd_invite_events_invite_fk'
  ) then
    alter table public.cmd_invite_events
      add constraint cmd_invite_events_invite_fk
      foreign key (invite_id) references public.cmd_invites (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cmd_invite_events_generated_by_fkey'
  ) then
    alter table public.cmd_invite_events
      add constraint cmd_invite_events_generated_by_fkey
      foreign key (generated_by_user_id) references public.cmd_users (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cmd_invite_events_member_fkey'
  ) then
    alter table public.cmd_invite_events
      add constraint cmd_invite_events_member_fkey
      foreign key (member_id) references public.cmd_members (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cmd_invite_events_generated_by_role_check'
  ) then
    alter table public.cmd_invite_events
      add constraint cmd_invite_events_generated_by_role_check
      check (generated_by_role is null
             or generated_by_role in ('ADMIN', 'CANDIDATE', 'EQUIPE'));
  end if;
end
$$;

-- Consulta por geracao continua barata depois do desligamento. NAO e unico
-- de proposito: a unicidade de "um evento por geracao" segue no indice
-- `cmd_invite_events_unicos_key` da 013, que e o alvo dos `on conflict`
-- daquelas funcoes.
create index if not exists cmd_invite_events_ref_idx
  on public.cmd_invite_events (invite_ref, generation, event);

-- `invite_ref` nasce igual a `invite_id`: as funcoes da 013 nao precisam
-- saber que esta coluna existe.
create or replace function public.cmd_invite_events_ref_fill()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.invite_ref := coalesce(new.invite_ref, new.invite_id);
  return new;
end
$$;

comment on function public.cmd_invite_events_ref_fill() is
  'Copia invite_id para invite_ref no INSERT: o historico guarda a geracao mesmo sem o convite.';

drop trigger if exists cmd_invite_events_ref on public.cmd_invite_events;
create trigger cmd_invite_events_ref
  before insert on public.cmd_invite_events
  for each row execute function public.cmd_invite_events_ref_fill();

-- ---------------------------------------------------------------------------
-- 2b. Guarda do historico, agora com o desligamento permitido
--
-- Continua recusando reescrita e exclusao. O que passa a ser aceito:
--
--   UPDATE  somente quando uma chave estrangeira vira NULL porque a pessoa
--           ou o convite foi excluido. Nome, perfil, geracao, evento e
--           instante permanecem exatamente iguais.
--   DELETE  somente quando o proprio Time ja foi excluido (cascata de
--           cmd_clients). Fora disso, historico nao se apaga.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_events_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Time excluido leva o proprio historico junto: nesta altura a linha de
    -- cmd_clients ja nao existe mais.
    if not exists (select 1 from public.cmd_clients c where c.id = old.client_id) then
      return old;
    end if;
    raise exception 'historico de links e imutavel';
  end if;

  if new.id = old.id
     and new.invite_ref = old.invite_ref
     and new.client_id = old.client_id
     and new.generation = old.generation
     and new.event = old.event
     and new.occurred_at = old.occurred_at
     and new.owner_name is not distinct from old.owner_name
     and new.owner_role is not distinct from old.owner_role
     and new.generated_by_name is not distinct from old.generated_by_name
     and new.generated_by_role is not distinct from old.generated_by_role
     and (new.invite_id is null or new.invite_id = old.invite_id)
     and (new.user_id is null or new.user_id = old.user_id)
     and (new.generated_by_user_id is null
          or new.generated_by_user_id = old.generated_by_user_id)
     and (new.member_id is null or new.member_id = old.member_id)
  then
    return new;
  end if;

  raise exception 'historico de links e imutavel';
end
$$;

comment on function public.cmd_invite_events_guard() is
  'Recusa reescrita e exclusao do historico. So aceita desligar chaves estrangeiras e a cascata do proprio Time.';

drop trigger if exists cmd_invite_events_imutavel on public.cmd_invite_events;
create trigger cmd_invite_events_imutavel
  before update or delete on public.cmd_invite_events
  for each row execute function public.cmd_invite_events_guard();

-- ---------------------------------------------------------------------------
-- 3. public.cmd_invite_access_devices: aparelho do PRIMEIRO acesso
--
-- Tabela propria porque os campos nao cabem em cmd_invite_events, que e uma
-- linha por acontecimento e imutavel: os sinais do navegador chegam em DOIS
-- momentos (o redirect inicial, com o que o servidor ja tem, e uma unica
-- complementacao depois que `/` carrega). Um registro por CONVITE e GERACAO,
-- garantido por indice unico: recarregar a pagina no mesmo aparelho nao cria
-- um segundo registro.
--
-- Somente os campos previstos. Nao existe coluna para MAC, IMEI, GPS, canvas
-- ou IP em texto puro, entao nem por engano algo assim e gravado.
--
-- `invite_ref` acompanha o historico: e o identificador estavel da geracao e
-- nunca some. `invite_id` se desliga (`on delete set null`) quando o convite
-- deixa de existir, entao excluir o dono nao apaga o que foi observado.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_invite_access_devices (
  id          uuid primary key default gen_random_uuid(),
  invite_ref  uuid not null,
  invite_id   uuid references public.cmd_invites (id) on delete set null,
  client_id   uuid not null references public.cmd_clients (id) on delete cascade,
  generation  integer not null default 1,

  -- Instante do primeiro clique, pelo horario do banco.
  first_access_at timestamptz not null default now(),

  -- Lidos no servidor, no proprio redirect.
  user_agent      text check (user_agent is null or length(user_agent) <= 512),
  accept_language text check (accept_language is null or length(accept_language) <= 128),

  -- HMAC do IP publico, somente quando DEVICE_IP_HMAC_KEY existe no
  -- ambiente. O endereco puro nunca e gravado, nem em log.
  ip_hash         text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),

  -- Derivados do User-Agent no servidor e complementados pela pagina.
  device_type     text check (device_type is null or length(device_type) <= 40),
  browser         text check (browser is null or length(browser) <= 40),
  os              text check (os is null or length(os) <= 40),
  platform        text check (platform is null or length(platform) <= 64),
  screen_width    integer check (screen_width is null
                    or (screen_width > 0 and screen_width <= 100000)),
  screen_height   integer check (screen_height is null
                    or (screen_height > 0 and screen_height <= 100000)),
  timezone        text check (timezone is null or length(timezone) <= 64),
  languages       text check (languages is null or length(languages) <= 128),
  max_touch_points integer check (max_touch_points is null
                    or (max_touch_points >= 0 and max_touch_points <= 64)),

  -- Momento da unica complementacao vinda da pagina. Nulo enquanto ela nao
  -- chegou: a falha em coletar nunca bloqueia o formulario.
  signals_at      timestamptz,

  constraint cmd_invite_access_devices_generation_check check (generation >= 1)
);

-- Um aparelho por convite e geracao.
create unique index if not exists cmd_invite_access_devices_unico_key
  on public.cmd_invite_access_devices (invite_ref, generation);

create index if not exists cmd_invite_access_devices_client_idx
  on public.cmd_invite_access_devices (client_id, first_access_at desc);

-- ---------------------------------------------------------------------------
-- 4. Indices de consulta: Time, dono, gerador, status e datas
-- ---------------------------------------------------------------------------
create index if not exists cmd_invites_client_idx        on public.cmd_invites (client_id);
create index if not exists cmd_invites_user_idx          on public.cmd_invites (user_id);
create index if not exists cmd_invites_generated_by_idx  on public.cmd_invites (generated_by_user_id);
create index if not exists cmd_invites_status_idx        on public.cmd_invites (status);
create index if not exists cmd_invites_issued_at_idx     on public.cmd_invites (issued_at desc);
create index if not exists cmd_invites_claimed_at_idx    on public.cmd_invites (claimed_at desc);
create index if not exists cmd_invites_consumed_at_idx   on public.cmd_invites (consumed_at desc);
create index if not exists cmd_invites_member_idx        on public.cmd_invites (member_id);

create index if not exists cmd_invite_events_generated_by_idx
  on public.cmd_invite_events (generated_by_user_id, occurred_at desc);
create index if not exists cmd_invite_events_event_idx
  on public.cmd_invite_events (event, occurred_at desc);
create index if not exists cmd_invite_events_invite_idx
  on public.cmd_invite_events (invite_id, generation);

-- ---------------------------------------------------------------------------
-- 5. Geracao do link, agora registrando QUEM executou
--
-- A funcao de tres argumentos da migration 013 continua existindo, com o
-- mesmo comportamento, e apenas delega: assim nada que ja chamava o nome
-- antigo quebra, e nao ha ambiguidade de assinatura (a versao nova exige os
-- quatro argumentos, sem valor padrao).
--
-- Token: chega pronto do servidor, com alta entropia, diferente a cada
-- geracao. O banco guarda o hash SHA-256 para a busca; o valor em claro fica
-- em cmd_invites.token apenas para o dono poder copiar o proprio link de
-- novo, e NUNCA entra no historico nem em log.
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

  -- Quem executou a geracao. Sem informacao, assume-se o proprio dono.
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

    -- A geracao anterior morre agora: o token anterior deixa de valer.
    --
    -- O evento e inserido com `where not exists` e colunas qualificadas, e
    -- nao com `on conflict (invite_id, ...)`: nesta funcao `invite_id`
    -- tambem e nome de coluna de saida (`returns table`), e o PostgreSQL
    -- recusaria a referencia como ambigua (42702).
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
           -- A geracao nova nasce limpa. A revogacao da anterior fica no
           -- evento REVOKED, que preserva o instante exato.
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

  return query select v_id, v_agora, v_fim;
end
$$;

comment on function public.cmd_invite_issue(uuid, text, text, uuid) is
  'Gera ou renova o link pessoal, registrando dono e quem executou a geracao.';

-- Assinatura antiga preservada: delega para a versao completa, sem gerador
-- informado (o proprio dono).
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
begin
  return query
    select f.invite_id, f.issued_at, f.expires_at
      from public.cmd_invite_issue(p_user_id, p_token, p_token_hash, null::uuid) f;
end
$$;

comment on function public.cmd_invite_issue(uuid, text, text) is
  'Compatibilidade com a migration 013: gera o link com o proprio dono como gerador.';

-- ---------------------------------------------------------------------------
-- 5b. cmd_create_team_access: o link do integrante ja nasce rastreado
--
-- Mesma assinatura e mesmo comportamento da migration 013. O que muda e o
-- preenchimento dos snapshots: o integrante e dono e gerador do proprio
-- link, porque ele nasce junto com o acesso dele.
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
    (client_id, user_id, token, token_hash, active, issued_at, expires_at, status,
     generation, owner_name, owner_role,
     generated_by_user_id, generated_by_name, generated_by_role)
  values (p_client_id, v_user_id, p_token, encode(public.cmd_sha256(p_token), 'hex'), true,
          v_agora, v_agora + make_interval(secs => v_segundos), 'ACTIVE',
          1, p_name, 'EQUIPE', v_user_id, p_name, 'EQUIPE')
  returning id into v_invite_id;

  insert into public.cmd_invite_events
    (invite_id, client_id, user_id, owner_name, owner_role, generation, event,
     generated_by_user_id, generated_by_name, generated_by_role)
  values (v_invite_id, p_client_id, v_user_id, p_name, 'EQUIPE', 1, 'GENERATED',
          v_user_id, p_name, 'EQUIPE')
  on conflict (invite_id, generation, event) do nothing;

  return v_user_id;
end
$$;

comment on function public.cmd_create_team_access(uuid, uuid, text, text, text, text) is
  'Cria o usuario EQUIPE e o link pessoal (com prazo, historico e rastreamento).';

-- ---------------------------------------------------------------------------
-- 6. Primeiro acesso: sinais que o servidor ja tem no redirect
--
-- Roda logo depois da reserva (cmd_invite_claim), na mesma abertura do link.
-- Grava UM registro por convite e geracao: recarregar a pagina no mesmo
-- aparelho nao cria outro, e nao sobrescreve o que ja foi observado.
--
-- Nao altera status, prazo nem reserva: quem cuida disso e cmd_invite_claim.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_access_record(
  p_token_hash      text,
  p_user_agent      text,
  p_accept_language text,
  p_ip_hash         text,
  p_device_type     text,
  p_browser         text,
  p_os              text,
  p_platform        text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invite record;
begin
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'hash de rede invalido';
  end if;

  select i.id, i.client_id, i.generation
    into v_invite
    from public.cmd_invites i
   where i.token_hash = p_token_hash;

  if v_invite.id is null then
    return false;
  end if;

  insert into public.cmd_invite_access_devices
    (invite_ref, invite_id, client_id, generation, user_agent, accept_language, ip_hash,
     device_type, browser, os, platform)
  values (v_invite.id, v_invite.id, v_invite.client_id, v_invite.generation,
          left(p_user_agent, 512), left(p_accept_language, 128), p_ip_hash,
          left(p_device_type, 40), left(p_browser, 40), left(p_os, 40),
          left(p_platform, 64))
  on conflict (invite_ref, generation) do nothing;

  return true;
end
$$;

comment on function public.cmd_invite_access_record(text, text, text, text, text, text, text, text) is
  'Registra o aparelho do primeiro acesso com os sinais disponiveis no servidor.';

-- ---------------------------------------------------------------------------
-- 7. Complementacao unica, autenticada pela reserva
--
-- Depois que `/` carrega, a pagina envia UMA vez os sinais que so o
-- navegador conhece. So e aceita para a reserva correta (o SHA-256 do
-- segredo do cookie) e so enquanto `signals_at` estiver nulo: repetir nao
-- sobrescreve nada. Falhar aqui nunca bloqueia o formulario.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_access_signals(
  p_token_hash      text,
  p_claim_hash      text,
  p_device_type     text,
  p_browser         text,
  p_os              text,
  p_platform        text,
  p_screen_width    integer,
  p_screen_height   integer,
  p_timezone        text,
  p_languages       text,
  p_max_touch_points integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invite record;
  v_linhas integer;
begin
  if p_claim_hash is null or p_claim_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select i.id, i.generation
    into v_invite
    from public.cmd_invites i
   where i.token_hash = p_token_hash
     and i.claim_hash = p_claim_hash;

  if v_invite.id is null then
    return false;
  end if;

  update public.cmd_invite_access_devices d
     set device_type = coalesce(left(p_device_type, 40), d.device_type),
         browser = coalesce(left(p_browser, 40), d.browser),
         os = coalesce(left(p_os, 40), d.os),
         platform = coalesce(left(p_platform, 64), d.platform),
         screen_width = coalesce(p_screen_width, d.screen_width),
         screen_height = coalesce(p_screen_height, d.screen_height),
         timezone = coalesce(left(p_timezone, 64), d.timezone),
         languages = coalesce(left(p_languages, 128), d.languages),
         max_touch_points = coalesce(p_max_touch_points, d.max_touch_points),
         signals_at = now()
   where d.invite_ref = v_invite.id
     and d.generation = v_invite.generation
     and d.signals_at is null;

  get diagnostics v_linhas = row_count;
  return v_linhas > 0;
end
$$;

comment on function public.cmd_invite_access_signals(text, text, text, text, text, text, integer, integer, text, text, integer) is
  'Complementa uma unica vez o aparelho do primeiro acesso, pela reserva do cookie.';

-- ---------------------------------------------------------------------------
-- 8. Conclusao do cadastro, vinculada ao integrante criado
--
-- A versao de um argumento da migration 013 continua existindo e delega. O
-- dono do link permanece o responsavel imutavel em "Cadastrado por": esta
-- funcao nunca o altera.
--
-- CONSUMED e definitivo e o indice unico do historico impede evento
-- duplicado: repetir a requisicao nao cria outro registro.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_consume(
  p_token_hash text,
  p_member_id  uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invite record;
begin
  select i.id, i.client_id, i.user_id, i.status, i.generation,
         i.owner_name, i.owner_role, i.member_id,
         i.generated_by_user_id, i.generated_by_name, i.generated_by_role
    into v_invite
    from public.cmd_invites i
   where i.token_hash = p_token_hash
   for update;

  if v_invite.id is null then
    return false;
  end if;

  -- Consumido e definitivo: nunca volta para tras e nao duplica evento.
  if v_invite.status = 'CONSUMED' then
    if v_invite.member_id is null and p_member_id is not null then
      update public.cmd_invites set member_id = p_member_id where id = v_invite.id;
    end if;
    return true;
  end if;

  update public.cmd_invites
     set status = 'CONSUMED',
         consumed_at = now(),
         active = false,
         member_id = coalesce(p_member_id, member_id)
   where id = v_invite.id;

  -- Exatamente UMA linha, com ou sem o dono ainda existindo: o snapshot do
  -- convite vem primeiro e a consulta ao usuario e apenas reserva.
  insert into public.cmd_invite_events
    (invite_id, client_id, user_id, owner_name, owner_role, generation, event,
     generated_by_user_id, generated_by_name, generated_by_role, member_id)
  values (
    v_invite.id, v_invite.client_id, v_invite.user_id,
    coalesce(v_invite.owner_name,
             (select u.name from public.cmd_users u where u.id = v_invite.user_id)),
    coalesce(v_invite.owner_role,
             (select u.role::text from public.cmd_users u where u.id = v_invite.user_id)),
    v_invite.generation, 'CONSUMED',
    v_invite.generated_by_user_id, v_invite.generated_by_name,
    v_invite.generated_by_role, p_member_id
  )
  on conflict (invite_id, generation, event) do nothing;

  return true;
end
$$;

comment on function public.cmd_invite_consume(text, uuid) is
  'Fecha o link em definitivo e vincula o integrante criado, sem trocar o dono.';

create or replace function public.cmd_invite_consume(p_token_hash text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return public.cmd_invite_consume(p_token_hash, null::uuid);
end
$$;

comment on function public.cmd_invite_consume(text) is
  'Compatibilidade com a migration 013: conclui o link sem vincular integrante.';

-- ---------------------------------------------------------------------------
-- 9. RLS da tabela nova
--
-- Habilitado e forcado, sem nenhuma policy: ninguem le nem escreve com as
-- chaves publicas. O acesso e somente pelo servidor, com a chave secreta.
-- ---------------------------------------------------------------------------
alter table public.cmd_invite_access_devices enable row level security;
alter table public.cmd_invite_access_devices force row level security;

-- ---------------------------------------------------------------------------
-- 10. Privilegios: apenas o servidor, pela chave secreta.
-- ---------------------------------------------------------------------------
do $$
declare
  tabelas constant text := 'public.cmd_invite_access_devices';
  funcoes constant text[] := array[
    'public.cmd_invite_issue(uuid, text, text, uuid)',
    'public.cmd_invite_issue(uuid, text, text)',
    'public.cmd_create_team_access(uuid, uuid, text, text, text, text)',
    'public.cmd_invite_access_record(text, text, text, text, text, text, text, text)',
    'public.cmd_invite_access_signals(text, text, text, text, text, text, integer, integer, text, text, integer)',
    'public.cmd_invite_consume(text, uuid)',
    'public.cmd_invite_consume(text)',
    'public.cmd_invite_events_guard()',
    'public.cmd_invite_events_ref_fill()'
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
-- 11. Comentarios de documentacao
-- ---------------------------------------------------------------------------
comment on table public.cmd_invite_access_devices is
  'Aparelho do primeiro acesso ao link de recrutamento. Um por convite e geracao. Sem IP puro, MAC, IMEI, GPS ou canvas.';
comment on column public.cmd_invite_access_devices.first_access_at is
  'Instante do primeiro clique no link, pelo horario do banco (UTC).';
comment on column public.cmd_invite_access_devices.ip_hash is
  'HMAC-SHA256 do IP publico, somente com DEVICE_IP_HMAC_KEY. Nunca sai do servidor.';
comment on column public.cmd_invite_access_devices.signals_at is
  'Momento da unica complementacao vinda da pagina. Nulo enquanto nao chegou.';

comment on column public.cmd_invites.owner_name is
  'Nome do dono do link no momento da geracao. Preserva o historico se o usuario for excluido.';
comment on column public.cmd_invites.owner_role is
  'Perfil do dono na geracao: CANDIDATE (Administrador do time) ou EQUIPE.';
comment on column public.cmd_invites.generated_by_user_id is
  'Quem clicou para gerar ou renovar. Pode ser o ADMIN geral agindo em nome do dono. Anulavel.';
comment on column public.cmd_invites.generated_by_name is
  'Nome de quem executou a geracao, no momento dela.';
comment on column public.cmd_invites.generated_by_role is
  'Perfil de quem executou a geracao.';
comment on column public.cmd_invites.member_id is
  'Integrante criado por este convite. Anulavel: excluir o integrante nao apaga o historico.';

comment on column public.cmd_invite_events.generated_by_user_id is
  'Quem executou a geracao do link. Anulavel, com snapshot de nome e perfil ao lado.';
comment on column public.cmd_invite_events.member_id is
  'Integrante criado, gravado no evento CONSUMED. Anulavel.';
comment on column public.cmd_invite_events.invite_ref is
  'Identificador estavel da geracao. Sobrevive a exclusao do convite e agrupa o historico.';

commit;
