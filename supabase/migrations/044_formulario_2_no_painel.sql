-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 044: a resposta do Formulario 2 pode pertencer a um integrante
--
-- Execute no SQL Editor do Supabase depois de 043_links_em_lote.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Nenhuma API externa e consultada.
--
-- POR QUE ELA EXISTE
--
-- O lider envia o Formulario 2 por link. Quando a pessoa esta na frente
-- dele, nao ha link nenhum: ele anota ali mesmo, pelo painel. E, nesse caso,
-- a pessoa PRECISA aparecer na equipe dele — foi ele quem a cadastrou, e o
-- painel dele e onde ele acompanha o proprio trabalho.
--
-- So que as respostas do Formulario 2 e os campos do Formulario 1 vivem em
-- tabelas diferentes, e e assim que tem de ser: `cmd_member_responses` tem
-- chave estrangeira para `cmd_form_fields`, e uma pergunta do Formulario 2
-- nao existe la. Gravar uma como se fosse a outra seria recusado pelo banco
-- — e, se passasse, misturaria dois formularios que o ADMIN configura
-- separadamente.
--
-- Entao o cadastro feito pelo painel vira DUAS coisas ligadas:
--
--   o INTEGRANTE, com o que o Formulario 2 tem de campo padrao (nome,
--   telefone, e o que mais o ADMIN tiver copiado do Formulario 1) — e por
--   isso ele aparece na equipe do lider, nas contagens e no mapa;
--
--   a RESPOSTA do Formulario 2, com as perguntas proprias dele, na tabela
--   de sempre e na aba de sempre — nada do que a pessoa respondeu se perde.
--
-- `member_id` e o que amarra as duas. Nulo em toda resposta que veio por
-- link, que e o caso de todas as que ja existem: ali nao ha integrante
-- nenhum, e continua nao havendo.
--
-- IDEMPOTENTE: `add column if not exists` e `create index if not exists`.
-- ===========================================================================

begin;

alter table public.cmd_survey_responses
  add column if not exists member_id uuid;

-- O par (integrante, time) e a chave de cmd_members, e e ele que viaja aqui:
-- assim uma resposta nunca aponta para um integrante de OUTRO time. Excluir
-- o integrante leva a resposta junto — ela e o cadastro dele.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_survey_responses_member_fk'
  ) then
    alter table public.cmd_survey_responses
      add constraint cmd_survey_responses_member_fk
      foreign key (member_id, client_id)
      references public.cmd_members (id, client_id) on delete cascade;
  end if;
end
$$;

-- Um integrante tem no maximo UMA resposta de Formulario 2 pelo painel: o
-- cadastro dele. Respostas por link continuam sem integrante, e o indice
-- parcial nao alcanca nenhuma delas.
create unique index if not exists cmd_survey_responses_member_key
  on public.cmd_survey_responses (member_id)
  where member_id is not null;

comment on column public.cmd_survey_responses.member_id is
  'Integrante criado junto com esta resposta, quando o Formulario 2 foi '
  'preenchido no painel pelo proprio lider (migration 044). Nulo em toda '
  'resposta que chegou por link: ali nao existe integrante.';

commit;

-- ---------------------------------------------------------------------------
-- CONFERENCIA (opcional, fora da transacao). As respostas antigas continuam
-- sem integrante, e as novas do painel aparecem com um:
--
--   select count(*) filter (where member_id is null) as por_link,
--          count(*) filter (where member_id is not null) as pelo_painel
--     from public.cmd_survey_responses;
-- ---------------------------------------------------------------------------
