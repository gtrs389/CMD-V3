-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 051: "REFERENCIA"
--
-- Execute no SQL Editor do Supabase depois de 050_verificado_por_foto.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Uma coluna nova, nula em todo cadastro que ja
-- existe.
--
-- A planilha de cadastro em lote ganhou a coluna "REFERENCIA", texto livre.
-- Quem tem, grava; quem nao tem fica nulo — e nulo nao e falta: nenhuma
-- etiqueta de incompleto nasce por causa dela.
-- ===========================================================================

begin;

alter table public.cmd_members
  add column if not exists reference text;

do $$
begin
  -- Curta, sem espaco sobrando nas pontas e nunca vazia: sem referencia e nulo.
  if not exists (select 1 from pg_constraint where conname = 'cmd_members_reference_check') then
    alter table public.cmd_members add constraint cmd_members_reference_check
      check (reference is null or (char_length(reference) between 1 and 200 and reference = btrim(reference)));
  end if;
end
$$;

comment on column public.cmd_members.reference is
  'REFERENCIA da planilha (migration 051). Texto livre; nulo quando a pessoa nao tem.';

commit;
