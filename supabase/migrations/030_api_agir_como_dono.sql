-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 030: a API gera o link COMO SE o dono tivesse clicado no painel
--
-- Execute no SQL Editor do Supabase depois de 029_api_links_cadastro.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Nenhuma API externa e consultada.
--
-- O QUE MUDA, E POR QUE
--
-- A API da 029 ja gerava o link de verdade, mas registrava o ADMIN GERAL como
-- quem gerou — e o painel, quando o proprio Administrador do time clica em
-- "Gerar link", registra ELE nos dois papeis (dono e gerador). O rastreamento
-- saia diferente conforme o caminho usado, e o historico de um time passava a
-- depender de um detalhe tecnico que nao interessa a ninguem que le a tela.
--
-- Agora a API age COMO O DONO: gerar pela API e exatamente o que aconteceria
-- se o Joao entrasse no painel e clicasse. Mesmo dono, mesmo gerador, mesmo
-- prazo do perfil, mesmos eventos, mesmo registro de geracao.
--
-- Isso acontece no codigo do servidor (`api-link.service.ts` passa o proprio
-- dono como gerador, como faz a rota do painel). Nenhuma funcao do banco
-- precisou mudar: `cmd_invite_issue` ja aceitava o gerador como parametro.
--
-- O QUE ENTRA AQUI: o registro que faltava.
--
-- Se o historico do link passa a ser indistinguivel de um clique humano — e
-- e isso que se quer —, entao o rastro de que aquilo veio da API tem de
-- existir em algum lugar. Ele vive AQUI, junto da chave, e nao no historico
-- do link:
--
--   public.cmd_api_key_events - uma linha por acao da chave, com o link
--                               afetado, o dono em nome de quem ela agiu, o
--                               ADMIN responsavel pela chave e o instante.
--
-- Assim as duas coisas continuam verdadeiras ao mesmo tempo: quem le o
-- rastreamento do time ve o link do Joao gerado pelo Joao, e quem precisa
-- auditar a API ve, em Configuracoes, cada acao de cada chave.
--
-- O que NUNCA e guardado aqui: token em texto puro, URL do convite, hash do
-- token, segredo da chave, segredo da reserva, senha, CPF, titulo de eleitor,
-- retorno de consulta cadastral ou IP.
--
-- Todo instante e timestamptz calculado com now() (UTC) pelo banco.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. public.cmd_api_key_events: o que cada chave fez
--
-- Toda identificacao e ANULAVEL e vem acompanhada de snapshot de nome: apagar
-- a chave, o ADMIN, o time ou o link nao apaga o registro do que aconteceu,
-- nem deixa a linha sem sentido.
--
-- `action` e uma lista fechada:
--   LINK_GERADO    a chave gerou (ou renovou) o link de um dono;
--   LINK_REVOGADO  a chave derrubou um link.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_api_key_events (
  id             uuid primary key default gen_random_uuid(),

  api_key_id     uuid references public.cmd_api_keys (id) on delete set null,
  key_name       text,

  -- ADMIN dono da chave: a identidade com que ela age.
  admin_user_id  uuid references public.cmd_users (id) on delete set null,
  admin_name     text,

  action         text not null,

  invite_id      uuid references public.cmd_invites (id) on delete set null,
  client_id      uuid references public.cmd_clients (id) on delete set null,
  client_name    text,

  -- Dono em nome de quem a chave agiu: quem aparece no historico do link.
  owner_user_id  uuid references public.cmd_users (id) on delete set null,
  owner_name     text,
  owner_role     text,

  occurred_at    timestamptz not null default now(),

  constraint cmd_api_key_events_action_check
    check (action in ('LINK_GERADO', 'LINK_REVOGADO')),
  constraint cmd_api_key_events_owner_role_check
    check (owner_role is null or owner_role in ('ADMIN', 'CANDIDATE', 'EQUIPE'))
);

create index if not exists cmd_api_key_events_chave_idx
  on public.cmd_api_key_events (api_key_id, occurred_at desc);

create index if not exists cmd_api_key_events_invite_idx
  on public.cmd_api_key_events (invite_id);

comment on table public.cmd_api_key_events is
  'Acoes das chaves da API. Existe porque o historico do link e, de proposito, igual ao de um clique no painel.';
comment on column public.cmd_api_key_events.owner_user_id is
  'Dono em nome de quem a chave agiu: e ele que consta como gerador no historico do link.';

-- ---------------------------------------------------------------------------
-- 2. Imutavel de verdade
--
-- Mesma regra dos demais historicos (020 e 021): o banco recusa reescrita e
-- exclusao. So passa o desligamento das chaves estrangeiras, que e o que
-- acontece quando a chave, o ADMIN, o time, o dono ou o link sao excluidos.
-- ---------------------------------------------------------------------------
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

comment on function public.cmd_api_key_events_guard() is
  'Recusa reescrita e exclusao do registro de acao da API. So aceita desligar chaves estrangeiras.';

drop trigger if exists cmd_api_key_events_imutavel on public.cmd_api_key_events;
create trigger cmd_api_key_events_imutavel
  before update or delete on public.cmd_api_key_events
  for each row execute function public.cmd_api_key_events_guard();

-- ---------------------------------------------------------------------------
-- 3. RLS habilitado, forcado e SEM nenhuma policy
-- ---------------------------------------------------------------------------
alter table public.cmd_api_key_events enable row level security;
alter table public.cmd_api_key_events force  row level security;

do $$
declare
  tabelas text := 'public.cmd_api_key_events';
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

  execute format('revoke all on function public.cmd_api_key_events_guard() from public');
end
$$;

commit;
