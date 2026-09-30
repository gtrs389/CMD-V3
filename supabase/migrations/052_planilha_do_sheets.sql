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
-- O time duplicado pode puxar a Equipe dos Lideres de uma planilha do Google
-- Sheets: uma aba por Lider, com NOME, TITULO, ZONA, SECAO, TELEFONE, LIDER,
-- REFERENCIA e VERIFICADO POR FOTO. Liga e desliga por um interruptor.
--
-- Ligado, a Equipe de cada Lider na copia e a da planilha; a que estava no
-- banco da copia fica escondida, e volta ao desligar. Nada e apagado para
-- isso: cada linha que veio da planilha leva `from_sheet = true`, e e ela
-- que decide quem aparece.
--
-- SO EM TIME DUPLICADO, E O BANCO GARANTE
--
--   - o interruptor so liga em time com `is_copy` (check);
--   - uma linha com `from_sheet = true` so entra em time com `is_copy`
--     (gatilho). Nem um erro de codigo consegue gravar dado da planilha no
--     time oficial.
-- ===========================================================================

begin;

alter table public.cmd_clients
  add column if not exists sheet_sync_enabled boolean not null default false,
  add column if not exists sheet_url text,
  add column if not exists sheet_synced_at timestamptz,
  add column if not exists sheet_sync_report jsonb,
  add column if not exists sheet_sync_lock_at timestamptz;

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
  'Time duplicado puxa a Equipe dos Lideres da planilha do Google Sheets (migration 052). So liga em copia.';
comment on column public.cmd_clients.sheet_url is
  'Endereco da planilha do Google Sheets, ja limpo: https://docs.google.com/spreadsheets/d/<id>.';
comment on column public.cmd_clients.sheet_sync_report is
  'Resultado da ultima leitura da planilha: Lideres encontrados e criados, pessoas, abas e linhas ignoradas.';
comment on column public.cmd_clients.sheet_sync_lock_at is
  'Leitura em andamento. Impede duas leituras ao mesmo tempo; vence sozinha depois de alguns minutos.';

alter table public.cmd_members
  add column if not exists from_sheet boolean not null default false;

create index if not exists cmd_members_client_from_sheet_idx
  on public.cmd_members (client_id, from_sheet);

comment on column public.cmd_members.from_sheet is
  'Linha que veio da planilha do Google Sheets (migration 052). So existe em time duplicado.';

create or replace function public.cmd_members_from_sheet_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.from_sheet and not exists (
    select 1 from public.cmd_clients c where c.id = new.client_id and c.is_copy
  ) then
    raise exception 'dado da planilha so entra em time duplicado';
  end if;

  return new;
end
$$;

comment on function public.cmd_members_from_sheet_guard() is
  'Recusa linha vinda da planilha do Google Sheets fora de time duplicado.';

drop trigger if exists cmd_members_from_sheet_guard on public.cmd_members;
create trigger cmd_members_from_sheet_guard
  before insert or update of from_sheet, client_id on public.cmd_members
  for each row execute function public.cmd_members_from_sheet_guard();

do $$
declare
  papel text;
begin
  execute 'revoke all on function public.cmd_members_from_sheet_guard() from public';

  foreach papel in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on function public.cmd_members_from_sheet_guard() from %I', papel);
    end if;
  end loop;
end
$$;

commit;
