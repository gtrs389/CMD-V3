-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 007: campo padrao "Rua"
--
-- Execute no SQL Editor do Supabase depois de 006_member_verification.sql.
-- Nao altera as anteriores. Idempotente, sem DROP de dados e dentro de uma
-- transacao: pode ser executada mais de uma vez com seguranca.
--
-- A Rua segue exatamente o padrao de Estado, Municipio e Bairro: coluna
-- propria em cmd_members, linha em cmd_form_fields com `system_key` e os
-- mesmos controles de edicao, obrigatoriedade, ativacao e exclusao.
--
-- Integrantes ja cadastrados ficam com Rua nula: nada e preenchido sozinho.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Nova chave de campo padrao
--
-- O CHECK e recriado inteiro, como nas migrations anteriores: `alter type`
-- em enum nao permitiria usar o valor novo nesta mesma transacao.
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
        'gender', 'cpf', 'voter_id', 'state', 'city', 'district', 'street',
        'relationship'
      )
    );
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Coluna em cmd_members
--
-- Mesmo formato de `city` e `district`: texto normalizado, sem espaco nas
-- pontas, entre 2 e 120 caracteres, sempre opcional.
-- ---------------------------------------------------------------------------
alter table public.cmd_members
  add column if not exists street text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cmd_members_street_check') then
    alter table public.cmd_members add constraint cmd_members_street_check
      check (street is null or (length(btrim(street)) between 2 and 120 and street = btrim(street)));
  end if;
end
$$;

create index if not exists cmd_members_client_district_street_idx
  on public.cmd_members (client_id, district, street);

-- ---------------------------------------------------------------------------
-- 3. Campo nos clientes existentes
--
-- Visivel e opcional, no fim da lista: a ordem que o ADMIN montou nao e
-- destruida. Para clientes novos, o campo nasce logo depois de Bairro, o que
-- e definido no construtor da aplicacao.
-- ---------------------------------------------------------------------------
insert into public.cmd_form_fields
  (client_id, system_key, type, label, placeholder, help_text, required, enabled, position, options)
select
  c.id,
  'street',
  'text'::public.cmd_field_type,
  'Rua',
  'Nome da rua',
  '',
  false,
  true,
  coalesce((select max(f.position) from public.cmd_form_fields f where f.client_id = c.id), -1) + 1,
  '[]'::jsonb
from public.cmd_clients c
where not exists (
  select 1 from public.cmd_form_fields f
   where f.client_id = c.id and f.system_key = 'street'
);

-- ---------------------------------------------------------------------------
-- 4. Comentarios
-- ---------------------------------------------------------------------------
comment on column public.cmd_members.street is
  'Nome da rua, com espacos simples. Apenas o nome e guardado: nenhum identificador de API.';

commit;
