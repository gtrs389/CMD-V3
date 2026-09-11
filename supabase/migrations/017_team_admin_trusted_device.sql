-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 017: aparelho confiavel do Administrador do time
--
-- Execute no SQL Editor do Supabase depois de 016_team_admin_phone_access.sql.
-- Nao altera as anteriores. Idempotente, transacional e sem DROP TABLE,
-- DROP COLUMN, DELETE ou TRUNCATE: nenhum dado antigo e apagado.
--
-- O que muda:
--   1. Cada Administrador do time passa a ter UM navegador autorizado. O
--      vinculo nasce no primeiro acesso valido e vale ate o ADMIN geral
--      liberar outro aparelho.
--   2. O que autoriza e uma credencial secreta do proprio aparelho, sorteada
--      no servidor e devolvida apenas em cookie HttpOnly. O banco guarda
--      somente o SHA-256 dela: o valor puro nunca e gravado.
--   3. As demais colunas sao AUDITORIA e nada mais. Elas nunca substituem a
--      credencial secreta na hora de decidir o acesso.
--   4. A sessao passa a apontar para o aparelho que a abriu, e a conferencia
--      acontece em toda requisicao autenticada, nao so no login.
--
-- Nada de MAC, IMEI, numero de serie, GPS, canvas ou WebGL: o navegador nao
-- fornece isso e o sistema nao tenta obter.
--
-- O ADMIN geral continua com e-mail e senha e NAO entra nesta regra.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Aparelhos confiaveis dos usuarios administrativos
--
-- Tabela propria de proposito: `cmd_member_devices` pertence aos integrantes
-- recrutados pelo link publico, onde o registro e apenas observacao e nunca
-- autoriza nada. Aqui e o contrario: esta linha DECIDE o acesso.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_admin_devices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.cmd_users (id) on delete cascade,

  -- SHA-256 da credencial secreta do aparelho. O valor puro vive somente no
  -- cookie HttpOnly do navegador e nunca chega ao banco, ao JSON ou ao log.
  device_token_hash text not null check (device_token_hash ~ '^[0-9a-f]{64}$'),

  active     boolean not null default true,

  -- Auditoria. Todos opcionais: a ausencia nunca decide nada.
  device_type      text check (device_type is null or length(device_type) <= 40),
  browser          text check (browser is null or length(browser) <= 40),
  os               text check (os is null or length(os) <= 40),
  platform         text check (platform is null or length(platform) <= 64),
  user_agent       text check (user_agent is null or length(user_agent) <= 512),
  screen_width     integer check (screen_width is null
                     or (screen_width > 0 and screen_width <= 100000)),
  screen_height    integer check (screen_height is null
                     or (screen_height > 0 and screen_height <= 100000)),
  timezone         text check (timezone is null or length(timezone) <= 64),
  languages        text check (languages is null or length(languages) <= 64),
  max_touch_points integer check (max_touch_points is null
                     or (max_touch_points >= 0 and max_touch_points <= 64)),

  -- HMAC do IP publico, somente quando DEVICE_IP_HMAC_KEY existe no
  -- ambiente. O endereco puro nunca e gravado.
  ip_hash          text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),

  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz
);

-- Um unico aparelho ATIVO por administrador. E este indice que impede duas
-- tentativas simultaneas de autorizarem dois navegadores.
create unique index if not exists cmd_admin_devices_user_active_key
  on public.cmd_admin_devices (user_id)
  where active;

create index if not exists cmd_admin_devices_user_id_idx
  on public.cmd_admin_devices (user_id);

-- A mesma credencial nunca vale para dois usuarios ao mesmo tempo.
create unique index if not exists cmd_admin_devices_token_active_key
  on public.cmd_admin_devices (device_token_hash)
  where active;

-- ---------------------------------------------------------------------------
-- 2. A sessao guarda o aparelho que a abriu
--
-- Sem isso a conferencia so aconteceria no login, e um cookie trocado depois
-- continuaria valendo ate o fim da sessao.
-- ---------------------------------------------------------------------------
alter table public.cmd_sessions
  add column if not exists admin_device_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_sessions_admin_device_fk'
  ) then
    alter table public.cmd_sessions
      add constraint cmd_sessions_admin_device_fk
      foreign key (admin_device_id)
      references public.cmd_admin_devices (id) on delete set null;
  end if;
end
$$;

create index if not exists cmd_sessions_admin_device_id_idx
  on public.cmd_sessions (admin_device_id)
  where admin_device_id is not null;

-- ---------------------------------------------------------------------------
-- 3. RLS e privilegios
-- ---------------------------------------------------------------------------
alter table public.cmd_admin_devices enable row level security;
alter table public.cmd_admin_devices force row level security;

do $$
declare
  papel text;
begin
  foreach papel in array array['public', 'anon', 'authenticated']
  loop
    if papel = 'public' then
      execute 'revoke all on table public.cmd_admin_devices from public';
    elsif exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on table public.cmd_admin_devices from %I', papel);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.cmd_admin_devices '
         || 'to service_role';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Primeiro vinculo, atomico
--
-- A linha do usuario e travada (`for update`) antes de qualquer leitura do
-- aparelho: duas tentativas simultaneas entram em fila, e a segunda ja
-- enxerga o aparelho criado pela primeira. O indice unico parcial fecha a
-- porta mesmo que a trava falhe.
--
--   sem aparelho ativo          -> cria o vinculo e devolve o id
--   aparelho ativo, hash igual  -> devolve o mesmo id (acesso permitido)
--   aparelho ativo, hash outro  -> devolve null (acesso recusado)
--
-- Quem chama nunca sabe qual dos casos aconteceu: a rota responde sempre a
-- mesma mensagem generica.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_admin_device_bind(
  p_user_id          uuid,
  p_token_hash       text,
  p_device_type      text default null,
  p_browser          text default null,
  p_os               text default null,
  p_platform         text default null,
  p_user_agent       text default null,
  p_screen_width     integer default null,
  p_screen_height    integer default null,
  p_timezone         text default null,
  p_languages        text default null,
  p_max_touch_points integer default null,
  p_ip_hash          text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id   uuid;
  v_device_id uuid;
  v_hash      text;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'credencial de aparelho invalida';
  end if;

  -- Trava a linha do administrador: serializa o primeiro vinculo.
  select u.id
    into v_user_id
    from public.cmd_users u
   where u.id = p_user_id
     and u.is_active
     and u.role = 'CANDIDATE'
     and u.team_person_id is not null
     for update;

  if v_user_id is null then
    return null;
  end if;

  select d.id, d.device_token_hash
    into v_device_id, v_hash
    from public.cmd_admin_devices d
   where d.user_id = v_user_id
     and d.active
   limit 1;

  if v_device_id is null then
    insert into public.cmd_admin_devices
      (user_id, device_token_hash, active, device_type, browser, os, platform,
       user_agent, screen_width, screen_height, timezone, languages,
       max_touch_points, ip_hash)
    values
      (v_user_id, p_token_hash, true, p_device_type, p_browser, p_os, p_platform,
       p_user_agent, p_screen_width, p_screen_height, p_timezone, p_languages,
       p_max_touch_points, p_ip_hash)
    returning id into v_device_id;

    return v_device_id;
  end if;

  -- Aparelho ja autorizado: so passa quem apresentar a mesma credencial.
  if v_hash is distinct from p_token_hash then
    return null;
  end if;

  update public.cmd_admin_devices
     set last_seen_at      = now(),
         device_type       = coalesce(p_device_type, device_type),
         browser           = coalesce(p_browser, browser),
         os                = coalesce(p_os, os),
         platform          = coalesce(p_platform, platform),
         user_agent        = coalesce(p_user_agent, user_agent),
         screen_width      = coalesce(p_screen_width, screen_width),
         screen_height     = coalesce(p_screen_height, screen_height),
         timezone          = coalesce(p_timezone, timezone),
         languages         = coalesce(p_languages, languages),
         max_touch_points  = coalesce(p_max_touch_points, max_touch_points),
         ip_hash           = coalesce(p_ip_hash, ip_hash)
   where id = v_device_id;

  return v_device_id;
end;
$$;

comment on function public.cmd_admin_device_bind is
  'Vincula (ou reconhece) o aparelho do Administrador do time. Devolve o id do aparelho autorizado ou null quando o acesso deve ser recusado.';

-- ---------------------------------------------------------------------------
-- 5. Conferencia em toda requisicao autenticada
--
-- Exige: aparelho ativo, credencial correspondente ao hash guardado e
-- aparelho pertencente ao MESMO usuario da sessao.
--
-- `last_seen_at` so e regravado a cada cinco minutos: a conferencia roda em
-- toda requisicao e nao pode virar uma escrita por clique.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_admin_device_check(
  p_user_id    uuid,
  p_device_id  uuid,
  p_token_hash text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or p_device_id is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;

  select d.id
    into v_id
    from public.cmd_admin_devices d
   where d.id = p_device_id
     and d.user_id = p_user_id
     and d.active
     and d.device_token_hash = p_token_hash;

  if v_id is null then
    return false;
  end if;

  update public.cmd_admin_devices
     set last_seen_at = now()
   where id = v_id
     and last_seen_at < now() - interval '5 minutes';

  return true;
end;
$$;

comment on function public.cmd_admin_device_check is
  'Confere o aparelho da sessao do Administrador do time: ativo, credencial correta e do mesmo usuario.';

-- ---------------------------------------------------------------------------
-- 6. Liberar novo aparelho
--
-- Revoga o aparelho atual e derruba as sessoes do usuario, na mesma
-- transacao. Telefone, nome, foto, time e link ficam como estao: o proximo
-- acesso correto vincula um aparelho novo.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_admin_device_release(p_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_revogados integer;
begin
  with revogados as (
    update public.cmd_admin_devices
       set active     = false,
           revoked_at = now()
     where user_id = p_user_id
       and active
    returning 1
  )
  select count(*) into v_revogados from revogados;

  update public.cmd_sessions
     set revoked_at = now()
   where user_id = p_user_id
     and revoked_at is null;

  return v_revogados;
end;
$$;

comment on function public.cmd_admin_device_release is
  'Revoga o aparelho autorizado e todas as sessoes do usuario. O proximo acesso valido vincula um aparelho novo.';

-- ---------------------------------------------------------------------------
-- 7. Privilegios das funcoes
-- ---------------------------------------------------------------------------
do $$
declare
  assinatura text;
  papel      text;
begin
  foreach assinatura in array array[
    'public.cmd_admin_device_bind(uuid, text, text, text, text, text, text, '
      || 'integer, integer, text, text, integer, text)',
    'public.cmd_admin_device_check(uuid, uuid, text)',
    'public.cmd_admin_device_release(uuid)'
  ]
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
-- 8. Sessoes abertas dos Administradores do time caem
--
-- Elas nasceram antes de existir aparelho vinculado. Depois do deploy, o
-- primeiro acesso valido de cada um cria o vinculo. O ADMIN geral nao e
-- tocado: nenhuma sessao de ADMIN e revogada aqui.
-- ---------------------------------------------------------------------------
update public.cmd_sessions s
   set revoked_at = now()
  from public.cmd_users u
 where s.user_id = u.id
   and u.role = 'CANDIDATE'
   and u.team_person_id is not null
   and s.revoked_at is null;

-- ---------------------------------------------------------------------------
-- 9. Comentarios
-- ---------------------------------------------------------------------------
comment on table public.cmd_admin_devices is
  'Aparelho autorizado do Administrador do time: um ativo por usuario. Guarda apenas o SHA-256 da credencial secreta do cookie; as demais colunas sao auditoria e nunca decidem o acesso. Separada de cmd_member_devices, que e dos integrantes recrutados.';
comment on column public.cmd_admin_devices.device_token_hash is
  'SHA-256 da credencial secreta do aparelho. O valor puro existe somente no cookie HttpOnly.';
comment on column public.cmd_sessions.admin_device_id is
  'Aparelho que abriu a sessao do Administrador do time. Conferido em toda requisicao autenticada.';

commit;
