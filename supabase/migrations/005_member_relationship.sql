-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 005: campo padrao "Vinculo"
--
-- Execute no SQL Editor do Supabase depois de 001 a 004.
-- Nao altera as migrations anteriores. Idempotente, sem DROP de dados e
-- dentro de uma transacao.
--
-- O vinculo entra como campo padrao, com coluna propria em cmd_members. Sao
-- duas colunas:
--   relationship_option_id  identificador estavel da opcao escolhida
--   relationship_label      nome como estava no momento do cadastro
--
-- O nome guardado e a reserva do historico: se a opcao for excluida depois,
-- o cadastro antigo continua mostrando o que a pessoa escolheu. Enquanto a
-- opcao existir, a aplicacao exibe o nome atual, entao renomear nao quebra
-- nada.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Nova chave de campo padrao
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'cmd_form_fields_system_key_valido'
  ) then
    alter table public.cmd_form_fields drop constraint cmd_form_fields_system_key_valido;
  end if;

  alter table public.cmd_form_fields
    add constraint cmd_form_fields_system_key_valido check (
      system_key is null or system_key in (
        'photo', 'name', 'phone',
        'gender', 'cpf', 'voter_id', 'state', 'city', 'district',
        'relationship'
      )
    );
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Colunas em cmd_members
-- ---------------------------------------------------------------------------
alter table public.cmd_members
  add column if not exists relationship_option_id text,
  add column if not exists relationship_label     text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_members_relationship_option_check'
  ) then
    alter table public.cmd_members add constraint cmd_members_relationship_option_check
      check (relationship_option_id is null
             or (length(relationship_option_id) between 1 and 64
                 and relationship_option_id ~ '^[A-Za-z0-9_-]+$'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cmd_members_relationship_label_check'
  ) then
    alter table public.cmd_members add constraint cmd_members_relationship_label_check
      check (relationship_label is null or length(btrim(relationship_label)) between 1 and 80);
  end if;

  -- As duas colunas andam juntas: sem escolha, nenhuma delas existe.
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_members_relationship_completo'
  ) then
    alter table public.cmd_members add constraint cmd_members_relationship_completo
      check ((relationship_option_id is null and relationship_label is null)
             or (relationship_option_id is not null and relationship_label is not null));
  end if;
end
$$;

create index if not exists cmd_members_client_relationship_idx
  on public.cmd_members (client_id, relationship_option_id);

-- ---------------------------------------------------------------------------
-- 3. Campo nos clientes existentes
--
-- Visivel e opcional, no fim da lista, com as tres opcoes iniciais. Cada
-- opcao carrega o proprio identificador, icone e cor.
-- ---------------------------------------------------------------------------
insert into public.cmd_form_fields
  (client_id, system_key, type, label, placeholder, help_text, required, enabled, position, options)
select
  c.id,
  'relationship',
  'select'::public.cmd_field_type,
  'Vínculo',
  '',
  '',
  false,
  true,
  coalesce((select max(f.position) from public.cmd_form_fields f where f.client_id = c.id), -1) + 1,
  '[
     {"id": "familia",    "label": "Família",   "icon": "heart",     "color": "rose"},
     {"id": "amigo",      "label": "Amigo(a)",  "icon": "smile",     "color": "green"},
     {"id": "conhecido",  "label": "Conhecido", "icon": "handshake", "color": "orange"}
   ]'::jsonb
from public.cmd_clients c
where not exists (
  select 1 from public.cmd_form_fields f
   where f.client_id = c.id and f.system_key = 'relationship'
);

-- ---------------------------------------------------------------------------
-- 4. Comentarios
-- ---------------------------------------------------------------------------
comment on column public.cmd_members.relationship_option_id is
  'Identificador estavel da opcao de vinculo escolhida.';
comment on column public.cmd_members.relationship_label is
  'Nome da opcao no momento do cadastro. Preserva o historico se a opcao for excluida.';

commit;
