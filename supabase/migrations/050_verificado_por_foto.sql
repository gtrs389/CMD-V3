-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 050: "VERIFICADO POR FOTO"
--
-- Execute no SQL Editor do Supabase depois de 049_time_duplicado.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Uma coluna nova, nula em todo cadastro que ja
-- existe.
--
-- A planilha de cadastro em lote ganhou a coluna "VERIFICADO POR FOTO", com
-- SIM ou NAO por pessoa. Aqui ela vira `photo_verified`:
--
--   true   SIM
--   false  NAO
--   null   nao informado (todo cadastro anterior, e quem nao veio da planilha)
-- ===========================================================================

begin;

alter table public.cmd_members
  add column if not exists photo_verified boolean;

comment on column public.cmd_members.photo_verified is
  'VERIFICADO POR FOTO da planilha (migration 050): true = SIM, false = NAO, nulo = nao informado.';

commit;
