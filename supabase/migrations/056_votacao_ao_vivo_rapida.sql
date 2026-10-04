-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 056: votacao ao vivo mais rapida, e o total oficial do TSE ao lado
--
-- Execute no SQL Editor do Supabase depois de 055_votacao_ao_vivo.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum.
--
-- O QUE MUDA
--
-- 1. A lista de secoes do TSE diz QUANDO o boletim de cada secao chegou
--    (campos da/ha). A coleta passa a reler a lista a cada poucos minutos e
--    vai direto nas secoes que ja chegaram, em vez de consultar todas as
--    cegas. `arrived_at` guarda esse sinal.
-- 2. O total oficial de cada candidato no estado (o mesmo que os paineis de
--    apuracao mostram) passa a ser guardado ao lado do total contado secao
--    por secao, para a tela mostrar a diferenca em vez de esconde-la.
-- ===========================================================================

begin;

alter table public.cmd_tse_live_sections
  add column if not exists arrived_at text check (length(arrived_at) <= 40);

alter table public.cmd_tse_live_state
  add column if not exists list_at timestamptz;

alter table public.cmd_tse_live_candidates
  add column if not exists official_votes integer check (official_votes >= 0);

alter table public.cmd_election_votes
  add column if not exists official_votes integer check (official_votes >= 0);

comment on column public.cmd_tse_live_sections.arrived_at is
  'Quando o TSE recebeu o boletim desta secao, pela lista de secoes (da/ha). Nulo: ainda nao chegou.';
comment on column public.cmd_election_votes.official_votes is
  'Total oficial do candidato no estado, como o TSE divulga na apuracao. Nulo fora da apuracao ao vivo.';

-- A fila da coleta: primeiro as secoes cujo boletim ja chegou.
create index if not exists cmd_tse_live_sections_chegou_idx
  on public.cmd_tse_live_sections (pleito, uf, arrived_at)
  where votes is null;

-- A consolidacao passa a levar o total oficial junto.
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
    (year, round, uf, office_code, office, number, name, kind, total_votes, sections, official_votes)
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
         v.total, v.sections, c.official_votes
    from somados v
    left join public.cmd_tse_live_candidates c
      on c.pleito = p_pleito and c.uf = p_uf and c.office_code = v.office_code and c.number = v.number
  on conflict (year, round, uf, office_code, number) do update
     set office = excluded.office,
         name = excluded.name,
         kind = excluded.kind,
         total_votes = excluded.total_votes,
         sections = excluded.sections,
         official_votes = excluded.official_votes;

  get diagnostics gravadas = row_count;
  return gravadas;
end;
$$;

revoke all on function public.cmd_tse_live_consolidate(integer, text, integer, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.cmd_tse_live_consolidate(integer, text, integer, integer) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.cmd_tse_live_consolidate(integer, text, integer, integer) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.cmd_tse_live_consolidate(integer, text, integer, integer) to service_role';
  end if;
end
$$;

commit;
