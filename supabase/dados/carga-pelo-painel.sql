-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Carga dos locais de votacao PELO PAINEL do Supabase
--
-- Este arquivo NAO e uma migration: ele nao muda o desenho do banco. E a
-- receita de carregar a planilha do TSE sem sair do navegador, para quem
-- nao vai rodar `npm run importar-locais` no terminal.
--
-- Rode a migration `042_locais_de_votacao.sql` ANTES: e ela que cria a
-- tabela de destino.
--
-- POR QUE ESTE CAMINHO EXISTE
--
-- O importador de CSV do painel entrega o texto CRU ao Postgres. A planilha
-- do TSE vem com coordenada em virgula decimal ("-9,25912678"), e para o
-- Postgres isso nao e numero:
--
--   ERROR: 22P02: invalid input syntax for type double precision: "-9,25912678"
--
-- E nao e so a coordenada: "Secoes neste local" e uma lista em texto
-- ("1, 2, 3, 4"), o CEP vem com e sem tracinho, e as colunas tem nome em
-- portugues, com acento. A saida e receber a planilha como TEXTO PURO, em
-- uma tabela de recepcao, e converter aqui dentro — onde da para tratar
-- cada campo.
--
-- OS TRES PASSOS
--
--   1. rode o PASSO 1 abaixo (cria a tabela de recepcao);
--   2. no painel: Table Editor -> cmd_locais_csv -> Insert -> Import data
--      from CSV -> escolha o arquivo. O painel casa as colunas PELO NOME do
--      cabecalho, e aqui todas sao texto: nada e recusado;
--   3. rode o PASSO 2 (converte e grava em cmd_polling_places).
--
-- Pode repetir quantas vezes quiser, um estado por vez: o PASSO 2 e
-- idempotente pela chave UF + municipio + zona + local. Nada e duplicado e
-- nada e apagado.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- PASSO 1: tabela de recepcao
--
-- Os nomes das colunas sao EXATAMENTE os do cabecalho da planilha, porque e
-- por eles que o importador do painel casa cada coluna. Se o seu arquivo
-- tiver um cabecalho diferente, ajuste os nomes aqui — e so aqui.
--
-- Tudo texto de proposito: a tabela de recepcao nunca recusa uma linha. Quem
-- decide o que e numero, o que e data e o que e lixo e o PASSO 2.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_locais_csv (
  "UF"                        text,
  "Cód. município"            text,
  "Município"                 text,
  "Zona"                      text,
  "Local de votação (escola)" text,
  "Tipo de local"             text,
  "Endereço"                  text,
  "Bairro"                    text,
  "CEP"                       text,
  "Latitude"                  text,
  "Longitude"                 text,
  "Qtd. seções"               text,
  "Seções neste local"        text
);

-- A tabela de recepcao e rascunho, e segue o mesmo padrao de todas as
-- outras: ninguem alcanca, exceto o servidor.
alter table public.cmd_locais_csv enable row level security;
alter table public.cmd_locais_csv force row level security;

revoke all on table public.cmd_locais_csv from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.cmd_locais_csv from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.cmd_locais_csv from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on table public.cmd_locais_csv to service_role;
  end if;
end
$$;

comment on table public.cmd_locais_csv is
  'Recepcao da planilha de locais de votacao, em texto puro. Rascunho: o que '
  'vale e cmd_polling_places, preenchida pelo PASSO 2 de '
  'supabase/dados/carga-pelo-painel.sql.';


-- ===========================================================================
-- PASSO 2: converter e gravar
--
-- Rode DEPOIS de importar o CSV na tabela de recepcao. Roda inteiro dentro de
-- uma transacao e nao apaga nada.
-- ===========================================================================

begin;

with bruto as (
  select
    upper(btrim("UF")) as uf,
    nullif(regexp_replace(coalesce("Cód. município", ''), '\D', '', 'g'), '') as city_code,
    nullif(btrim(regexp_replace(coalesce("Município", ''), '\s+', ' ', 'g')), '') as city,
    nullif(regexp_replace(coalesce("Zona", ''), '\D', '', 'g'), '') as zone,
    nullif(btrim(regexp_replace(coalesce("Local de votação (escola)", ''), '\s+', ' ', 'g')), '')
      as name,
    nullif(btrim(regexp_replace(coalesce("Tipo de local", ''), '\s+', ' ', 'g')), '')
      as place_type,
    nullif(btrim(regexp_replace(coalesce("Endereço", ''), '\s+', ' ', 'g')), '') as address,
    nullif(btrim(regexp_replace(coalesce("Bairro", ''), '\s+', ' ', 'g')), '') as district,
    nullif(regexp_replace(coalesce("CEP", ''), '\D', '', 'g'), '') as postal_code,
    -- Virgula decimal vira ponto. O que NAO for numero vira nulo em vez de
    -- derrubar a carga inteira: um local sem coordenada e encontrado na
    -- busca, so nao vira pino no mapa.
    replace(btrim(coalesce("Latitude", '')), ',', '.') as latitude,
    replace(btrim(coalesce("Longitude", '')), ',', '.') as longitude,
    coalesce("Seções neste local", '') as sections
  from public.cmd_locais_csv
),
-- Linha sem UF, municipio, zona ou local nao identifica um local: fica de
-- fora, sem derrubar as outras.
valido as (
  select
    uf,
    city_code::integer as city_code,
    left(city, 120) as city,
    zone::integer as zone,
    left(name, 300) as name,
    left(place_type, 60) as place_type,
    left(address, 400) as address,
    left(district, 160) as district,
    case when postal_code ~ '^\d{8}$' then postal_code end as postal_code,
    case
      when latitude ~ '^-?\d+(\.\d+)?$' and longitude ~ '^-?\d+(\.\d+)?$'
       and latitude::double precision between -90 and 90
       and longitude::double precision between -180 and 180
       and (latitude::double precision <> 0 or longitude::double precision <> 0)
      then latitude::double precision
    end as latitude,
    case
      when latitude ~ '^-?\d+(\.\d+)?$' and longitude ~ '^-?\d+(\.\d+)?$'
       and latitude::double precision between -90 and 90
       and longitude::double precision between -180 and 180
       and (latitude::double precision <> 0 or longitude::double precision <> 0)
      then longitude::double precision
    end as longitude,
    sections
  from bruto
  -- Os limites de digitos nao sao preciosismo: um numero comprido demais
  -- estoura o `integer` e derruba a carga INTEIRA, por causa de uma linha
  -- torta. Assim a linha torta fica de fora e o resto entra.
  where uf ~ '^[A-Z]{2}$'
    and city_code ~ '^\d{1,9}$'
    and zone ~ '^\d{1,4}$'
    and zone::integer between 1 and 9999
    and name is not null
),
-- "1, 2, 3, 4" vira uma linha por secao. Serve tanto para a lista de um
-- local quanto para juntar o MESMO local partido em duas linhas da planilha.
secoes as (
  select v.uf, v.city_code, v.zone, v.name, numero::integer as secao
    from valido v,
         lateral unnest(regexp_split_to_array(v.sections, '[^0-9]+')) as numero
   where numero ~ '^\d{1,6}$'
     and numero::integer between 1 and 100000
),
secoes_por_local as (
  select uf, city_code, zone, name, array_agg(distinct secao order by secao) as sections
    from secoes
   group by uf, city_code, zone, name
),
-- Uma linha por LOCAL: a mesma escola repetida na planilha vira um registro
-- so, com as secoes de todas as linhas dela.
local_unico as (
  select
    uf, city_code, zone, name,
    min(city) as city,
    min(place_type) as place_type,
    min(address) as address,
    min(district) as district,
    min(postal_code) as postal_code,
    min(latitude) as latitude,
    min(longitude) as longitude
  from valido
  group by uf, city_code, zone, name
)
insert into public.cmd_polling_places as destino (
  uf, city_code, city, zone, name, place_type,
  address, district, postal_code, latitude, longitude,
  section_count, sections
)
select
  l.uf, l.city_code, l.city, l.zone, l.name, l.place_type,
  l.address, l.district, l.postal_code, l.latitude, l.longitude,
  coalesce(cardinality(s.sections), 0),
  coalesce(s.sections, '{}')
from local_unico l
left join secoes_por_local s
  on  s.uf = l.uf and s.city_code = l.city_code
  and s.zone = l.zone and s.name = l.name
on conflict (uf, city_code, zone, name) do update
  set city          = excluded.city,
      place_type    = excluded.place_type,
      address       = excluded.address,
      district      = excluded.district,
      postal_code   = excluded.postal_code,
      latitude      = excluded.latitude,
      longitude     = excluded.longitude,
      -- As secoes da carga nova SOMAM com as que ja estavam: carregar a
      -- planilha em pedacos nunca perde o que veio antes.
      sections      = (
        select coalesce(array_agg(distinct numero order by numero), '{}')
          from unnest(destino.sections || excluded.sections) as numero
      ),
      section_count = (
        select count(distinct numero)
          from unnest(destino.sections || excluded.sections) as numero
      );

commit;

-- ---------------------------------------------------------------------------
-- CONFERENCIA
--
--   select uf, count(*) as locais, sum(cardinality(sections)) as secoes
--     from public.cmd_polling_places group by uf order by uf;
--
-- A busca de uma pessoa (UF + zona + secao) deve devolver UMA linha:
--
--   select name, address, latitude, longitude
--     from public.cmd_polling_places
--    where uf = 'AL' and zone = 39 and sections @> array[16];
--
-- Conferido, a tabela de recepcao pode ser esvaziada para a proxima carga
-- (ela e rascunho; cmd_polling_places e que guarda o resultado):
--
--   truncate table public.cmd_locais_csv;
-- ---------------------------------------------------------------------------
