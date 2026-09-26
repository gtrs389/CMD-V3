-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 045: o ADMIN geral entra no painel de uma pessoa do time
--
-- Execute no SQL Editor do Supabase depois de 044_formulario_2_no_painel.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Nenhuma API externa e consultada.
--
-- POR QUE ELA EXISTE
--
-- O ADMIN geral ja enxerga a ficha de qualquer pessoa. O que faltava era
-- ver — e usar — o PAINEL dela: a tela que ela abre, com a equipe dela, o
-- link dela e os numeros dela. Sem isso, socorrer alguem por telefone e
-- adivinhacao.
--
-- ENTRAR COMO A PESSOA E AGIR POR ELA. O sistema inteiro foi construido em
-- cima de "quem fez o que": "Cadastrado por", o dono de cada link, o
-- historico imutavel dos convites. Uma sessao aberta assim escreve nesses
-- registros com o nome da pessoa — e por isso ela deixa RASTRO PROPRIO
-- aqui, com quem abriu, em nome de quem, quando comecou e quando terminou.
--
-- O QUE ELA CRIA
--
--   1. public.cmd_sessions.impersonated_by - a sessao diz quem a abriu. Nula
--      em toda sessao normal, que e como todas as existentes ficam;
--   2. public.cmd_impersonations - a autorizacao de uso unico E o registro
--      do que aconteceu: a mesma linha nasce como convite de entrada e
--      termina como auditoria;
--   3. cmd_impersonation_claim - consome a autorizacao UMA vez, no banco;
--   4. cmd_impersonation_end - encerra a sessao e fecha o registro.
--
-- O QUE NUNCA E GUARDADO: o token da autorizacao em texto puro (so o hash
-- SHA-256, como em toda credencial deste banco), senha, CPF, titulo ou IP.
--
-- QUEM PODE SER INSPECIONADO: Administrador do time e equipe. ADMIN geral
-- nao entra no painel de outro ADMIN geral — a regra esta na funcao de
-- consumo, e nao apenas na tela.
--
-- Todo instante e timestamptz calculado com now() (UTC) pelo banco.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. A sessao diz quem a abriu
--
-- Anulavel e `on delete set null`: excluir o ADMIN nao apaga nem derruba a
-- sessao, e o registro do que aconteceu fica em cmd_impersonations, com o
-- nome guardado ao lado.
-- ---------------------------------------------------------------------------
alter table public.cmd_sessions
  add column if not exists impersonated_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_sessions_impersonated_by_fkey'
  ) then
    alter table public.cmd_sessions
      add constraint cmd_sessions_impersonated_by_fkey
      foreign key (impersonated_by) references public.cmd_users (id)
      on delete set null;
  end if;
end
$$;

-- As sessoes abertas assim sao poucas e sao consultadas por pessoa: o
-- indice parcial nao pesa nas sessoes normais, que sao a maioria absoluta.
create index if not exists cmd_sessions_impersonated_idx
  on public.cmd_sessions (impersonated_by)
  where impersonated_by is not null;

comment on column public.cmd_sessions.impersonated_by is
  'ADMIN geral que abriu esta sessao no painel de outra pessoa (migration '
  '045). Nulo em toda sessao normal.';

-- ---------------------------------------------------------------------------
-- 2. cmd_impersonations: a autorizacao de uso unico e o registro do que
--    aconteceu, na mesma linha
--
-- POR QUE UMA AUTORIZACAO, E NAO UM BOTAO QUE JA ABRE A SESSAO
--
-- Em producao o ADMIN geral trabalha em um endereco exclusivo, e a sessao
-- dele so vale la; o painel da equipe e do Administrador do time e `painel.`
-- e sessao de outro perfil so vale nesse outro endereco. Um cookie nao
-- atravessa essa fronteira. Entao o painel do ADMIN emite uma autorizacao
-- curta, de uso unico, e a pessoa do outro endereco e quem a troca por uma
-- sessao — o mesmo desenho do link de acesso do time.
--
-- Prazo curto de proposito: a autorizacao vale poucos minutos, o suficiente
-- para abrir a aba. Quem a interceptasse depois disso nao acha nada.
--
-- Os nomes ficam gravados ao lado dos identificadores: excluir a pessoa ou
-- o ADMIN anula a chave estrangeira e o registro continua legivel.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_impersonations (
  id uuid primary key default gen_random_uuid(),

  -- SHA-256 do token da autorizacao. O valor original existe uma unica vez,
  -- na resposta ao painel do ADMIN, e nunca e gravado.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),

  admin_user_id uuid references public.cmd_users (id) on delete set null,
  admin_name    text not null,

  target_user_id uuid references public.cmd_users (id) on delete set null,
  target_name    text not null,
  target_role    text not null check (target_role in ('CANDIDATE', 'EQUIPE')),
  -- Time da pessoa inspecionada: e por ele que o registro e lido depois.
  client_id uuid references public.cmd_clients (id) on delete set null,

  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  -- Preenchidos quando a autorizacao vira sessao. `started_at` nulo e uma
  -- autorizacao que ninguem usou: ela simplesmente vence.
  started_at timestamptz,
  session_id uuid references public.cmd_sessions (id) on delete set null,

  -- Fim da visita. `ended_reason`: SAIU (o ADMIN encerrou) ou EXPIROU.
  ended_at     timestamptz,
  ended_reason text check (ended_reason is null or ended_reason in ('SAIU', 'EXPIROU')),

  check (expires_at > created_at)
);

create index if not exists cmd_impersonations_admin_idx
  on public.cmd_impersonations (admin_user_id, created_at desc);

create index if not exists cmd_impersonations_target_idx
  on public.cmd_impersonations (target_user_id, created_at desc);

create index if not exists cmd_impersonations_client_idx
  on public.cmd_impersonations (client_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. O registro nao se reescreve
--
-- O que pode mudar depois de criado: o consumo (started_at + session_id) e o
-- encerramento (ended_at + ended_reason), cada um UMA vez, e o desligamento
-- das chaves estrangeiras quando a pessoa e excluida. Nome, instante,
-- prazo e hash nunca mudam, e nenhuma linha e apagada enquanto o Time
-- existir.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_impersonations_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- Time excluido leva o proprio registro junto: nesta altura a linha de
    -- cmd_clients ja nao existe mais.
    if old.client_id is null
       or not exists (select 1 from public.cmd_clients c where c.id = old.client_id) then
      return old;
    end if;
    raise exception 'registro de inspecao e imutavel';
  end if;

  if new.id = old.id
     and new.token_hash = old.token_hash
     and new.admin_name = old.admin_name
     and new.target_name = old.target_name
     and new.target_role = old.target_role
     and new.created_at = old.created_at
     and new.expires_at = old.expires_at
     -- Consumo e encerramento so acontecem uma vez: o valor antigo ou era
     -- nulo, ou continua igual.
     and (old.started_at is null or new.started_at = old.started_at)
     and (old.ended_at is null or new.ended_at = old.ended_at)
     and (old.session_id is null or new.session_id is not distinct from old.session_id)
     -- Chaves estrangeiras so podem ser DESLIGADAS (pessoa excluida).
     and (new.admin_user_id is null or new.admin_user_id = old.admin_user_id)
     and (new.target_user_id is null or new.target_user_id = old.target_user_id)
     and (new.client_id is null or new.client_id = old.client_id)
  then
    return new;
  end if;

  raise exception 'registro de inspecao e imutavel';
end
$$;

comment on function public.cmd_impersonations_guard() is
  'Recusa reescrita e exclusao do registro de inspecao. So aceita o consumo, '
  'o encerramento e o desligamento de chaves estrangeiras.';

drop trigger if exists cmd_impersonations_imutavel on public.cmd_impersonations;
create trigger cmd_impersonations_imutavel
  before update or delete on public.cmd_impersonations
  for each row execute function public.cmd_impersonations_guard();

-- ---------------------------------------------------------------------------
-- 4. cmd_impersonation_claim: troca a autorizacao por uma sessao, uma vez so
--
-- Tudo em UMA transacao do banco: marcar a autorizacao como usada, criar a
-- sessao e ligar as duas. Dois cliques simultaneos no mesmo endereco nao
-- abrem duas sessoes — o `update ... where started_at is null` decide, e o
-- segundo nao encontra linha.
--
-- Os dois tokens chegam aqui como HASH SHA-256, calculado no servidor do
-- Next.js: nem o da autorizacao nem o da sessao existem em texto puro no
-- banco. O prazo da sessao chega pronto de quem chama (o mesmo prazo de
-- sessao do sistema); o que o banco impoe e o resto: autorizacao viva, nao
-- usada, e pessoa ainda ativa e do perfil certo. ADMIN geral nunca e alvo.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_impersonation_claim(
  p_token_hash         text,
  p_session_token_hash text,
  p_expires_at         timestamptz
)
returns table (
  impersonation_id uuid,
  session_id       uuid,
  target_user_id   uuid,
  admin_user_id    uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_auth    public.cmd_impersonations%rowtype;
  v_target  public.cmd_users%rowtype;
  v_session uuid;
begin
  update public.cmd_impersonations i
     set started_at = now()
   where i.token_hash = p_token_hash
     and i.started_at is null
     and i.expires_at > now()
  returning i.* into v_auth;

  if v_auth.id is null then
    return;
  end if;

  select * into v_target
    from public.cmd_users u
   where u.id = v_auth.target_user_id
     and u.is_active
     and u.role in ('CANDIDATE', 'EQUIPE');

  if v_target.id is null then
    -- Pessoa excluida, desativada ou promovida a ADMIN entre a emissao e o
    -- clique: a autorizacao ja esta gasta e nenhuma sessao nasce.
    update public.cmd_impersonations
       set ended_at = now(), ended_reason = 'EXPIROU'
     where id = v_auth.id;
    return;
  end if;

  insert into public.cmd_sessions (user_id, token_hash, expires_at, impersonated_by)
  values (v_target.id, p_session_token_hash, p_expires_at, v_auth.admin_user_id)
  returning id into v_session;

  update public.cmd_impersonations
     set session_id = v_session
   where id = v_auth.id;

  return query select v_auth.id, v_session, v_target.id, v_auth.admin_user_id;
end
$$;

comment on function public.cmd_impersonation_claim(text, text, timestamptz) is
  'Troca a autorizacao de inspecao por uma sessao, uma unica vez (migration 045).';

-- ---------------------------------------------------------------------------
-- 5. cmd_impersonation_end: encerra a visita
--
-- Revoga a sessao e fecha o registro na mesma transacao. Chamada quando o
-- ADMIN clica em sair; idempotente, porque o segundo clique nao encontra
-- sessao viva para revogar e o registro ja esta fechado.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_impersonation_end(p_session_token_hash text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.cmd_sessions%rowtype;
begin
  select * into v_session
    from public.cmd_sessions s
   where s.token_hash = p_session_token_hash
     and s.impersonated_by is not null;

  if v_session.id is null then
    return false;
  end if;

  update public.cmd_sessions
     set revoked_at = coalesce(revoked_at, now())
   where id = v_session.id;

  update public.cmd_impersonations
     set ended_at = now(), ended_reason = 'SAIU'
   where session_id = v_session.id
     and ended_at is null;

  return true;
end
$$;

comment on function public.cmd_impersonation_end(text) is
  'Encerra a sessao aberta no painel de outra pessoa e fecha o registro '
  '(migration 045).';

-- ---------------------------------------------------------------------------
-- 6. RLS e privilegios, no mesmo padrao das migrations anteriores
-- ---------------------------------------------------------------------------
alter table public.cmd_impersonations enable row level security;
alter table public.cmd_impersonations force row level security;

do $$
declare
  papel text;
begin
  foreach papel in array array['public', 'anon', 'authenticated']
  loop
    if papel = 'public' then
      execute 'revoke all on table public.cmd_impersonations from public';
    elsif exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on table public.cmd_impersonations from %I', papel);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute
      'grant select, insert, update, delete on table public.cmd_impersonations to service_role';
  end if;
end
$$;

comment on table public.cmd_impersonations is
  'Cada vez que o ADMIN geral entrou no painel de uma pessoa do time '
  '(migration 045): quem abriu, em nome de quem, quando comecou e quando '
  'terminou. A mesma linha nasce como autorizacao de uso unico.';

commit;

-- ---------------------------------------------------------------------------
-- CONFERENCIA (opcional, fora da transacao). As visitas, da mais recente
-- para a mais antiga:
--
--   select admin_name, target_name, target_role, started_at, ended_at,
--          ended_reason
--     from public.cmd_impersonations
--    where started_at is not null
--    order by started_at desc
--    limit 20;
-- ---------------------------------------------------------------------------
