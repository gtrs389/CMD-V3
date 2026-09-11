-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 014: campos padrao "Zona eleitoral" e "Secao eleitoral"
--
-- Execute no SQL Editor do Supabase depois de 013_invite_expiration.sql.
-- Nao altera as anteriores. Idempotente, sem DROP de dados e dentro de uma
-- transacao: pode ser executada mais de uma vez com seguranca.
--
-- Zona e Secao seguem o mesmo padrao de Estado, Municipio, Bairro e Rua:
-- coluna propria em cmd_members e linha em cmd_form_fields com `system_key`.
--
-- As duas sao preenchidas automaticamente durante o preenchimento do link
-- publico, a partir da confirmacao do titulo de eleitor (consulta ao TSE),
-- mas continuam editaveis: se a consulta falhar, a pessoa preenche a mao e o
-- cadastro nunca fica travado por causa do fornecedor.
--
-- Integrantes ja cadastrados ficam com os dois campos nulos: nada e
-- preenchido sozinho.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Novas chaves de campo padrao
--
-- O CHECK e recriado inteiro, como nas migrations anteriores: `alter type`
-- em enum nao permitiria usar os valores novos nesta mesma transacao.
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
        'photo', 'name', 'phone', 'email',
        'gender', 'cpf', 'voter_id', 'zone', 'section', 'state', 'city', 'district', 'street',
        'relationship'
      )
    );
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Colunas em cmd_members
--
-- Somente digitos: zona com ate 3, secao com ate 4, como o TSE devolve.
-- ---------------------------------------------------------------------------
alter table public.cmd_members
  add column if not exists zone    text,
  add column if not exists section text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cmd_members_zone_check') then
    alter table public.cmd_members add constraint cmd_members_zone_check
      check (zone is null or zone ~ '^[0-9]{1,3}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cmd_members_section_check') then
    alter table public.cmd_members add constraint cmd_members_section_check
      check (section is null or section ~ '^[0-9]{1,4}$');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Campos nos clientes ja existentes
--
-- Cada campo entra visivel e opcional, no fim da lista, preservando a ordem
-- que o ADMIN ja tinha montado.
-- ---------------------------------------------------------------------------
insert into public.cmd_form_fields
  (client_id, system_key, type, label, placeholder, help_text, required, enabled, position, options)
select
  c.id,
  novo.system_key,
  novo.tipo::public.cmd_field_type,
  novo.label,
  novo.placeholder,
  novo.help_text,
  false,
  true,
  coalesce((select max(f.position) from public.cmd_form_fields f where f.client_id = c.id), -1)
    + novo.ordem,
  '[]'::jsonb
from public.cmd_clients c
cross join (values
  ('zone',    'text', 'Zona eleitoral',   '000',  'Preenchida automaticamente a partir do título de eleitor.', 1),
  ('section', 'text', 'Seção eleitoral',  '0000', 'Preenchida automaticamente a partir do título de eleitor.', 2)
) as novo(system_key, tipo, label, placeholder, help_text, ordem)
where not exists (
  select 1 from public.cmd_form_fields f
   where f.client_id = c.id and f.system_key = novo.system_key
);

-- ---------------------------------------------------------------------------
-- 4. Comentarios
-- ---------------------------------------------------------------------------
comment on column public.cmd_members.zone is
  'Zona eleitoral. Preenchida pela consulta do titulo de eleitor (TSE) durante o cadastro.';
comment on column public.cmd_members.section is
  'Secao eleitoral. Preenchida pela consulta do titulo de eleitor (TSE) durante o cadastro.';

commit;
