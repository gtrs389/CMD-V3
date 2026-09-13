-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 025: um formulario para cada link de cadastro
--
-- Execute no SQL Editor do Supabase depois de 024_public_entry_redirect.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP, DELETE nem
-- TRUNCATE. Nenhuma API externa e consultada.
--
-- O time tem DOIS links de cadastro, e eles recrutam gente diferente:
--
--   o do Administrador do time, que ele mesmo copia e envia;
--   o de cada integrante da equipe, que a equipe envia adiante.
--
-- Ate aqui os dois pediam exatamente as mesmas coisas. Agora cada um tem o
-- proprio formulario: o mesmo conjunto de campos, com o ADMIN decidindo,
-- para cada link, quais aparecem e quais sao obrigatorios.
--
-- POR QUE DUAS COLUNAS, E NAO DUAS LISTAS DE CAMPOS
--
-- Duplicar as linhas criaria dois campos "CPF", dois "Nome completo", dois de
-- cada — e as respostas ja gravadas apontam para o identificador do campo.
-- A ficha de quem se cadastrou antes passaria a depender de qual das copias
-- sobreviveu, o indice unico de campo padrao por time cairia, e toda consulta
-- que hoje procura o campo de endereco pela chave passaria a achar dois.
--
-- Um conjunto de campos, duas decisoes por campo: `enabled`/`required`
-- continuam sendo o link do Administrador do time, e as colunas novas sao o
-- link da equipe. Nada aponta para lugar nenhum novo, e a ficha continua
-- lendo os mesmos identificadores de sempre.
--
-- NO DIA EM QUE ESTA MIGRATION RODA, NADA MUDA NA TELA: as colunas novas
-- nascem com o valor que o campo ja tinha, entao os dois links continuam
-- pedindo exatamente o que pediam.
--
-- Nenhuma tabela nova e nenhuma policy nova: as colunas entram em
-- public.cmd_form_fields, que ja tem RLS habilitado e forcado desde a 001.
-- ===========================================================================

begin;

alter table public.cmd_form_fields
  add column if not exists enabled_equipe  boolean,
  add column if not exists required_equipe boolean;

-- O link da equipe comeca igual ao que ja existia. `coalesce` mantem a
-- migration idempotente: rodar de novo nao desfaz um ajuste ja feito pelo
-- ADMIN.
update public.cmd_form_fields
   set enabled_equipe  = coalesce(enabled_equipe, enabled),
       required_equipe = coalesce(required_equipe, required);

alter table public.cmd_form_fields
  alter column enabled_equipe  set not null,
  alter column required_equipe set not null,
  alter column enabled_equipe  set default true,
  alter column required_equipe set default false;

comment on column public.cmd_form_fields.enabled is
  'Campo aparece no link de cadastro do Administrador do time.';
comment on column public.cmd_form_fields.required is
  'Campo e obrigatorio no link de cadastro do Administrador do time.';
comment on column public.cmd_form_fields.enabled_equipe is
  'Campo aparece no link de cadastro da equipe.';
comment on column public.cmd_form_fields.required_equipe is
  'Campo e obrigatorio no link de cadastro da equipe.';

commit;
