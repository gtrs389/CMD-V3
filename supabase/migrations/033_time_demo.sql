-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 033: Time DEMO
--
-- Execute no SQL Editor do Supabase depois de 032_liberar_troca_de_responsavel.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Nenhuma API externa e consultada.
--
-- O QUE E UM TIME DEMO
--
-- Um time de verdade, nas mesmas tabelas, com um unico sinal a mais:
-- `is_demo = true`. Ele nasce pronto para apresentacao — administradores,
-- pessoas, enderecos, locais de votacao e pinos no mapa —, e usa as MESMAS
-- paginas, servicos e estrutura de um time real. Nao existe tabela DEMO
-- paralela, nem tela falsa, nem contador chumbado no React.
--
-- O que muda e so onde ele NAO entra: os numeros da operacao real. Total de
-- times, total de integrantes, cadastros do dia, graficos, mapa geral,
-- rankings e a API `/api/v1` continuam contando somente `is_demo = false`.
-- Dentro da pagina do proprio Time DEMO tudo aparece normalmente.
--
-- O QUE ENTRA AQUI
--
--   1. cmd_clients.is_demo      - o sinal, imutavel depois de criado;
--   2. gatilho de imutabilidade - time real nao vira DEMO, e DEMO nao vira
--                                 real, por edicao do registro;
--   3. provider DEMO_SEED       - coordenadas semeadas pelo proprio sistema,
--                                 que NUNCA se confundem com as consultadas
--                                 e pagas na SerpAPI;
--   4. cmd_demo_seeds           - chave de idempotencia: dois cliques ou uma
--                                 requisicao repetida nao criam dois times.
--
-- Times reais existentes recebem `is_demo = false` — e o que o default ja
-- faz, sem tocar em nenhuma linha.
--
-- O que NUNCA e gravado em um Time DEMO: CPF, titulo de eleitor, e-mail ou
-- telefone de pessoa real, e nenhum retorno de consulta cadastral. Os dados
-- sao gerados no servidor, a partir de listas ficticias.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. O sinal
--
-- `not null default false`: todo time que ja existe e todo time criado pelo
-- caminho normal continuam reais, sem nenhuma migracao de dados.
-- ---------------------------------------------------------------------------
alter table public.cmd_clients
  add column if not exists is_demo boolean not null default false;

-- A consulta que mais importa e "somente os reais": ela roda em toda metrica
-- global do sistema.
create index if not exists cmd_clients_is_demo_idx
  on public.cmd_clients (is_demo, created_at desc);

comment on column public.cmd_clients.is_demo is
  'Time de demonstracao. Imutavel: real nao vira DEMO e DEMO nao vira real. Fica fora de toda metrica global.';

-- ---------------------------------------------------------------------------
-- 2. O sinal nao muda depois de criado
--
-- Transformar um time real em DEMO esconderia uma operacao inteira dos
-- numeros; transformar um DEMO em real contaminaria os numeros com dados
-- ficticios. Nenhuma das duas pode acontecer por edicao do registro — nem
-- pela tela, nem por engano de codigo, nem por update direto no banco.
--
-- O gatilho cuida SO disso: todo o resto do time (nome, foto, textos,
-- recrutamento, questionario) continua editavel como sempre foi.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_clients_demo_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_demo is distinct from old.is_demo then
    raise exception 'time demo nao pode ser convertido';
  end if;

  return new;
end
$$;

comment on function public.cmd_clients_demo_guard() is
  'Recusa converter time real em DEMO e DEMO em real. O resto do cadastro continua editavel.';

drop trigger if exists cmd_clients_demo_imutavel on public.cmd_clients;
create trigger cmd_clients_demo_imutavel
  before update on public.cmd_clients
  for each row execute function public.cmd_clients_demo_guard();

-- ---------------------------------------------------------------------------
-- 3. Coordenadas semeadas: provider DEMO_SEED
--
-- O cache de coordenadas (migration 008) so aceitava 'SERPAPI_GOOGLE_MAPS'.
-- Gravar um ponto DEMO com esse provider seria mentir no banco: diria que
-- uma consulta paga aconteceu, e ninguem mais conseguiria separar o que foi
-- consultado do que foi semeado.
--
-- 'DEMO_SEED' e o oposto disso: diz, na propria linha, que aquele ponto
-- nasceu de um conjunto interno de dados de demonstracao, sem nenhuma
-- chamada externa. O mapa continua sendo um so — mesma tabela, mesmos
-- vinculos, mesma tela.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'cmd_map_locations_provider_check'
  ) then
    alter table public.cmd_map_locations drop constraint cmd_map_locations_provider_check;
  end if;

  alter table public.cmd_map_locations
    add constraint cmd_map_locations_provider_check
    check (provider in ('SERPAPI_GOOGLE_MAPS', 'DEMO_SEED'));
end
$$;

comment on column public.cmd_map_locations.provider is
  'Origem da coordenada: SERPAPI_GOOGLE_MAPS (consulta paga) ou DEMO_SEED (dados de demonstracao, sem consulta externa).';

-- ---------------------------------------------------------------------------
-- 4. cmd_demo_seeds: uma criacao por chave
--
-- Criar um Time DEMO grava dezenas de linhas em varias tabelas. Um segundo
-- clique, um duplo envio do navegador ou uma repeticao automatica da
-- requisicao criariam um segundo time inteiro — e quem esta apresentando
-- descobriria isso na pior hora.
--
-- A chave de idempotencia e criada pelo navegador e reservada AQUI, com a
-- unicidade garantida pelo banco: a primeira requisicao reserva, as demais
-- recebem o time que a primeira criou.
--
-- A linha vive enquanto a criacao estiver em andamento ou tiver dado certo.
-- Se a criacao falhar, o servidor apaga a reserva para a pessoa poder tentar
-- de novo com a mesma chave — nao e historico, e um controle de repeticao.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_demo_seeds (
  id          uuid primary key default gen_random_uuid(),
  seed_key    text not null unique check (seed_key ~ '^[A-Za-z0-9_-]{8,64}$'),
  client_id   uuid references public.cmd_clients (id) on delete cascade,
  created_by  uuid references public.cmd_users (id) on delete set null,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists cmd_demo_seeds_client_idx
  on public.cmd_demo_seeds (client_id);

comment on table public.cmd_demo_seeds is
  'Chaves de idempotencia da criacao de Time DEMO. Repetir a requisicao devolve o time ja criado.';

-- ---------------------------------------------------------------------------
-- 5. cmd_demo_claim: reserva a chave, ou devolve o que ja existe
--
-- Em uma transacao: tenta reservar a chave. Se ela ja estava reservada,
-- devolve o time daquela reserva (nulo enquanto a primeira criacao ainda
-- estiver em andamento). Duas requisicoes simultaneas nunca reservam a mesma
-- chave — quem decide e o indice unico do banco, e nao a ordem de chegada.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_demo_claim(p_seed_key text, p_user_id uuid)
returns table (seed_id uuid, client_id uuid, claimed boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id     uuid;
  v_existe record;
begin
  if p_seed_key is null or p_seed_key !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'chave de criacao invalida';
  end if;

  insert into public.cmd_demo_seeds (seed_key, created_by)
  values (p_seed_key, p_user_id)
  on conflict (seed_key) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, null::uuid, true;
    return;
  end if;

  select s.id, s.client_id into v_existe
    from public.cmd_demo_seeds s
   where s.seed_key = p_seed_key;

  return query select v_existe.id, v_existe.client_id, false;
end
$$;

comment on function public.cmd_demo_claim(text, uuid) is
  'Reserva a chave de criacao do Time DEMO. Chave ja usada devolve o time criado por ela.';

-- ---------------------------------------------------------------------------
-- 6. RLS habilitado, forcado e SEM nenhuma policy
-- ---------------------------------------------------------------------------
alter table public.cmd_demo_seeds enable row level security;
alter table public.cmd_demo_seeds force  row level security;

do $$
declare
  papel text;
begin
  execute 'revoke all on public.cmd_demo_seeds from public';

  foreach papel in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on public.cmd_demo_seeds from %I', papel);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.cmd_demo_seeds to service_role';
  end if;

  foreach papel in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format(
        'revoke all on function public.cmd_demo_claim(text, uuid) from %I', papel);
      execute format(
        'revoke all on function public.cmd_clients_demo_guard() from %I', papel);
    end if;
  end loop;

  execute 'revoke all on function public.cmd_demo_claim(text, uuid) from public';
  execute 'revoke all on function public.cmd_clients_demo_guard() from public';

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.cmd_demo_claim(text, uuid) to service_role';
  end if;
end
$$;

commit;
