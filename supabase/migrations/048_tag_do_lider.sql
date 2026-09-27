-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 048: tag do Lider
--
-- Execute no SQL Editor do Supabase depois de 047_dado_torto_entra_marcado.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Uma coluna nova, nula em todo cadastro que ja
-- existe.
--
-- O QUE E
--
-- O ADMIN geral coloca uma tag curta no Lider — "ZONA NORTE", "IGREJA",
-- "BAIRRO ALTO" — e cada pessoa da Equipe daquele Lider aparece com a mesma
-- tag ao lado do nome, na lista do time, no painel do Lider e na ficha.
--
-- POR QUE SO O LIDER GUARDA A TAG
--
-- A tag da Equipe e a do Lider dela: o servidor le a tag do responsavel na
-- mesma consulta que ja busca a foto e o nivel dele. Copiar a tag para cada
-- pessoa da Equipe criaria centenas de copias da mesma informacao, prontas
-- para ficar em desacordo na primeira troca de tag ou de responsavel. Assim,
-- trocar a tag do Lider muda a Equipe inteira na hora, e passar alguem para
-- outro Lider faz a pessoa assumir a tag do novo Lider, sem uma linha
-- reescrita.
--
-- Quem e da Equipe fica com a coluna nula: o servidor so grava tag em Lider.
-- ===========================================================================

begin;

alter table public.cmd_members
  add column if not exists tag text;

do $$
begin
  -- Curta, sem espaco sobrando nas pontas e nunca vazia: tag apagada e nulo.
  if not exists (select 1 from pg_constraint where conname = 'cmd_members_tag_check') then
    alter table public.cmd_members add constraint cmd_members_tag_check
      check (tag is null or (char_length(tag) between 1 and 24 and tag = btrim(tag)));
  end if;
end
$$;

comment on column public.cmd_members.tag is
  'Tag do Lider (migration 048). A Equipe dele mostra a mesma tag ao lado do nome, '
  'lida do Lider na hora: nao ha copia na Equipe.';

commit;
