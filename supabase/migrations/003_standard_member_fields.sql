-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 003: novos campos padrao do integrante
--
-- Execute no SQL Editor do Supabase depois de 001 e 002.
-- Nao altera as migrations anteriores. Idempotente, sem DROP de dados e
-- dentro de uma transacao.
--
-- Acrescenta seis campos padrao, na mesma arquitetura de Foto, Nome e
-- Telefone: linha propria em cmd_form_fields (com system_key) e coluna
-- propria em cmd_members. Nada disso e duplicado em cmd_member_responses.
--
-- Todas as colunas sao opcionais: os cadastros ja existentes continuam
-- validos com valor nulo.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. system_key passa de enum para texto com CHECK
--
-- Motivo: `alter type ... add value` nao permite usar o valor novo na mesma
-- transacao, o que quebraria o preenchimento dos clientes existentes logo
-- abaixo. Com texto + CHECK, tudo acontece em uma transacao so.
--
-- O tipo public.cmd_system_field_key continua existindo e nao e removido.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'cmd_form_fields'
       and column_name = 'system_key'
       and data_type = 'USER-DEFINED'
  ) then
    alter table public.cmd_form_fields
      alter column system_key type text using system_key::text;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cmd_form_fields_system_key_valido'
  ) then
    alter table public.cmd_form_fields
      add constraint cmd_form_fields_system_key_valido check (
        system_key is null or system_key in (
          'photo', 'name', 'phone',
          'gender', 'cpf', 'voter_id', 'state', 'city', 'district'
        )
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Colunas proprias em cmd_members
--
-- Guardadas ja normalizadas: CPF e titulo apenas em digitos, UF em maiusculas,
-- municipio e bairro com espacos simples.
-- ---------------------------------------------------------------------------
alter table public.cmd_members
  add column if not exists gender   text,
  add column if not exists cpf      text,
  add column if not exists voter_id text,
  add column if not exists state    text,
  add column if not exists city     text,
  add column if not exists district text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cmd_members_gender_check') then
    alter table public.cmd_members add constraint cmd_members_gender_check
      check (gender is null or gender in ('HOMEM', 'MULHER', 'OUTRO', 'NAO_INFORMAR'));
  end if;

  -- Somente digitos. Os digitos verificadores sao conferidos na aplicacao.
  if not exists (select 1 from pg_constraint where conname = 'cmd_members_cpf_check') then
    alter table public.cmd_members add constraint cmd_members_cpf_check
      check (cpf is null or cpf ~ '^[0-9]{11}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cmd_members_voter_id_check') then
    alter table public.cmd_members add constraint cmd_members_voter_id_check
      check (voter_id is null or voter_id ~ '^[0-9]{12}$');
  end if;

  -- As 27 unidades da federacao, sempre em maiusculas.
  if not exists (select 1 from pg_constraint where conname = 'cmd_members_state_check') then
    alter table public.cmd_members add constraint cmd_members_state_check
      check (state is null or state in (
        'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
        'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cmd_members_city_check') then
    alter table public.cmd_members add constraint cmd_members_city_check
      check (city is null or (length(btrim(city)) between 2 and 120 and city = btrim(city)));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cmd_members_district_check') then
    alter table public.cmd_members add constraint cmd_members_district_check
      check (district is null or (length(btrim(district)) between 2 and 120 and district = btrim(district)));
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Unicidade por cliente, nunca global
--
-- O mesmo CPF pode aparecer em clientes diferentes; dentro de um cliente, nao.
-- Indice parcial: registros sem o dado nao concorrem entre si.
-- ---------------------------------------------------------------------------
create unique index if not exists cmd_members_client_cpf_uniq
  on public.cmd_members (client_id, cpf) where cpf is not null;

create unique index if not exists cmd_members_client_voter_id_uniq
  on public.cmd_members (client_id, voter_id) where voter_id is not null;

create index if not exists cmd_members_client_state_city_idx
  on public.cmd_members (client_id, state, city);

-- ---------------------------------------------------------------------------
-- 4. Campos nos clientes ja existentes
--
-- Cada campo entra visivel e opcional, no fim da lista, preservando a ordem
-- que o ADMIN ja tinha montado. Clientes que por algum motivo ja tenham o
-- campo sao ignorados pelo `not exists`.
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
  ('gender',   'select', 'Gênero',            '',                    'Opcional.',                        1),
  ('cpf',      'text',   'CPF',               '000.000.000-00',      'Somente números serão salvos.',    2),
  ('voter_id', 'text',   'Título de eleitor', '0000 0000 0000',      'Doze dígitos, sem o zero à frente.', 3),
  ('state',    'select', 'Estado (UF)',       '',                    '',                                 4),
  ('city',     'text',   'Município / Cidade','Nome da cidade',      '',                                 5),
  ('district', 'text',   'Bairro',            'Nome do bairro',      '',                                 6)
) as novo(system_key, tipo, label, placeholder, help_text, ordem)
where not exists (
  select 1 from public.cmd_form_fields f
   where f.client_id = c.id and f.system_key = novo.system_key
);

-- ---------------------------------------------------------------------------
-- 5. Comentarios
-- ---------------------------------------------------------------------------
comment on column public.cmd_members.gender is
  'Genero autodeclarado. Codigo fixo, traduzido para exibicao na aplicacao.';
comment on column public.cmd_members.cpf is
  'Somente digitos. Unico por cliente, nunca global. Digitos verificadores conferidos na aplicacao.';
comment on column public.cmd_members.voter_id is
  'Titulo de eleitor com 12 digitos. Valida apenas o formato, nao confirma existencia no TSE.';
comment on column public.cmd_members.state is 'Sigla da UF em maiusculas.';

commit;
