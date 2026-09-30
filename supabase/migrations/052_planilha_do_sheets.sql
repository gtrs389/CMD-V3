-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 052: planilha do Google Sheets no time DUPLICADO
--
-- Execute no SQL Editor do Supabase depois de 051_referencia.sql (e depois
-- da 049_time_duplicado.sql, de quem ela depende). Nao altera nenhuma
-- migration anterior. Roda inteira dentro de UMA transacao, e idempotente e
-- nao apaga dado nenhum: nao ha DROP TABLE, DROP COLUMN, DELETE nem TRUNCATE.
--
-- O QUE E
--
-- O time duplicado pode mostrar a Equipe dos Lideres a partir de uma
-- planilha do Google Sheets: uma aba por Lider, com NOME, TITULO, ZONA,
-- SECAO, TELEFONE, LIDER, REFERENCIA e VERIFICADO POR FOTO.
--
-- A PLANILHA E LIDA AO VIVO. NADA DELA E GRAVADO AQUI
--
-- O banco guarda SO a configuracao: o interruptor e o link. As pessoas, os
-- Lideres e qualquer outro dado da planilha sao lidos do Google na hora de
-- mostrar a tela, e nao sao copiados para nenhuma tabela. Quem atualiza a
-- planilha ve a atualizacao no sistema, sem importar nada.
--
-- SO EM TIME DUPLICADO, E O BANCO GARANTE: o interruptor so liga em time
-- com `is_copy` (check). O time oficial nao tem como usar a planilha.
-- ===========================================================================

begin;

alter table public.cmd_clients
  add column if not exists sheet_sync_enabled boolean not null default false,
  add column if not exists sheet_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cmd_clients_sheet_check') then
    alter table public.cmd_clients add constraint cmd_clients_sheet_check
      check (
        (not sheet_sync_enabled or is_copy)
        and (sheet_url is null or sheet_url ~ '^https://docs\.google\.com/spreadsheets/d/[A-Za-z0-9_-]+$')
      );
  end if;
end
$$;

comment on column public.cmd_clients.sheet_sync_enabled is
  'Time duplicado mostra a Equipe dos Lideres a partir da planilha do Google Sheets, lida ao vivo (migration 052). So liga em copia.';
comment on column public.cmd_clients.sheet_url is
  'Endereco da planilha do Google Sheets, ja limpo: https://docs.google.com/spreadsheets/d/<id>. So o endereco: nenhum dado da planilha e guardado.';

commit;
