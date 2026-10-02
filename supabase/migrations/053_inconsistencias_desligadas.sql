-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 053: verificacoes de inconsistencia desligadas, time a time
--
-- Execute no SQL Editor do Supabase depois de 052_planilha_do_sheets.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE,
-- DROP COLUMN, DELETE nem TRUNCATE.
--
-- O QUE E
--
-- O ADMIN geral escolhe, em cada time, quais verificacoes o quadro de
-- Inconsistencias mostra — por exemplo, nao mostrar "telefone incompleto".
-- O banco guarda SO a lista do que esta desligado; as inconsistencias sao
-- calculadas na tela, como sempre. Nenhuma ficha muda.
-- ===========================================================================

begin;

alter table public.cmd_clients
  add column if not exists inconsistencias_desligadas text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cmd_clients_inconsistencias_desligadas_check') then
    alter table public.cmd_clients add constraint cmd_clients_inconsistencias_desligadas_check
      check (cardinality(inconsistencias_desligadas) <= 50);
  end if;
end
$$;

comment on column public.cmd_clients.inconsistencias_desligadas is
  'Ids das verificacoes do quadro de Inconsistencias desligadas neste time (migration 053). Vazio = todas ligadas.';

commit;
