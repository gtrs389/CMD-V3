-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Converte em INTEGRANTE as respostas do Formulario 2 preenchidas no painel
-- ANTES da migration 044.
--
-- Este arquivo NAO e uma migration: ele nao muda o desenho do banco. E um
-- conserto de dado, para rodar UMA vez, depois da 044.
--
-- O QUE ACONTECEU
--
-- Por um dia, o lider que preenchia o Formulario 2 pelo painel gerava apenas
-- a RESPOSTA: a pessoa aparecia na aba "Formulário 2", mas nao na equipe
-- dele. Nada se perdeu — o que faltou foi o registro de integrante, que a
-- 044 passou a criar junto.
--
-- O QUE ESTE SQL FAZ
--
-- Para cada resposta SEM link (`invite_id is null`), SEM integrante
-- (`member_id is null`) e com remetente conhecido, cria o integrante
-- correspondente — nome, telefone e o remetente como responsavel — e liga a
-- resposta a ele. As respostas que chegaram por LINK nao sao tocadas: ali
-- nunca houve integrante, e continua nao havendo.
--
-- NAO cria acesso nem link proprio, pelo mesmo motivo do cadastro novo: o
-- Formulario 2 nao da entrada no painel a quem responde.
--
-- IDEMPOTENTE: rodar de novo nao acha mais resposta nenhuma sem integrante,
-- e nao cria nada. Nada e apagado: nao ha DELETE, DROP nem TRUNCATE.
-- ===========================================================================

begin;

with orfas as (
  select r.id, r.client_id, r.name, r.phone, r.sender_user_id, r.answered_at
    from public.cmd_survey_responses r
   where r.invite_id is null
     and r.member_id is null
     and r.sender_user_id is not null
     -- O nome precisa caber na regra da coluna do integrante.
     and length(btrim(r.name)) between 2 and 120
     -- Telefone ja em uso no time identificaria duas pessoas: essa resposta
     -- fica de fora e e resolvida a mao.
     and not exists (
       select 1 from public.cmd_members m
        where m.client_id = r.client_id
          and m.phone = r.phone
          and coalesce(btrim(m.phone), '') <> ''
     )
),
criados as (
  insert into public.cmd_members (client_id, name, phone, source, recruited_by_user_id, created_at)
  select o.client_id, btrim(o.name), o.phone, 'admin', o.sender_user_id, o.answered_at
    from orfas o
  returning id, client_id, phone, name, recruited_by_user_id
)
update public.cmd_survey_responses r
   set member_id = c.id
  from criados c, orfas o
 where r.id = o.id
   and c.client_id = o.client_id
   and c.recruited_by_user_id = o.sender_user_id
   and c.name = btrim(o.name)
   and c.phone = o.phone;

commit;

-- ---------------------------------------------------------------------------
-- CONFERENCIA (opcional, fora da transacao).
--
-- Nao deve sobrar resposta do painel sem integrante:
--
--   select count(*) from public.cmd_survey_responses
--    where invite_id is null and member_id is null;
--
-- E a pessoa deve aparecer na equipe de quem a cadastrou:
--
--   select m.name, m.phone, u.name as cadastrado_por
--     from public.cmd_members m
--     join public.cmd_users u on u.id = m.recruited_by_user_id
--    where m.source = 'admin'
--    order by m.created_at desc limit 20;
--
-- Se alguma resposta ficou de fora, foi por telefone ja usado no time ou por
-- remetente ausente. Essas sao poucas e resolvem-se cadastrando a pessoa a
-- mao pela tela nova.
-- ---------------------------------------------------------------------------
