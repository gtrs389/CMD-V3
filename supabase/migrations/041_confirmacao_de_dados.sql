-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 041: confirmacao de dados pela FonteData, time a time
--
-- Execute no SQL Editor do Supabase depois de 040_troca_de_dominio_de_volta.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Nenhuma API externa e consultada.
--
-- POR QUE ELA EXISTE
--
-- Ate aqui, TODO cadastro feito pelo link publico consultava a FonteData: o
-- CPF, para conferir o nome, e a situacao eleitoral, para preencher zona e
-- secao sozinha. Cada consulta e cobrada, e nem todo time quer — ou pode —
-- pagar por isso.
--
-- A coluna liga e desliga essa confirmacao POR TIME. Desligada:
--
--   - nenhuma consulta a FonteData acontece para aquele time, em lugar
--     nenhum: nem no preenchimento do formulario, nem depois do envio, nem
--     pelo botao "Consultar de novo" da ficha do integrante;
--   - o formulario continua PERGUNTANDO se o CPF e o titulo digitados estao
--     certos. A conferencia passa a ser de quem preenche, e e a unica que
--     existe ali;
--   - zona e secao passam a ser OBRIGATORIAS e digitadas a mao, porque nao
--     ha mais consulta que as preencha.
--
-- PADRAO LIGADO: o comportamento de todo time que ja existe nao muda, e o
-- desligamento e sempre uma decisao explicita do ADMIN geral.
--
-- IDEMPOTENTE: `add column if not exists` nao recria a coluna, e rodar de
-- novo nao altera o valor de nenhum time.
-- ===========================================================================

begin;

alter table public.cmd_clients
  add column if not exists verification_enabled boolean not null default true;

comment on column public.cmd_clients.verification_enabled is
  'Confirmacao de CPF e titulo pela FonteData neste time (migration 041). '
  'Em false nenhuma consulta e feita para os cadastros dele, e zona e secao '
  'passam a ser obrigatorias e digitadas a mao no formulario publico.';

commit;

-- ---------------------------------------------------------------------------
-- CONFERENCIA (opcional, fora da transacao). Todo time existente deve
-- aparecer com a confirmacao LIGADA:
--
--   select id, name, verification_enabled from public.cmd_clients order by name;
-- ---------------------------------------------------------------------------
