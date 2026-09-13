-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 026: o Formulario 2 aceita os MESMOS campos do Formulario 1
--
-- Execute no SQL Editor do Supabase depois de 024_public_entry_redirect.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE,
-- DROP COLUMN, DELETE nem TRUNCATE. Nenhuma API externa e consultada.
--
-- O Formulario 2 nasceu (migration 023) so com campos livres: nada de foto,
-- e nome e telefone eram fixos, escritos no codigo. A ideia era que ele
-- fosse leve. Na pratica o ADMIN quer partir do Formulario 1 inteiro — foto,
-- nome, telefone, CPF, endereco, vinculo — e ajustar dali.
--
-- Duas travas caem aqui:
--
--   1. o CHECK que recusava o tipo `photo`;
--   2. a ausencia de `system_key`, que impedia um campo do Formulario 2 de
--      ser reconhecido como nome, telefone ou foto.
--
-- `system_key` entra como TEXTO com CHECK, e nao como o enum
-- public.cmd_system_field_key: o enum parou de crescer na migration 003,
-- justamente porque `alter type ... add value` nao permite usar o valor novo
-- na mesma transacao. cmd_form_fields ja e texto pela mesma razao, e as duas
-- tabelas passam a aceitar exatamente a mesma lista.
--
-- O QUE `system_key` MUDA NO FORMULARIO 2: apenas o desenho e a validacao do
-- campo — a mascara do CPF, o formato do telefone, a lista de genero e de
-- UF, o envio da foto. NENHUMA consulta externa e acionada: a verificacao de
-- CPF e de titulo de eleitor pertence ao cadastro, depende do contexto do
-- convite e continua so la.
--
-- Quem responde o Formulario 2 continua NAO virando integrante: nada aqui
-- toca em cmd_members, cmd_users ou no acesso ao painel.
--
-- Nenhuma tabela nova e nenhuma policy nova: a coluna entra em
-- public.cmd_survey_fields, que ja tem RLS habilitado e forcado desde a 023.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Campo do Formulario 2 pode ser um campo padrao
-- ---------------------------------------------------------------------------
alter table public.cmd_survey_fields
  add column if not exists system_key text;

do $$
begin
  -- Mesma lista de cmd_form_fields (migration 014). As duas tabelas guardam
  -- os mesmos campos padrao, e uma lista diferente aqui faria a copia do
  -- Formulario 1 recusar um campo que existe la.
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_survey_fields_system_key_valido'
  ) then
    alter table public.cmd_survey_fields
      add constraint cmd_survey_fields_system_key_valido check (
        system_key is null or system_key in (
          'photo', 'name', 'phone', 'email',
          'gender', 'cpf', 'voter_id', 'zone', 'section', 'state', 'city', 'district', 'street',
          'relationship'
        )
      );
  end if;

  -- Um campo padrao de cada tipo por time: dois "Nome completo" no mesmo
  -- formulario nao seriam dois campos, seriam um erro de configuracao.
  if not exists (
    select 1 from pg_class where relname = 'cmd_survey_fields_system_key_uniq'
  ) then
    create unique index cmd_survey_fields_system_key_uniq
      on public.cmd_survey_fields (client_id, system_key)
      where system_key is not null;
  end if;
end
$$;

comment on column public.cmd_survey_fields.system_key is
  'Campo padrao correspondente, quando houver. Decide apenas o desenho e a validacao: nenhuma consulta externa e acionada no Formulario 2.';

-- ---------------------------------------------------------------------------
-- 2. O tipo `photo` deixa de ser recusado
--
-- `drop constraint` de um CHECK nao apaga dado nenhum: ele apenas para de
-- recusar linhas novas. As linhas ja gravadas continuam exatamente como
-- estao.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'cmd_survey_fields_type_check') then
    alter table public.cmd_survey_fields drop constraint cmd_survey_fields_type_check;
  end if;
end
$$;

commit;
