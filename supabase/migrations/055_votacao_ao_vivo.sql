-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 055: votacao AO VIVO, pelos boletins de urna do TSE
--
-- Execute no SQL Editor do Supabase depois de 054_votacao_por_secao.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE,
-- DROP COLUMN, DELETE nem TRUNCATE.
--
-- O QUE E
--
-- Durante a apuracao, o TSE publica em resultados.tse.jus.br o boletim de
-- urna (BU) de cada secao assim que ele chega. O servidor do CMD busca esses
-- boletins aos poucos (poucas requisicoes por vez, para o TSE nao bloquear),
-- guarda os votos de cada secao aqui e consolida tudo em
-- cmd_election_votes (migration 054) — a mesma tabela que o mapa ja le.
-- Assim o mapa da votacao se atualiza sozinho enquanto a apuracao anda, e
-- a planilha final do TSE, quando sair, so confirma os mesmos numeros.
--
-- Dado publico de eleicao. Nenhum dado pessoal entra aqui.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Cada secao do estado, e o boletim dela quando chegar
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_tse_live_sections (
  pleito integer not null,
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  -- Codigo do municipio no TSE (cinco digitos na URL do TSE).
  city_code integer not null,
  zone integer not null,
  section integer not null,

  -- Ultima situacao lida no arquivo auxiliar ("Totalizada", "nao publicado"...).
  status text check (length(status) <= 80),
  hash text check (length(hash) <= 200),
  checked_at timestamptz,
  received_at text check (length(received_at) <= 40),

  place_number integer,
  turnout integer,
  -- {"cargo:numero": votos}. Nulo enquanto o boletim nao chegou.
  votes jsonb check (votes is null or jsonb_typeof(votes) = 'object'),

  updated_at timestamptz not null default now(),
  primary key (pleito, uf, zone, section)
);

-- A fila da coleta: secoes sem boletim, da verificada ha mais tempo.
create index if not exists cmd_tse_live_sections_fila_idx
  on public.cmd_tse_live_sections (pleito, uf, checked_at nulls first)
  where votes is null;

-- ---------------------------------------------------------------------------
-- 2. Nomes dos candidatos (e partidos, para a legenda), do proprio TSE
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_tse_live_candidates (
  pleito integer not null,
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  office_code integer not null,
  number text not null check (number ~ '^[0-9]{1,6}$'),
  name text not null check (length(name) between 1 and 200),
  party text check (length(party) <= 40),
  kind text not null check (kind in ('CANDIDATO', 'LEGENDA')),
  primary key (pleito, uf, office_code, number)
);

-- ---------------------------------------------------------------------------
-- 3. Situacao da coleta: trava (uma coleta por vez), progresso e pausa
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_tse_live_state (
  pleito integer not null,
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  lock_until timestamptz not null default now(),
  -- Pausa pedida pelo TSE (muitos 403/429): ninguem consulta ate la.
  paused_until timestamptz,
  names_at timestamptz,
  last_run_at timestamptz,
  last_error text check (length(last_error) <= 500),
  sections_total integer not null default 0,
  sections_done integer not null default 0,
  primary key (pleito, uf)
);

-- ---------------------------------------------------------------------------
-- 4. Funcoes
-- ---------------------------------------------------------------------------

-- Pega a trava da coleta por p_segundos. Falso se outra coleta estiver
-- rodando: duas ao mesmo tempo dobrariam as requisicoes ao TSE.
create or replace function public.cmd_tse_live_lock(p_pleito integer, p_uf text, p_segundos integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  pegou boolean;
begin
  insert into public.cmd_tse_live_state (pleito, uf, lock_until)
  values (p_pleito, p_uf, now() - interval '1 second')
  on conflict (pleito, uf) do nothing;

  update public.cmd_tse_live_state
     set lock_until = now() + make_interval(secs => p_segundos)
   where pleito = p_pleito and uf = p_uf
     and lock_until < now()
     and (paused_until is null or paused_until < now())
  returning true into pegou;

  return coalesce(pegou, false);
end;
$$;

-- Consolida os boletins recebidos em cmd_election_votes: um candidato por
-- linha, com a lista [[zona, secao, votos]] e o total. Roda depois de cada
-- coleta que trouxe boletim novo.
create or replace function public.cmd_tse_live_consolidate(
  p_pleito integer, p_uf text, p_year integer, p_round integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  gravadas integer;
begin
  with votos as (
    select s.zone, s.section,
           split_part(e.key, ':', 1)::integer as office_code,
           split_part(e.key, ':', 2) as number,
           e.value::integer as qtd
      from public.cmd_tse_live_sections s,
           jsonb_each_text(s.votes) e
     where s.pleito = p_pleito and s.uf = p_uf and s.votes is not null
  ),
  somados as (
    select office_code, number,
           sum(qtd)::integer as total,
           jsonb_agg(jsonb_build_array(zone, section, qtd) order by zone, section) as sections
      from votos
     where qtd > 0 and number ~ '^[0-9]{1,6}$'
     group by office_code, number
  )
  insert into public.cmd_election_votes
    (year, round, uf, office_code, office, number, name, kind, total_votes, sections)
  select p_year, p_round, p_uf, v.office_code,
         case v.office_code
           when 1 then 'Presidente' when 3 then 'Governador' when 5 then 'Senador'
           when 6 then 'Deputado Federal' when 7 then 'Deputado Estadual'
           when 8 then 'Deputado Distrital' when 11 then 'Prefeito' when 13 then 'Vereador'
           else 'Cargo ' || v.office_code end,
         v.number,
         coalesce(c.name, case v.number when '95' then 'Branco' when '96' then 'Nulo' else v.number end),
         case
           when v.number = '95' then 'BRANCO'
           when v.number = '96' then 'NULO'
           when c.kind is not null then c.kind
           when v.office_code in (6, 7, 8, 13) and length(v.number) = 2 then 'LEGENDA'
           else 'CANDIDATO' end,
         v.total, v.sections
    from somados v
    left join public.cmd_tse_live_candidates c
      on c.pleito = p_pleito and c.uf = p_uf and c.office_code = v.office_code and c.number = v.number
  on conflict (year, round, uf, office_code, number) do update
     set office = excluded.office,
         name = excluded.name,
         kind = excluded.kind,
         total_votes = excluded.total_votes,
         sections = excluded.sections;

  get diagnostics gravadas = row_count;
  return gravadas;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS e privilegios, no mesmo padrao das migrations anteriores
-- ---------------------------------------------------------------------------
alter table public.cmd_tse_live_sections enable row level security;
alter table public.cmd_tse_live_sections force row level security;
alter table public.cmd_tse_live_candidates enable row level security;
alter table public.cmd_tse_live_candidates force row level security;
alter table public.cmd_tse_live_state enable row level security;
alter table public.cmd_tse_live_state force row level security;

do $$
declare
  papel text;
  tabela text;
begin
  foreach tabela in array array['cmd_tse_live_sections', 'cmd_tse_live_candidates', 'cmd_tse_live_state']
  loop
    foreach papel in array array['public', 'anon', 'authenticated']
    loop
      if papel = 'public' then
        execute format('revoke all on table public.%I from public', tabela);
      elsif exists (select 1 from pg_roles where rolname = papel) then
        execute format('revoke all on table public.%I from %I', tabela, papel);
      end if;
    end loop;

    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant select, insert, update, delete on table public.%I to service_role', tabela);
    end if;
  end loop;

  revoke all on function public.cmd_tse_live_lock(integer, text, integer) from public;
  revoke all on function public.cmd_tse_live_consolidate(integer, text, integer, integer) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.cmd_tse_live_lock(integer, text, integer) from anon';
    execute 'revoke all on function public.cmd_tse_live_consolidate(integer, text, integer, integer) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.cmd_tse_live_lock(integer, text, integer) from authenticated';
    execute 'revoke all on function public.cmd_tse_live_consolidate(integer, text, integer, integer) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.cmd_tse_live_lock(integer, text, integer) to service_role';
    execute 'grant execute on function public.cmd_tse_live_consolidate(integer, text, integer, integer) to service_role';
  end if;
end
$$;

comment on table public.cmd_tse_live_sections is
  'Boletins de urna do TSE recebidos ao vivo, secao por secao (migration 055). Dado publico.';
comment on table public.cmd_tse_live_candidates is
  'Nomes de candidatos e partidos publicados pelo TSE para a apuracao (migration 055).';
comment on table public.cmd_tse_live_state is
  'Trava, progresso e pausa da coleta ao vivo dos boletins de urna (migration 055).';

commit;
