-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 049: time DUPLICADO
--
-- Execute no SQL Editor do Supabase depois de 048_tag_do_lider.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Tres colunas novas em cmd_clients, falsas ou
-- nulas em todo time que ja existe.
--
-- O QUE E
--
-- O ADMIN geral duplica um time para mostrar, na pratica, a diferenca entre
-- a informacao mandada certa e a mandada errada. A copia leva os
-- administradores, os Lideres, os dois formularios e as configuracoes. A
-- Equipe de cada Lider fica SO no oficial. Na copia a planilha dos Lideres
-- sobe normalmente, como em qualquer time.
--
-- A COPIA NUNCA ALCANCA O OFICIAL
--
-- Todas as linhas da copia sao linhas NOVAS, com o `client_id` da copia.
-- Nenhuma aponta para o oficial: `copy_of_client_id` e informativo e, de
-- proposito, NAO e chave estrangeira. Sem chave, nao existe cascata nenhuma
-- entre os dois — excluir a copia leva so a copia, e excluir o oficial nao
-- transforma a copia em time real. As fotos tambem sao copiadas para
-- arquivos proprios (feito pelo servidor): trocar ou apagar a foto na copia
-- nao apaga a do oficial.
--
-- FORA DA VISAO GERAL
--
-- Como o Time DEMO, a copia fica fora de toda metrica global — total de
-- times, integrantes, cadastros do dia, graficos, mapa geral, rankings e a
-- API `/api/v1`. Dentro da pagina da propria copia tudo aparece normalmente,
-- com o selo "Duplicado".
-- ===========================================================================

begin;

alter table public.cmd_clients
  add column if not exists is_copy boolean not null default false,
  add column if not exists copy_of_client_id uuid,
  add column if not exists copy_of_name text;

create index if not exists cmd_clients_is_copy_idx
  on public.cmd_clients (is_copy, created_at desc);

comment on column public.cmd_clients.is_copy is
  'Time duplicado (migration 049). Imutavel: oficial nao vira copia e copia nao vira oficial. Fica fora de toda metrica global.';
comment on column public.cmd_clients.copy_of_client_id is
  'Time de onde a copia saiu. Informativo: NAO e chave estrangeira, para nenhuma cascata ligar a copia ao oficial.';
comment on column public.cmd_clients.copy_of_name is
  'Nome do time de onde a copia saiu, no momento da duplicacao.';

-- Uma copia nunca e DEMO: sao dois recortes diferentes, e juntos nao
-- significariam nada.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cmd_clients_copy_check') then
    alter table public.cmd_clients add constraint cmd_clients_copy_check
      check (
        (is_copy and not is_demo and copy_of_client_id is not null)
        or (not is_copy and copy_of_client_id is null and copy_of_name is null)
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- O sinal nao muda depois de criado
--
-- Transformar um time oficial em copia esconderia uma operacao inteira dos
-- numeros; transformar uma copia em oficial misturaria o ensaio com a
-- operacao. Nenhuma das duas pode acontecer por edicao do registro.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_clients_copy_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_copy is distinct from old.is_copy
     or new.copy_of_client_id is distinct from old.copy_of_client_id then
    raise exception 'time duplicado nao pode ser convertido';
  end if;

  return new;
end
$$;

comment on function public.cmd_clients_copy_guard() is
  'Recusa converter time oficial em copia e copia em oficial. O resto do cadastro continua editavel.';

drop trigger if exists cmd_clients_copy_imutavel on public.cmd_clients;
create trigger cmd_clients_copy_imutavel
  before update on public.cmd_clients
  for each row execute function public.cmd_clients_copy_guard();

do $$
declare
  papel text;
begin
  execute 'revoke all on function public.cmd_clients_copy_guard() from public';

  foreach papel in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on function public.cmd_clients_copy_guard() from %I', papel);
    end if;
  end loop;
end
$$;

commit;
