-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 023: questionario do time
--
-- Execute no SQL Editor do Supabase depois de 022_team_banner_tag.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP, DELETE nem
-- TRUNCATE. Nenhuma API externa e consultada.
--
-- O QUE E ISTO
--
-- O sistema ja tinha UM formulario publico: o de CADASTRO, que transforma
-- quem responde em integrante da equipe. Agora existe um SEGUNDO formulario,
-- com proposito diferente: o QUESTIONARIO.
--
-- O questionario e uma pesquisa que a equipe envia para OUTRAS PESSOAS —
-- gente que nao entra no sistema, nao vira integrante, nao ganha acesso e
-- nao aparece em nenhuma contagem de mobilizacao. A pessoa abre o link,
-- responde e pronto. As respostas ficam guardadas a parte, com o nome e o
-- telefone de quem respondeu e o registro de quem enviou o link.
--
-- DECISOES QUE ESTAO GRAVADAS AQUI
--
--   1. UM questionario por time. As perguntas moram no time, nao no usuario.
--   2. Quem monta as perguntas e SOMENTE o ADMIN geral. A equipe apenas
--      envia o link e le as respostas que chegaram.
--   3. O link e de USO UNICO, igual ao de cadastro: reservado pelo primeiro
--      aparelho que o abre, consumido quando a resposta e enviada, com prazo
--      conferido pelo horario do banco.
--   4. Quem responde NAO vira integrante. Nada aqui escreve em cmd_members,
--      cmd_users ou cmd_member_responses.
--
-- POR QUE UMA ESTRUTURA PROPRIA, E NAO UMA COLUNA NOVA EM cmd_invites
--
-- O link de cadastro carrega regra de negocio pesada e propria: verificacao
-- de CPF e de titulo de eleitor, hierarquia de recrutamento, reserva de
-- aparelho ligada ao integrante criado, rastreamento por geracao e por
-- clique (migrations 020 e 021). Misturar os dois proposito na mesma tabela
-- faria cada consulta de recrutamento passar a depender de um filtro novo, e
-- um filtro esquecido em qualquer um dos pontos existentes viraria cadastro
-- perdido ou link de pesquisa aceito como convite de cadastro.
--
-- Por isso o questionario tem tabelas proprias, com o MESMO ciclo de vida e
-- os MESMOS cuidados, sem tocar em uma linha sequer do recrutamento. O prazo
-- continua saindo da MESMA configuracao do ADMIN, pela funcao
-- public.cmd_invite_seconds, entao nao existem duas regras de duracao.
--
-- O QUE NUNCA E GUARDADO: token em texto puro no historico, URL, segredo da
-- reserva, senha, CPF, titulo de eleitor, IP em texto puro ou GPS. Nao
-- existe coluna para nada disso.
--
-- Todo instante e timestamptz calculado com now() (UTC) pelo banco.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. public.cmd_clients: a configuracao do questionario do time
--
-- Fica na linha do proprio time porque e UM questionario por time. O
-- interruptor `survey_active` e o equivalente de `recruiting_active`: em
-- false, nenhum link de questionario daquele time aceita resposta, mesmo que
-- ja tenha sido enviado.
-- ---------------------------------------------------------------------------
alter table public.cmd_clients
  add column if not exists survey_active          boolean     not null default false,
  add column if not exists survey_title           text        not null default 'Questionário',
  add column if not exists survey_intro_text      text        not null default '',
  add column if not exists survey_success_message text        not null default 'Obrigado por responder!',
  add column if not exists survey_updated_at      timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cmd_clients_survey_title_check') then
    alter table public.cmd_clients add constraint cmd_clients_survey_title_check
      check (length(btrim(survey_title)) between 1 and 120);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cmd_clients_survey_intro_check') then
    alter table public.cmd_clients add constraint cmd_clients_survey_intro_check
      check (length(survey_intro_text) <= 2000);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cmd_clients_survey_success_check') then
    alter table public.cmd_clients add constraint cmd_clients_survey_success_check
      check (length(survey_success_message) <= 400);
  end if;
end
$$;

comment on column public.cmd_clients.survey_active is
  'Interruptor do questionario do time: em false nenhum link daquele time aceita resposta.';
comment on column public.cmd_clients.survey_title is
  'Titulo exibido no topo do questionario publico.';

-- ---------------------------------------------------------------------------
-- 2. public.cmd_survey_fields: as perguntas
--
-- Mesma forma de cmd_form_fields, com uma diferenca de proposito: aqui NAO
-- existe `system_key`. Campo de sistema e coisa do cadastro (foto, CPF,
-- titulo, zona, secao, vinculo) e carrega regra de verificacao que o
-- questionario nao tem e nao deve ter. Toda pergunta daqui e livre, montada
-- pelo ADMIN geral.
--
-- O tipo reaproveita o enum public.cmd_field_type, ja existente desde a 001:
-- o construtor de campos e o desenho do formulario sao os mesmos, entao os
-- tipos precisam ser os mesmos. O tipo `photo` fica de fora por check: o
-- questionario nao recebe arquivo, e ninguem monta uma pergunta que o
-- formulario publico nao saberia enviar.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_survey_fields (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.cmd_clients (id) on delete cascade,
  type        public.cmd_field_type not null,
  label       text not null default '' check (length(label) <= 80),
  placeholder text not null default '' check (length(placeholder) <= 80),
  help_text   text not null default '' check (length(help_text) <= 160),
  required    boolean not null default false,
  enabled     boolean not null default true,
  position    integer not null default 0 check (position >= 0 and position <= 999),
  options     jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint cmd_survey_fields_id_client_uniq unique (id, client_id),
  constraint cmd_survey_fields_type_check check (type <> 'photo')
);

create index if not exists cmd_survey_fields_client_position_idx
  on public.cmd_survey_fields (client_id, position);

comment on table public.cmd_survey_fields is
  'Perguntas do questionario de um time. Sem campo de sistema: toda pergunta e livre.';

-- ---------------------------------------------------------------------------
-- 3. public.cmd_survey_invites: o link de uso unico do questionario
--
-- UMA linha por usuario, como no recrutamento: gerar de novo NAO cria linha
-- nova, incrementa a geracao e troca o token. O endereco anterior morre na
-- hora.
--
-- `user_id` e o DONO — quem envia o link. Ele e anulavel e acompanhado de
-- snapshot do nome e do perfil: excluir o usuario depois nao apaga a
-- resposta nem faz perder de quem ela veio.
--
-- `token` guarda o identificador opaco em claro pela mesma razao do
-- recrutamento: o link precisa continuar disponivel para copiar depois de
-- sair e entrar de novo. Ele nao e credencial de login, e aleatorio,
-- revogavel e substituivel. A busca e sempre pelo `token_hash`.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_survey_invites (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.cmd_clients (id) on delete cascade,
  user_id              uuid references public.cmd_users (id) on delete set null,
  owner_name           text,
  owner_role           text,
  generated_by_user_id uuid references public.cmd_users (id) on delete set null,
  generated_by_name    text,
  generated_by_role    text,
  token                text,
  token_hash           text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  active               boolean not null default true,
  status               text not null default 'ACTIVE',
  generation           integer not null default 1 check (generation >= 1),
  issued_at            timestamptz not null default now(),
  expires_at           timestamptz not null,
  claim_hash           text,
  claimed_at           timestamptz,
  consumed_at          timestamptz,
  -- Resposta que fechou este link. Preenchida no consumo.
  response_id          uuid,
  created_at           timestamptz not null default now(),
  constraint cmd_survey_invites_token_check
    check (token is null or token ~ '^[A-Za-z0-9_-]{16,64}$'),
  constraint cmd_survey_invites_status_check
    check (status in ('ACTIVE', 'CLAIMED', 'SUBMITTING', 'CONSUMED', 'EXPIRED', 'REVOKED')),
  constraint cmd_survey_invites_claim_hash_check
    check (claim_hash is null or claim_hash ~ '^[0-9a-f]{64}$'),
  constraint cmd_survey_invites_owner_role_check
    check (owner_role is null or owner_role in ('ADMIN', 'CANDIDATE', 'EQUIPE')),
  constraint cmd_survey_invites_generated_by_role_check
    check (generated_by_role is null or generated_by_role in ('ADMIN', 'CANDIDATE', 'EQUIPE')),
  constraint cmd_survey_invites_prazo_check check (expires_at > issued_at)
);

-- Um link de questionario por usuario. A geracao e que muda.
create unique index if not exists cmd_survey_invites_user_key
  on public.cmd_survey_invites (user_id)
  where user_id is not null;

create unique index if not exists cmd_survey_invites_token_key
  on public.cmd_survey_invites (token)
  where token is not null;

create index if not exists cmd_survey_invites_client_idx
  on public.cmd_survey_invites (client_id);
create index if not exists cmd_survey_invites_status_expires_idx
  on public.cmd_survey_invites (status, expires_at);

comment on table public.cmd_survey_invites is
  'Link de uso unico do questionario, um por usuario. Mesmo ciclo de vida do link de cadastro, sem tocar nele.';

-- ---------------------------------------------------------------------------
-- 4. public.cmd_survey_responses: quem respondeu
--
-- A pessoa que responde NAO e integrante: esta tabela e o unico lugar onde
-- ela existe. Nome e telefone ficam aqui, e so aqui.
--
-- `invite_id` e anulavel e o indice unico parcial garante o uso unico
-- tambem no banco: um link nunca produz duas respostas, mesmo que dois
-- envios cheguem ao mesmo tempo.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_survey_responses (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.cmd_clients (id) on delete cascade,
  invite_id      uuid references public.cmd_survey_invites (id) on delete set null,
  sender_user_id uuid references public.cmd_users (id) on delete set null,
  sender_name    text,
  sender_role    text,
  name           text not null check (length(btrim(name)) between 2 and 120),
  -- Telefone normalizado: apenas digitos, sem mascara.
  phone          text not null default '' check (phone ~ '^[0-9]{0,15}$'),
  answered_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  constraint cmd_survey_responses_sender_role_check
    check (sender_role is null or sender_role in ('ADMIN', 'CANDIDATE', 'EQUIPE'))
);

create unique index if not exists cmd_survey_responses_invite_key
  on public.cmd_survey_responses (invite_id)
  where invite_id is not null;

create index if not exists cmd_survey_responses_client_idx
  on public.cmd_survey_responses (client_id, answered_at desc);
create index if not exists cmd_survey_responses_sender_idx
  on public.cmd_survey_responses (sender_user_id, answered_at desc);

comment on table public.cmd_survey_responses is
  'Resposta de uma pessoa ao questionario. Nao e integrante: nada aqui cria usuario, acesso ou cadastro.';

-- ---------------------------------------------------------------------------
-- 5. public.cmd_survey_response_values: o que foi respondido
--
-- O rotulo e o tipo da pergunta sao COPIADOS para ca no momento do envio. O
-- ADMIN pode reescrever ou excluir a pergunta depois, e a resposta continua
-- legivel exatamente como foi feita — sem isso, uma pergunta renomeada
-- mudaria o sentido de tudo que ja tinha sido respondido.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_survey_response_values (
  id          uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.cmd_survey_responses (id) on delete cascade,
  field_id    uuid references public.cmd_survey_fields (id) on delete set null,
  field_label text not null default '' check (length(field_label) <= 80),
  field_type  public.cmd_field_type not null,
  position    integer not null default 0 check (position >= 0 and position <= 999),
  value       jsonb not null default 'null'::jsonb
);

create index if not exists cmd_survey_response_values_response_idx
  on public.cmd_survey_response_values (response_id, position);

comment on table public.cmd_survey_response_values is
  'Uma linha por pergunta respondida, com o rotulo e o tipo copiados do momento do envio.';

-- ---------------------------------------------------------------------------
-- 6. Gatilhos de updated_at
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'cmd_survey_fields_set_updated_at'
      and tgrelid = 'public.cmd_survey_fields'::regclass
  ) then
    create trigger cmd_survey_fields_set_updated_at
      before update on public.cmd_survey_fields
      for each row execute function public.cmd_set_updated_at();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 7. Prazo vencido: marcado na leitura, sem cron
--
-- Mesma ideia de public.cmd_invite_expire_due, na estrutura do questionario.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_survey_expire_due()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer := 0;
begin
  with vencidos as (
    select s.id
      from public.cmd_survey_invites s
     where s.status in ('ACTIVE', 'CLAIMED', 'SUBMITTING')
       and s.expires_at <= now()
     order by s.expires_at
     for update skip locked
  )
  update public.cmd_survey_invites s
     set status = 'EXPIRED'
    from vencidos v
   where s.id = v.id;

  get diagnostics v_total = row_count;
  return v_total;
end
$$;

comment on function public.cmd_survey_expire_due() is
  'Marca EXPIRED os links de questionario vencidos pelo horario do banco.';

-- ---------------------------------------------------------------------------
-- 8. Gerar ou renovar o link do questionario
--
-- Revoga a geracao anterior na hora e grava a nova com issued_at = now() e
-- expires_at = now() + o prazo JA CONFIGURADO pelo ADMIN para aquele perfil.
-- O token chega pronto do servidor e somente o hash e usado na busca.
--
-- Nao existe questionario sem pergunta: gerar link para um time que ainda
-- nao tem nenhuma pergunta ativa e recusado aqui, e nao so escondido na
-- tela.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_survey_invite_issue(
  p_user_id      uuid,
  p_token        text,
  p_token_hash   text,
  p_generated_by uuid default null
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
  v_cliente  record;
  v_id       uuid;
  v_geracao  integer := 1;
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
    raise exception 'perfil sem link de questionario';
  end if;

  select c.id, c.survey_active into v_cliente
    from public.cmd_clients c
   where c.id = v_user.client_id;

  if v_cliente.id is null then
    raise exception 'time nao encontrado';
  end if;
  if not v_cliente.survey_active then
    raise exception 'questionario desligado para este time';
  end if;
  if not exists (
    select 1 from public.cmd_survey_fields f
     where f.client_id = v_user.client_id and f.enabled
  ) then
    raise exception 'questionario sem perguntas';
  end if;

  -- Quem clicou. Sem o segundo argumento, o proprio dono.
  select u.id, u.name, u.role::text as role into v_gerador
    from public.cmd_users u
   where u.id = coalesce(p_generated_by, p_user_id);

  v_fim := v_agora + make_interval(secs => public.cmd_invite_seconds(v_user.role));

  select s.id, s.generation
    into v_atual
    from public.cmd_survey_invites s
   where s.user_id = p_user_id
   for update;

  if v_atual.id is not null then
    v_id := v_atual.id;
    v_geracao := v_atual.generation + 1;

    update public.cmd_survey_invites
       set token                = p_token,
           token_hash           = p_token_hash,
           active               = true,
           issued_at            = v_agora,
           expires_at           = v_fim,
           status               = 'ACTIVE',
           claim_hash           = null,
           claimed_at           = null,
           consumed_at          = null,
           response_id          = null,
           generation           = v_geracao,
           owner_name           = v_user.name,
           owner_role           = v_user.role,
           generated_by_user_id = v_gerador.id,
           generated_by_name    = v_gerador.name,
           generated_by_role    = v_gerador.role
     where id = v_id;
  else
    insert into public.cmd_survey_invites
      (client_id, user_id, owner_name, owner_role,
       generated_by_user_id, generated_by_name, generated_by_role,
       token, token_hash, active, status, generation, issued_at, expires_at)
    values (v_user.client_id, v_user.id, v_user.name, v_user.role,
            v_gerador.id, v_gerador.name, v_gerador.role,
            p_token, p_token_hash, true, 'ACTIVE', 1, v_agora, v_fim)
    returning id into v_id;
  end if;

  return query select v_id, v_agora, v_fim;
end
$$;

comment on function public.cmd_survey_invite_issue(uuid, text, text, uuid) is
  'Gera ou renova o link do questionario: revoga a geracao anterior e aplica o prazo configurado.';

-- ---------------------------------------------------------------------------
-- 9. Reserva do primeiro aparelho
--
--   ACTIVE  + reserva nova      -> CLAIMED ('OK')
--   CLAIMED + mesma reserva     -> CLAIMED ('OK')
--   CLAIMED + reserva diferente -> 'TAKEN'
--   vencido                     -> EXPIRED, devolve 'GONE'
--   CONSUMED/EXPIRED/REVOKED    -> 'GONE'
--
-- Reservar nao renova nem aumenta o prazo: expires_at nao e tocado.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_survey_invite_claim(
  p_token_hash text,
  p_claim_hash text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_link record;
begin
  if p_claim_hash is null or p_claim_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'reserva invalida';
  end if;

  select s.id, s.status, s.claim_hash, s.expires_at
    into v_link
    from public.cmd_survey_invites s
   where s.token_hash = p_token_hash
   for update;

  if v_link.id is null then
    return 'GONE';
  end if;

  if v_link.status in ('ACTIVE', 'CLAIMED', 'SUBMITTING') and v_link.expires_at <= now() then
    update public.cmd_survey_invites set status = 'EXPIRED' where id = v_link.id;
    return 'GONE';
  end if;

  if v_link.status in ('CONSUMED', 'EXPIRED', 'REVOKED') then
    return 'GONE';
  end if;

  if v_link.status = 'ACTIVE' then
    update public.cmd_survey_invites
       set status = 'CLAIMED', claim_hash = p_claim_hash, claimed_at = now()
     where id = v_link.id;
    return 'OK';
  end if;

  if v_link.claim_hash = p_claim_hash then
    return 'OK';
  end if;

  return 'TAKEN';
end
$$;

comment on function public.cmd_survey_invite_claim(text, text) is
  'Reserva o link do questionario para o primeiro navegador e recusa qualquer outro.';

-- ---------------------------------------------------------------------------
-- 10. Envio: CLAIMED -> SUBMITTING -> CONSUMED
-- ---------------------------------------------------------------------------
create or replace function public.cmd_survey_invite_begin_submit(
  p_token_hash text,
  p_claim_hash text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_link record;
begin
  if p_claim_hash is null or p_claim_hash !~ '^[0-9a-f]{64}$' then
    return 'TAKEN';
  end if;

  select s.id, s.status, s.claim_hash, s.expires_at
    into v_link
    from public.cmd_survey_invites s
   where s.token_hash = p_token_hash
   for update;

  if v_link.id is null then
    return 'GONE';
  end if;

  if v_link.status in ('ACTIVE', 'CLAIMED', 'SUBMITTING') and v_link.expires_at <= now() then
    update public.cmd_survey_invites set status = 'EXPIRED' where id = v_link.id;
    return 'GONE';
  end if;

  if v_link.status in ('CONSUMED', 'EXPIRED', 'REVOKED') then
    return 'GONE';
  end if;

  if v_link.claim_hash is distinct from p_claim_hash then
    return 'TAKEN';
  end if;

  if v_link.status = 'SUBMITTING' then
    return 'BUSY';
  end if;

  update public.cmd_survey_invites set status = 'SUBMITTING' where id = v_link.id;
  return 'OK';
end
$$;

comment on function public.cmd_survey_invite_begin_submit(text, text) is
  'Abre o envio da resposta (CLAIMED -> SUBMITTING) e impede dois envios simultaneos.';

create or replace function public.cmd_survey_invite_release_submit(
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
  update public.cmd_survey_invites
     set status = 'CLAIMED'
   where token_hash = p_token_hash
     and claim_hash = p_claim_hash
     and status = 'SUBMITTING'
     and expires_at > now();

  get diagnostics v_afetadas = row_count;
  return v_afetadas > 0;
end
$$;

comment on function public.cmd_survey_invite_release_submit(text, text) is
  'Devolve o link para CLAIMED quando o envio falha antes de ser gravado.';

-- ---------------------------------------------------------------------------
-- 11. Gravacao da resposta, em uma transacao so
--
-- Recebe o token (por hash), a reserva do aparelho, o nome e o telefone de
-- quem respondeu e as respostas ja montadas em um array JSON. Faz tudo de
-- uma vez: confere o estado do link, grava a resposta, grava os valores e
-- fecha o link em definitivo.
--
-- Repetir a chamada com o mesmo link NAO cria uma segunda resposta: o link
-- ja esta CONSUMED e a funcao devolve 'GONE'. O indice unico parcial em
-- cmd_survey_responses e a segunda tranca.
--
-- p_values e um array de objetos:
--   [{"field_id": uuid|null, "label": text, "type": text, "value": <json>}]
-- A posicao no array vira a ordem de exibicao.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_survey_answer(
  p_token_hash text,
  p_claim_hash text,
  p_name       text,
  p_phone      text,
  p_values     jsonb
)
returns table (outcome text, response_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_link     record;
  v_resposta uuid;
  v_nome     text := btrim(coalesce(p_name, ''));
  v_telefone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if p_claim_hash is null or p_claim_hash !~ '^[0-9a-f]{64}$' then
    return query select 'TAKEN'::text, null::uuid;
    return;
  end if;
  if length(v_nome) < 2 then
    raise exception 'nome invalido';
  end if;
  if jsonb_typeof(coalesce(p_values, 'null'::jsonb)) <> 'array' then
    raise exception 'respostas invalidas';
  end if;

  select s.id, s.client_id, s.user_id, s.owner_name, s.owner_role,
         s.status, s.claim_hash, s.expires_at
    into v_link
    from public.cmd_survey_invites s
   where s.token_hash = p_token_hash
   for update;

  if v_link.id is null then
    return query select 'GONE'::text, null::uuid;
    return;
  end if;

  if v_link.status in ('ACTIVE', 'CLAIMED', 'SUBMITTING') and v_link.expires_at <= now() then
    update public.cmd_survey_invites set status = 'EXPIRED' where id = v_link.id;
    return query select 'GONE'::text, null::uuid;
    return;
  end if;

  if v_link.status in ('CONSUMED', 'EXPIRED', 'REVOKED') then
    return query select 'GONE'::text, null::uuid;
    return;
  end if;

  if v_link.claim_hash is distinct from p_claim_hash then
    return query select 'TAKEN'::text, null::uuid;
    return;
  end if;

  -- O interruptor do time vale ate o ultimo instante: desligar o
  -- questionario fecha a porta mesmo para quem ja estava com a tela aberta.
  if not exists (
    select 1 from public.cmd_clients c
     where c.id = v_link.client_id and c.survey_active
  ) then
    return query select 'GONE'::text, null::uuid;
    return;
  end if;

  insert into public.cmd_survey_responses
    (client_id, invite_id, sender_user_id, sender_name, sender_role, name, phone)
  values (v_link.client_id, v_link.id, v_link.user_id, v_link.owner_name, v_link.owner_role,
          v_nome, v_telefone)
  returning id into v_resposta;

  insert into public.cmd_survey_response_values
    (response_id, field_id, field_label, field_type, position, value)
  select v_resposta,
         -- A pergunta precisa ser DESTE time: um identificador de outro
         -- questionario nao entra, nem por engano nem de proposito.
         (select f.id from public.cmd_survey_fields f
           where f.id = nullif(t.item->>'field_id', '')::uuid
             and f.client_id = v_link.client_id),
         left(coalesce(t.item->>'label', ''), 80),
         coalesce(nullif(t.item->>'type', ''), 'text')::public.cmd_field_type,
         least(t.ordem - 1, 999)::integer,
         coalesce(t.item->'value', 'null'::jsonb)
    from jsonb_array_elements(p_values) with ordinality as t(item, ordem);

  update public.cmd_survey_invites
     set status      = 'CONSUMED',
         consumed_at = now(),
         response_id = v_resposta
   where id = v_link.id;

  return query select 'OK'::text, v_resposta;
end
$$;

comment on function public.cmd_survey_answer(text, text, text, text, jsonb) is
  'Grava a resposta do questionario e fecha o link de uso unico, tudo em uma transacao.';

-- ---------------------------------------------------------------------------
-- 12. RLS: habilitado, forcado e SEM nenhuma policy
--
-- Igual ao resto do sistema: ninguem le nem escreve com as chaves publicas.
-- O acesso acontece somente pelo servidor do Next.js, com a chave secreta.
-- ---------------------------------------------------------------------------
do $$
declare
  alvo text;
begin
  foreach alvo in array array[
    'cmd_survey_fields',
    'cmd_survey_invites',
    'cmd_survey_responses',
    'cmd_survey_response_values'
  ]
  loop
    execute format('alter table public.%I enable row level security', alvo);
    execute format('alter table public.%I force row level security', alvo);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 13. Permissoes: nada para PUBLIC, anon ou authenticated
-- ---------------------------------------------------------------------------
do $$
declare
  tabelas constant text := '
    public.cmd_survey_fields,
    public.cmd_survey_invites,
    public.cmd_survey_responses,
    public.cmd_survey_response_values';
  funcoes constant text[] := array[
    'public.cmd_survey_expire_due()',
    'public.cmd_survey_invite_issue(uuid, text, text, uuid)',
    'public.cmd_survey_invite_claim(text, text)',
    'public.cmd_survey_invite_begin_submit(text, text)',
    'public.cmd_survey_invite_release_submit(text, text)',
    'public.cmd_survey_answer(text, text, text, text, jsonb)'
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
