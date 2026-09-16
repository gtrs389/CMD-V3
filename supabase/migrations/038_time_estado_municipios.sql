-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 038: estado e municipios do time
--
-- Execute no SQL Editor do Supabase depois de 037_troca_de_dominio.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Nenhuma API externa e consultada.
--
-- POR QUE ELA EXISTE
--
-- Um time e de algum lugar. Ate aqui o sistema so sabia disso INDIRETAMENTE,
-- pelo endereco de cada integrante cadastrado — ou seja, so depois de o
-- primeiro cadastro chegar, e nunca do time em si. Agora o proprio time diz
-- de onde e:
--
--   state_uf   O ESTADO. Obrigatorio no cadastro de um time novo.
--   cities     Os MUNICIPIOS onde ele atua. Opcional, e sao varios: uma
--              operacao raramente cabe em um municipio so, e obrigar a
--              escolher um seria pedir uma resposta errada.
--
-- TIMES QUE JA EXISTEM. A coluna do estado nasce NULA e continua aceitando
-- nulo: exigir estado aqui recusaria toda operacao ja cadastrada, sem que
-- ninguem tivesse como responder pelo banco. Quem exige e o cadastro de time
-- NOVO, na validacao; um time antigo ganha o estado quando o ADMIN abrir
-- "Editar time". Vazio significa "ainda nao informado", nunca "nao tem".
--
-- POR QUE `cities` E jsonb, E NAO UMA TABELA
--
-- E uma lista curta de nomes que o time escolhe de uma lista pronta, sem
-- dado proprio pendurado: nao ha o que relacionar, contar nem versionar por
-- municipio. Uma tabela aqui so acrescentaria junção a cada leitura do time.
-- O `check` abaixo garante que ela e sempre um ARRAY — nunca objeto, nunca
-- texto solto —, que e a unica forma de a leitura poder confiar nela sem
-- conferir tipo em todo lugar.
-- ===========================================================================

begin;

alter table public.cmd_clients
  add column if not exists state_uf text,
  add column if not exists cities jsonb not null default '[]'::jsonb;

do $$
begin
  -- Sigla de UF, em maiusculas, ou nulo. Um estado escrito a mao ("Sao
  -- Paulo", "sp ") nunca cruzaria com o endereco dos integrantes, que o
  -- sistema ja grava pela sigla.
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_clients_state_uf_check'
  ) then
    alter table public.cmd_clients add constraint cmd_clients_state_uf_check
      check (
        state_uf is null
        or state_uf in (
          'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
          'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
        )
      );
  end if;

  -- Sempre um array. Sem isto, um objeto gravado por engano quebraria a
  -- leitura do time inteiro, e nao so do campo.
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_clients_cities_check'
  ) then
    alter table public.cmd_clients add constraint cmd_clients_cities_check
      check (jsonb_typeof(cities) = 'array' and jsonb_array_length(cities) <= 200);
  end if;
end
$$;

comment on column public.cmd_clients.state_uf is
  'Estado do time, pela sigla da UF. Nulo nos times criados antes da 038: o cadastro novo exige, a edicao preenche.';
comment on column public.cmd_clients.cities is
  'Municipios onde o time atua, como array de nomes. Vazio: o time nao restringiu.';

commit;
