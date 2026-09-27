-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 047: dado torto nao barra o cadastro — entra marcado
--
-- Execute no SQL Editor do Supabase depois de 046_lideres_e_equipe.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e NAO APAGA DADO NENHUM: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. O que sai sao regras (constraints) e dois
-- indices unicos, que viram indices comuns — nenhuma linha e tocada.
--
-- POR QUE
--
-- A regra do sistema passou a ser uma so: CPF que nao fecha, titulo com
-- digito a menos, telefone pela metade, bairro de uma letra — a pessoa ENTRA,
-- seja Lider ou Equipe, e a ficha dela nasce com a etiqueta "Conferir", que
-- diz exatamente o que esta errado. Recusar por um numero mal copiado perde a
-- pessoa: ela fecha a pagina e nao volta.
--
-- A aplicacao ja parou de recusar. Faltava o banco: ele ainda exigia CPF com
-- exatamente 11 digitos e titulo com exatamente 12, e recusava sozinho um
-- CPF incompleto que a tela tinha deixado passar.
--
-- O QUE MUDA
--
--   1. CPF e titulo: somente digitos, de 1 a 14. Antes: exatamente 11 e 12.
--      Continua recusado o que nao e numero — isso nunca chega aqui, porque
--      o servidor so grava digitos.
--
--   2. Municipio, bairro e rua: de 1 a 120 caracteres. Antes: de 2 a 120.
--
--   3. CPF e titulo REPETIDOS no mesmo time passam a entrar. Os indices
--      unicos viram indices comuns (a busca continua rapida).
--
--      Isto e o ponto mais importante da migration. O indice unico
--      recusava a segunda ficha da mesma pessoa com uma mensagem generica —
--      "Já existe um registro com estes dados" — e a pessoa simplesmente nao
--      entrava, sem ninguem saber quem tentou, por qual link, nem quando. Com
--      a ficha entrando, o quadro de INCONSISTENCIAS mostra o repetido: os
--      dois registros lado a lado, quem cadastrou cada um, e qual e o
--      original. Decidir qual fica e de quem administra — nao de um indice.
--
-- O QUE NAO MUDA
--
--   - zona (1 a 3 digitos), secao (1 a 4 digitos), UF (as 27 siglas) e o
--     telefone (0 a 15 digitos): o servidor ja normaliza para caber;
--   - o acesso ao painel continua exigindo telefone INTEIRO (10 ou 11
--     digitos, em cmd_users): numero pela metade entra no cadastro, mas nao
--     abre porta;
--   - a consulta paga a FonteData so acontece com CPF valido: o servidor
--     pula a consulta quando o CPF nao fecha, sem gastar nada.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. CPF e titulo: somente digitos, de 1 a 14
-- ---------------------------------------------------------------------------
alter table public.cmd_members drop constraint if exists cmd_members_cpf_check;
alter table public.cmd_members
  add constraint cmd_members_cpf_check
  check (cpf is null or cpf ~ '^[0-9]{1,14}$');

alter table public.cmd_members drop constraint if exists cmd_members_voter_id_check;
alter table public.cmd_members
  add constraint cmd_members_voter_id_check
  check (voter_id is null or voter_id ~ '^[0-9]{1,14}$');

-- ---------------------------------------------------------------------------
-- 2. Municipio, bairro e rua: a partir de 1 caractere
-- ---------------------------------------------------------------------------
alter table public.cmd_members drop constraint if exists cmd_members_city_check;
alter table public.cmd_members
  add constraint cmd_members_city_check
  check (city is null or (length(btrim(city)) between 1 and 120 and city = btrim(city)));

alter table public.cmd_members drop constraint if exists cmd_members_district_check;
alter table public.cmd_members
  add constraint cmd_members_district_check
  check (district is null or (length(btrim(district)) between 1 and 120 and district = btrim(district)));

alter table public.cmd_members drop constraint if exists cmd_members_street_check;
alter table public.cmd_members
  add constraint cmd_members_street_check
  check (street is null or (length(btrim(street)) between 1 and 120 and street = btrim(street)));

-- ---------------------------------------------------------------------------
-- 3. Repetido entra: os indices unicos viram indices comuns
--
-- O indice comum e criado ANTES de o unico sair: em nenhum instante a busca
-- por CPF ou titulo fica sem indice.
-- ---------------------------------------------------------------------------
create index if not exists cmd_members_client_cpf_idx
  on public.cmd_members (client_id, cpf) where cpf is not null;

create index if not exists cmd_members_client_voter_id_idx
  on public.cmd_members (client_id, voter_id) where voter_id is not null;

drop index if exists public.cmd_members_client_cpf_uniq;
drop index if exists public.cmd_members_client_voter_id_uniq;

commit;

-- ---------------------------------------------------------------------------
-- CONFERENCIA (opcional, fora da transacao). Quantas fichas estao hoje com o
-- CPF ou o titulo fora do tamanho, por time:
--
--   select c.name as time,
--          count(*) filter (where length(m.cpf) <> 11)      as cpf_fora_do_tamanho,
--          count(*) filter (where length(m.voter_id) <> 12) as titulo_fora_do_tamanho
--     from public.cmd_members m
--     join public.cmd_clients c on c.id = m.client_id
--    group by c.name
--    order by c.name;
-- ---------------------------------------------------------------------------
