-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 048: Tags das pessoas do time
--
-- Execute no SQL Editor do Supabase depois de 047_dado_torto_entra_marcado.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e NAO APAGA NEM ALTERA DADO NENHUM que ja exista:
-- so cria tres tabelas novas e a primeira tag do catalogo.
--
-- O QUE E
--
-- Um catalogo de tags do sistema, administrado pelo ADMIN geral — por
-- exemplo "Coordenador Delta Operacional". A mesma tag pode ser colocada em
-- quantas pessoas quiser, de qualquer time, Lider ou Equipe.
--
-- Uma tag e uma DESIGNACAO, e nao uma troca de lugar: nada do que a pessoa
-- fez muda. Os cadastros que ela trouxe continuam dela, o link, o acesso, o
-- historico e o nivel na hierarquia (Lider ou Equipe) continuam iguais. Ela
-- so passa a carregar a tag, com a origem a vista: "Era Equipe · desde ...".
--
-- O QUE MUDA
--
--   1. cmd_tags: o catalogo. Nome, simbolo (ex.: Δ), cor e descricao.
--      Editar uma tag muda o nome/cor em TODAS as pessoas que a tem.
--
--   2. cmd_member_tags: quem tem qual tag — desde quando, quem colocou e o
--      nivel da pessoa naquele momento. Apagar a tag do catalogo a tira de
--      todo mundo (e so isso: a pessoa continua intacta).
--
--   3. cmd_member_tag_events: o historico. Cada tag colocada, retirada ou
--      apagada do catalogo vira uma linha, com o NOME da tag guardado como
--      retrato — o historico continua legivel mesmo depois de a tag sumir.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. O catalogo
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  symbol text check (symbol is null or char_length(symbol) between 1 and 3),
  color text not null default 'navy'
    check (color in ('navy', 'blue', 'green', 'orange', 'violet', 'rose', 'amber', 'slate')),
  description text check (description is null or char_length(description) <= 240),
  created_by_user_id uuid references public.cmd_users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Duas tags com o mesmo nome confundiriam quem le a lista.
create unique index if not exists cmd_tags_name_unique_idx
  on public.cmd_tags (lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- 2. Quem tem qual tag
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_member_tags (
  member_id uuid not null references public.cmd_members (id) on delete cascade,
  tag_id uuid not null references public.cmd_tags (id) on delete cascade,
  client_id uuid references public.cmd_clients (id) on delete cascade,
  -- O nivel da pessoa quando recebeu a tag: "Era Equipe", "Era Lider".
  from_tier text not null check (from_tier in ('LIDER', 'EQUIPE')),
  assigned_by_user_id uuid references public.cmd_users (id) on delete set null,
  assigned_by_name text,
  assigned_at timestamptz not null default now(),
  primary key (member_id, tag_id)
);

create index if not exists cmd_member_tags_tag_idx on public.cmd_member_tags (tag_id);
create index if not exists cmd_member_tags_client_idx on public.cmd_member_tags (client_id);

-- ---------------------------------------------------------------------------
-- 3. O historico
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_member_tag_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.cmd_members (id) on delete cascade,
  client_id uuid references public.cmd_clients (id) on delete cascade,
  tag_id uuid references public.cmd_tags (id) on delete set null,
  -- Retrato do nome: continua legivel depois de a tag ser apagada.
  tag_name text not null,
  action text not null check (action in ('ADDED', 'REMOVED', 'TAG_DELETED')),
  tier text not null check (tier in ('LIDER', 'EQUIPE')),
  by_user_id uuid references public.cmd_users (id) on delete set null,
  by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists cmd_member_tag_events_member_idx
  on public.cmd_member_tag_events (member_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. A primeira tag do catalogo
-- ---------------------------------------------------------------------------
insert into public.cmd_tags (name, symbol, color, description, created_by_name)
select
  'Coordenador Delta Operacional',
  'Δ',
  'navy',
  'Pessoa do time designada para a coordenacao operacional.',
  'Sistema'
where not exists (
  select 1 from public.cmd_tags
  where lower(btrim(name)) = lower('Coordenador Delta Operacional')
);

-- ---------------------------------------------------------------------------
-- 5. RLS e privilegios, no mesmo padrao das migrations anteriores
-- ---------------------------------------------------------------------------
do $$
declare
  tabela text;
  papel text;
begin
  foreach tabela in array array['cmd_tags', 'cmd_member_tags', 'cmd_member_tag_events']
  loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('alter table public.%I force row level security', tabela);

    foreach papel in array array['public', 'anon', 'authenticated']
    loop
      if papel = 'public' then
        execute format('revoke all on table public.%I from public', tabela);
      elsif exists (select 1 from pg_roles where rolname = papel) then
        execute format('revoke all on table public.%I from %I', tabela, papel);
      end if;
    end loop;

    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format(
        'grant select, insert, update, delete on table public.%I to service_role',
        tabela
      );
    end if;
  end loop;
end
$$;

comment on table public.cmd_tags is
  'Catalogo de tags das pessoas do time (migration 048).';
comment on table public.cmd_member_tags is
  'Tags de cada pessoa (migration 048): designacao, nao muda nivel nem cadastros.';
comment on table public.cmd_member_tag_events is
  'Historico das tags (migration 048): colocada, retirada ou apagada do catalogo.';

commit;
