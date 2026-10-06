-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 059: Repositorio de Arquivos do time
--
-- Execute no SQL Editor do Supabase depois de 058_sala_de_apuracao.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum.
--
-- Cada time guarda os proprios arquivos: imagens, documentos e videos. Os
-- arquivos ficam no bucket PRIVADO `cmd-arquivos` (separado do `cmd-media`,
-- que so aceita fotos pequenas); a tabela guarda o caminho e os metadados.
-- O navegador nunca recebe a chave do banco: o servidor emite uma URL de
-- envio assinada (o arquivo vai direto para o bucket, sem passar pelo limite
-- de tamanho das funcoes) e, depois, URLs de leitura assinadas e curtas.
-- ===========================================================================

begin;

create table if not exists public.cmd_team_files (
  id uuid primary key default gen_random_uuid(),
  -- Excluir o time leva os registros junto. Os arquivos do bucket sao
  -- removidos pelo servidor na exclusao do time.
  client_id uuid not null references public.cmd_clients (id) on delete cascade,
  -- Caminho no bucket: `<client_id>/<uuid>.<extensao>`. Unico.
  path text not null unique check (length(path) between 5 and 500),
  -- Nome que a pessoa ve (e o do arquivo baixado).
  name text not null check (length(btrim(name)) between 1 and 255),
  mime text not null check (length(mime) between 3 and 150),
  size bigint not null check (size > 0),
  kind text not null check (kind in ('IMAGEM', 'VIDEO', 'DOCUMENTO', 'AUDIO', 'OUTRO')),
  -- Quem enviou. Sem chave estrangeira, de proposito: excluir a pessoa nao
  -- pode apagar o arquivo do time.
  uploaded_by_user_id text check (uploaded_by_user_id is null or length(uploaded_by_user_id) between 1 and 100),
  uploaded_by_name text check (uploaded_by_name is null or length(uploaded_by_name) between 1 and 200),
  created_at timestamptz not null default now()
);

create index if not exists cmd_team_files_client_idx
  on public.cmd_team_files (client_id, created_at desc);

alter table public.cmd_team_files enable row level security;
alter table public.cmd_team_files force row level security;

do $$
declare
  papel text;
begin
  foreach papel in array array['public', 'anon', 'authenticated']
  loop
    if papel = 'public' then
      execute 'revoke all on table public.cmd_team_files from public';
    elsif exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on table public.cmd_team_files from %I', papel);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.cmd_team_files to service_role';
  end if;
end
$$;

comment on table public.cmd_team_files is
  'Repositorio de Arquivos de cada time: imagens, documentos e videos (migration 059).';

-- ---------------------------------------------------------------------------
-- O bucket privado dos arquivos.
--
-- Criado aqui para o repositorio funcionar logo depois da migration. O
-- servidor tambem cria o bucket sozinho, se ele ainda nao existir, no
-- primeiro envio. O limite por arquivo e 500 MB; o plano do Supabase pode
-- impor um teto global menor (no plano gratuito, 50 MB).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'cmd-arquivos',
      'cmd-arquivos',
      false,
      524288000,
      array[
        'image/*',
        'video/*',
        'audio/*',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.oasis.opendocument.text',
        'application/vnd.oasis.opendocument.spreadsheet',
        'application/vnd.oasis.opendocument.presentation',
        'application/rtf',
        'text/plain',
        'text/csv',
        'application/zip',
        'application/x-zip-compressed',
        'application/vnd.rar',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
        'application/octet-stream'
      ]
    )
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;

commit;
