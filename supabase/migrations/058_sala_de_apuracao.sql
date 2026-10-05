-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 058: Sala de Apuracao (resultado ao vivo por cargo, a noite inteira)
--
-- Execute no SQL Editor do Supabase depois de 057_favoritos_da_votacao.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum.
--
-- O QUE E
--
-- A cada coleta ao vivo, o servidor le o resultado de cada cargo que o TSE
-- divulga (candidatos, votos, porcentagem, situacao, secoes totalizadas) e
-- guarda aqui:
--
--   cmd_tse_live_results  a ultima leitura de cada cargo (o que a tela mostra);
--   cmd_tse_live_history  um retrato a cada versao nova do TSE: o grafico da
--                         noite (porcentagem de cada lider x secoes apuradas);
--   cmd_tse_live_events   a linha do tempo: troca de lider, ultrapassagens,
--                         eleitos, 2o turno, marcos de apuracao.
--
-- Dado publico de eleicao. Nenhum dado pessoal entra aqui.
-- ===========================================================================

begin;

create table if not exists public.cmd_tse_live_results (
  pleito integer not null,
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  office_code integer not null,
  -- Versao do arquivo no TSE (idg): muda a cada atualizacao.
  version text check (length(version) <= 40),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  fetched_at timestamptz not null default now(),
  primary key (pleito, uf, office_code)
);

create table if not exists public.cmd_tse_live_history (
  pleito integer not null,
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  office_code integer not null,
  version text not null check (length(version) <= 40),
  at timestamptz not null default now(),
  tse_time text check (length(tse_time) <= 10),
  pct_sections numeric not null default 0,
  -- [[numero, votos, pct], ...] dos mais votados naquele momento.
  leaders jsonb not null check (jsonb_typeof(leaders) = 'array'),
  primary key (pleito, uf, office_code, version)
);

create index if not exists cmd_tse_live_history_at_idx
  on public.cmd_tse_live_history (pleito, uf, office_code, at);

create table if not exists public.cmd_tse_live_events (
  id bigserial primary key,
  pleito integer not null,
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  office_code integer not null,
  at timestamptz not null default now(),
  tse_time text check (length(tse_time) <= 10),
  kind text not null check (kind in ('LIDERANCA', 'ULTRAPASSAGEM', 'ELEITO', 'SEGUNDO_TURNO', 'MARCO')),
  text text not null check (length(text) between 1 and 300),
  number text check (number ~ '^[0-9]{1,6}$')
);

create index if not exists cmd_tse_live_events_at_idx
  on public.cmd_tse_live_events (pleito, uf, at desc);

alter table public.cmd_tse_live_results enable row level security;
alter table public.cmd_tse_live_results force row level security;
alter table public.cmd_tse_live_history enable row level security;
alter table public.cmd_tse_live_history force row level security;
alter table public.cmd_tse_live_events enable row level security;
alter table public.cmd_tse_live_events force row level security;

do $$
declare
  papel text;
  tabela text;
begin
  foreach tabela in array array['cmd_tse_live_results', 'cmd_tse_live_history', 'cmd_tse_live_events']
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

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage, select on sequence public.cmd_tse_live_events_id_seq to service_role';
  end if;
end
$$;

comment on table public.cmd_tse_live_results is
  'Sala de Apuracao: ultima leitura do resultado de cada cargo divulgado pelo TSE (migration 058).';
comment on table public.cmd_tse_live_history is
  'Sala de Apuracao: um retrato por versao do TSE, para o grafico da noite (migration 058).';
comment on table public.cmd_tse_live_events is
  'Sala de Apuracao: linha do tempo da apuracao (lideranca, ultrapassagens, eleitos, marcos) (migration 058).';

commit;
