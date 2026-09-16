-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 034: Time DEMO em Alagoas, com locais de votacao reais
--
-- Execute no SQL Editor do Supabase depois de 033_time_demo.sql.
-- Nao altera nenhuma migration anterior — a 033 ja foi executada e permanece
-- exatamente como esta. Roda inteira dentro de UMA transacao, e idempotente e
-- nao apaga dado nenhum: nao ha DROP TABLE, DROP COLUMN, DELETE nem TRUNCATE.
-- Nenhuma API externa e consultada aqui.
--
-- POR QUE ELA EXISTE
--
-- Os dados gerados do Time DEMO estavam errados: municipios de outros
-- estados, escolas inventadas e coordenadas escritas de memoria com um
-- deslocamento aleatorio por cima. O resultado aparecia no mapa — marcadores
-- em Recife e marcadores no mar.
--
-- A correcao acontece no servidor (catalogo de locais de votacao REAIS de
-- Alagoas + coordenadas obtidas pela mesma consulta de endereco que atende um
-- integrante real). O banco entra com uma unica coisa, a que falta para
-- corrigir um Time DEMO JA CRIADO sem tocar em nada mais: saber, linha a
-- linha, o que foi GERADO e o que foi cadastrado por uma pessoa.
--
-- O QUE ENTRA
--
--   1. cmd_members.demo_seed          - marca da geracao, com a versao do
--                                       catalogo que criou a linha;
--   2. cmd_clients.demo_seed_version  - qual catalogo o time esta usando;
--   3. gatilho de coerencia           - a marca so existe dentro de um Time
--                                       DEMO;
--   4. retrocompatibilidade           - as pessoas geradas pela versao antiga
--                                       recebem a marca 'legado', para a
--                                       rotina de correcao poder refaze-las.
--
-- O QUE A MARCA GARANTE
--
-- A rotina de correcao apaga e refaz SOMENTE linhas marcadas. Time,
-- administradores, acessos, links, formulario, questionario, configuracoes e
-- qualquer pessoa cadastrada a mao dentro do Time DEMO nao tem a marca — e
-- por isso nao sao tocados. Nenhum time real tem a marca em lugar nenhum.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. A marca da geracao
--
-- Texto curto com a versao do catalogo (por exemplo 'al-tre-2026-1'). Nulo em
-- absolutamente tudo o que ja existe: a coluna nasce vazia e nenhuma linha e
-- reescrita por engano.
-- ---------------------------------------------------------------------------
alter table public.cmd_members
  add column if not exists demo_seed text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_members_demo_seed_check'
  ) then
    alter table public.cmd_members
      add constraint cmd_members_demo_seed_check
      check (demo_seed is null or demo_seed ~ '^[a-z0-9-]{3,40}$');
  end if;
end
$$;

-- A consulta da correcao e sempre "os gerados deste time": o indice parcial
-- so cobre as linhas marcadas, que sao a minoria absoluta da tabela.
create index if not exists cmd_members_demo_seed_idx
  on public.cmd_members (client_id)
  where demo_seed is not null;

comment on column public.cmd_members.demo_seed is
  'Versao do catalogo que GEROU esta pessoa ficticia. Nulo em cadastro real e em quem foi cadastrado a mao dentro de um Time DEMO. So o que tem a marca pode ser refeito.';

-- ---------------------------------------------------------------------------
-- 2. Qual catalogo o time esta usando
--
-- Serve para a tela dizer se um Time DEMO ja foi corrigido, e para a rotina
-- saber que nao ha o que fazer quando ele ja esta na versao atual.
-- ---------------------------------------------------------------------------
alter table public.cmd_clients
  add column if not exists demo_seed_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_clients_demo_seed_version_check'
  ) then
    alter table public.cmd_clients
      add constraint cmd_clients_demo_seed_version_check
      check (
        demo_seed_version is null
        or (is_demo and demo_seed_version ~ '^[a-z0-9-]{3,40}$')
      );
  end if;
end
$$;

comment on column public.cmd_clients.demo_seed_version is
  'Catalogo de dados aplicado ao Time DEMO. Nulo em time real.';

-- ---------------------------------------------------------------------------
-- 3. A marca so existe dentro de um Time DEMO
--
-- Sem esta guarda, um erro de codigo poderia marcar uma pessoa de um time
-- real — e a rotina de correcao apagaria um cadastro de verdade. E a unica
-- linha de defesa que importa aqui, entao ela fica no banco, e nao apenas no
-- servidor.
--
-- O gatilho cuida SO disso: todo o resto do cadastro continua como sempre foi.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_members_demo_seed_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.demo_seed is not null then
    if not exists (
      select 1
        from public.cmd_clients c
       where c.id = new.client_id
         and c.is_demo
    ) then
      raise exception 'marca de demonstracao so existe em time demo';
    end if;
  end if;

  return new;
end
$$;

comment on function public.cmd_members_demo_seed_guard() is
  'Recusa marcar como gerada uma pessoa que nao pertence a um Time DEMO.';

drop trigger if exists cmd_members_demo_seed_coerente on public.cmd_members;
create trigger cmd_members_demo_seed_coerente
  before insert or update of demo_seed, client_id on public.cmd_members
  for each row execute function public.cmd_members_demo_seed_guard();

-- ---------------------------------------------------------------------------
-- 4. As pessoas geradas pela versao antiga
--
-- Um Time DEMO criado antes desta migration tem pessoas geradas que nao
-- carregam marca nenhuma — e sem marca a rotina de correcao nao as tocaria,
-- deixando no mapa justamente os pinos errados.
--
-- O criterio abaixo nao e um palpite: a versao antiga era a UNICA coisa no
-- sistema que gravava coordenada com provider 'DEMO_SEED'. Toda pessoa
-- ficticia daquela geracao ficou ligada a um desses pontos. Quem foi
-- cadastrado a mao dentro de um Time DEMO nunca esteve ligado a um ponto
-- DEMO_SEED — ou a consulta do endereco dele foi paga (SERPAPI_GOOGLE_MAPS),
-- ou ele ainda esta pendente. Por isso ninguem e marcado por engano.
--
-- 'legado' apenas diz "isto veio da geracao anterior". A rotina de correcao
-- troca pela versao do catalogo atual ao refazer.
-- ---------------------------------------------------------------------------
update public.cmd_members m
   set demo_seed = 'legado'
 where m.demo_seed is null
   and exists (select 1 from public.cmd_clients c where c.id = m.client_id and c.is_demo)
   and exists (
     select 1
       from public.cmd_member_locations ml
       join public.cmd_map_locations l on l.id = ml.location_id
      where ml.member_id = m.id
        and l.provider = 'DEMO_SEED'
   );

-- O time que tem gente marcada como legado ainda nao foi corrigido: a versao
-- fica anotada como 'legado' ate a rotina rodar.
update public.cmd_clients c
   set demo_seed_version = 'legado'
 where c.is_demo
   and c.demo_seed_version is null
   and exists (select 1 from public.cmd_members m where m.client_id = c.id and m.demo_seed is not null);

-- ---------------------------------------------------------------------------
-- 5. Permissoes
--
-- As tabelas ja tem RLS habilitado, forcado e sem policy desde as migrations
-- anteriores: so o service_role escreve, e sempre pelo servidor. A funcao do
-- gatilho segue a mesma regra das outras.
-- ---------------------------------------------------------------------------
do $$
declare
  papel text;
begin
  execute 'revoke all on function public.cmd_members_demo_seed_guard() from public';

  foreach papel in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format(
        'revoke all on function public.cmd_members_demo_seed_guard() from %I', papel);
    end if;
  end loop;
end
$$;

commit;
