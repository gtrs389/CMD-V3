-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 009: moradia dos cadastros antigos, sem exigir a Rua
--
-- Execute no SQL Editor do Supabase depois de 008_member_map_locations.sql.
-- Idempotente, sem DROP e dentro de uma transacao.
--
-- A busca residencial usa o endereco mais completo que existir, em uma unica
-- consulta: com rua, com bairro ou so com o municipio. A precisao alcancada
-- fica registrada para a tela dizer do que se trata o ponto.
--
-- Nenhuma consulta externa acontece aqui: os vinculos nascem PENDING.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Precisao do ponto encontrado
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regtype('public.cmd_location_precision') is null then
    create type public.cmd_location_precision as enum ('STREET', 'DISTRICT', 'CITY');
  end if;
end
$$;

alter table public.cmd_member_locations
  add column if not exists location_precision public.cmd_location_precision;

comment on column public.cmd_member_locations.location_precision is
  'Ate onde o endereco chegou: rua, bairro ou municipio. Nunca a casa exata.';

-- ---------------------------------------------------------------------------
-- 2. Vinculo de moradia para quem tem ao menos municipio e UF
-- ---------------------------------------------------------------------------
insert into public.cmd_member_locations (client_id, member_id, location_kind, status)
select m.client_id, m.id, 'RESIDENCE', 'PENDING'
  from public.cmd_members m
 where coalesce(btrim(m.city), '') <> ''
   and coalesce(btrim(m.state), '') <> ''
   and not exists (
     select 1 from public.cmd_member_locations l
      where l.member_id = m.id and l.location_kind = 'RESIDENCE'
   );

commit;
