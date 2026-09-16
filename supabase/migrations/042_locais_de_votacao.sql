-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 042: locais de votacao proprios (tabela do TSE)
--
-- Execute no SQL Editor do Supabase depois de 041_confirmacao_de_dados.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Nenhuma API externa e consultada.
--
-- POR QUE ELA EXISTE
--
-- Ate aqui a escola onde a pessoa vota era descoberta CONSULTANDO o Google
-- pela SerpAPI: montava-se o endereco que a Justica Eleitoral tinha
-- devolvido e perguntava-se as coordenadas ao provedor. Isso tinha dois
-- problemas: cada escola custava uma consulta paga, e o que voltava era o
-- palpite do buscador para aquele texto — nao o ponto oficial.
--
-- O TSE publica a lista completa dos locais de votacao, com a coordenada de
-- cada um. Tendo essa lista AQUI, a escola deixa de ser uma pergunta e passa
-- a ser uma consulta ao proprio banco: de graca, instantanea e exata.
--
-- A SerpAPI continua servindo a MORADIA aproximada da pessoa, que e o unico
-- endereco que ninguem publica em tabela — ele e digitado no cadastro.
--
-- COMO SE ACHA O LOCAL DE UMA PESSOA
--
-- Por UF + zona + secao. A secao e a unidade: cada uma existe em um unico
-- local, e e por isso que `sections` e uma lista dentro da linha do local —
-- e a forma da propria planilha do TSE ("Secoes neste local: 1, 2, 3, ...").
-- O indice GIN sobre ela faz a busca ser direta, sem varrer a tabela.
--
-- A UF entra na busca porque numero de zona se repete entre estados: a zona
-- 39 existe em Alagoas e existe em Sao Paulo, e sao locais diferentes. O time
-- ja informa o estado no cadastro (migration 038), entao o recorte existe
-- antes da pergunta.
--
-- O QUE ESTA TABELA NAO E: ela nao guarda nada de ninguem. Sao enderecos
-- publicos de escolas, iguais para todos os times, sem qualquer vinculo com
-- integrante, cadastro ou consulta. Nenhum dado pessoal entra aqui.
--
-- IDEMPOTENTE: `create table if not exists` nao recria nada, e a chave
-- unica (UF + municipio + zona + local) deixa a carga do CSV ser repetida
-- quantas vezes for preciso — a linha existente e atualizada, nunca
-- duplicada.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Os locais de votacao, como o TSE publica
--
-- Uma linha por LOCAL (a escola), e nao por secao: e assim que a planilha
-- vem, e e assim que o mapa desenha — um pino por escola, com as secoes
-- dela.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_polling_places (
  id uuid primary key default gen_random_uuid(),

  uf text not null check (uf ~ '^[A-Z]{2}$'),
  -- Codigo do municipio no TSE. Nao e o codigo do IBGE, e nao se misturam.
  city_code integer not null check (city_code > 0),
  city text not null check (length(city) between 1 and 120),

  zone integer not null check (zone between 1 and 9999),

  -- Nome do local: "COLEGIO CENECISTA/ COLEGIO JOSE GOMES LIMA".
  name text not null check (length(name) between 1 and 300),
  -- "Convencional", "Anexo", etc. Guardado como veio, sem interpretar.
  place_type text check (length(place_type) <= 60),

  address  text check (length(address) <= 400),
  district text check (length(district) <= 160),
  -- Somente digitos. Vazio na planilha vira nulo, nunca string vazia.
  postal_code text check (postal_code ~ '^[0-9]{8}$'),

  -- Nulas quando a planilha nao traz a coordenada daquele local. Um local
  -- sem coordenada e encontrado pela busca, mas nao vira pino no mapa:
  -- inventar um ponto seria pior do que nao ter nenhum.
  latitude  double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),

  -- Quantidade informada pela planilha, e a lista de fato. A lista e quem
  -- responde a busca; a quantidade serve de conferencia da carga.
  section_count integer check (section_count between 0 and 2000),
  sections integer[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Chave natural da planilha: o mesmo local, no mesmo municipio e na mesma
  -- zona, e uma linha so. E ela que torna a carga repetivel.
  constraint cmd_polling_places_uniq unique (uf, city_code, zone, name)
);

-- Busca do dia a dia: UF + zona, refinada pela secao.
create index if not exists cmd_polling_places_zone_idx
  on public.cmd_polling_places (uf, zone);

-- A secao vive dentro da lista: sem o GIN, cada busca varreria a tabela
-- inteira.
create index if not exists cmd_polling_places_sections_idx
  on public.cmd_polling_places using gin (sections);

create index if not exists cmd_polling_places_city_idx
  on public.cmd_polling_places (uf, city_code);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'cmd_polling_places_updated_at'
  ) then
    create trigger cmd_polling_places_updated_at
      before update on public.cmd_polling_places
      for each row execute function public.cmd_set_updated_at();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. A origem do ponto passa a ser dita no cache de coordenadas
--
-- `cmd_map_locations` guardava so o que veio da SerpAPI, e o `check` dizia
-- isso. Agora o local de votacao entra ali vindo DESTA tabela — mesma forma,
-- origem diferente —, e quem olha a linha precisa saber de onde o ponto
-- veio. Nenhuma linha existente muda: o valor antigo continua valendo.
-- ---------------------------------------------------------------------------
alter table public.cmd_map_locations
  drop constraint if exists cmd_map_locations_provider_check;

alter table public.cmd_map_locations
  add constraint cmd_map_locations_provider_check
  check (provider in ('SERPAPI_GOOGLE_MAPS', 'CMD_LOCAIS_DE_VOTACAO'));

-- ---------------------------------------------------------------------------
-- 3. RLS e privilegios, no mesmo padrao das migrations anteriores
--
-- Mesmo sendo dado publico, a tabela nao fica aberta: quem le e o servidor,
-- com a chave secreta, como tudo o mais neste banco.
-- ---------------------------------------------------------------------------
alter table public.cmd_polling_places enable row level security;
alter table public.cmd_polling_places force row level security;

do $$
declare
  papel text;
begin
  foreach papel in array array['public', 'anon', 'authenticated']
  loop
    if papel = 'public' then
      execute 'revoke all on table public.cmd_polling_places from public';
    elsif exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on table public.cmd_polling_places from %I', papel);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute
      'grant select, insert, update, delete on table public.cmd_polling_places to service_role';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Comentarios
-- ---------------------------------------------------------------------------
comment on table public.cmd_polling_places is
  'Locais de votacao publicados pelo TSE (migration 042). Dado publico de '
  'escolas, sem nenhum vinculo com integrante ou cadastro. Carregado pelo '
  'comando npm run importar-locais.';
comment on column public.cmd_polling_places.sections is
  'Secoes que votam neste local. E por ela que se acha o local de uma '
  'pessoa: UF + zona + secao.';
comment on column public.cmd_polling_places.city_code is
  'Codigo do municipio no TSE, como vem na planilha. Nao e o codigo do IBGE.';
comment on column public.cmd_polling_places.latitude is
  'Nula quando a planilha nao traz a coordenada: o local e encontrado, mas '
  'nao vira pino no mapa.';

commit;

-- ---------------------------------------------------------------------------
-- CONFERENCIA (opcional, fora da transacao). Depois de rodar
-- `npm run importar-locais`, deve haver locais por UF:
--
--   select uf, count(*) as locais, sum(cardinality(sections)) as secoes
--     from public.cmd_polling_places group by uf order by uf;
--
-- E a busca de uma pessoa (UF + zona + secao) deve devolver UMA linha:
--
--   select name, address, latitude, longitude
--     from public.cmd_polling_places
--    where uf = 'AL' and zone = 39 and sections @> array[16];
-- ---------------------------------------------------------------------------
