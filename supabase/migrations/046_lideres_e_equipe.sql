-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 046: Lideres e Equipe — so o Lider cadastra
--
-- Execute no SQL Editor do Supabase depois de 045_inspecionar_painel.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Nenhuma tabela, coluna ou dado novo.
--
-- OS NOMES
--
-- Abaixo do Administrador do time existem dois niveis:
--
--   LIDER   quem o Administrador do time cadastra;
--   EQUIPE  quem um Lider cadastra.
--
-- A Equipe nao cadastra ninguem: a hierarquia termina nela.
--
-- POR QUE NAO HA COLUNA NOVA
--
-- O nivel ja esta gravado em todo cadastro desde a migration 012: e o perfil
-- de quem cadastrou (`recruited_by_role`). Cadastrado por alguem do perfil
-- EQUIPE — que e o Lider — e Equipe; qualquer outra origem e Lider. Uma
-- coluna de nivel seria uma segunda copia da mesma informacao, pronta para
-- ficar em desacordo com a primeira na proxima troca de responsavel. E por
-- isso que quem ja estava cadastrado foi reclassificado sem uma linha
-- reescrita.
--
-- O QUE ESTA MIGRATION FAZ
--
-- Uma guarda so, em cmd_members, repetindo no banco o que o servidor ja
-- confere antes de gravar:
--
--   1. ninguem da Equipe e responsavel por cadastro novo, nem recebe um
--      cadastro por troca de responsavel;
--   2. um Lider que ja tem Equipe nao passa para baixo de outro Lider — a
--      Equipe dele ficaria num terceiro nivel, que nao existe.
--
-- O que ja estava gravado nao e tocado: a guarda olha somente a linha que
-- esta sendo escrita, e somente quando o responsavel muda. O cadastro antigo
-- feito por quem hoje e Equipe continua exatamente onde esta.
--
-- Os links pessoais de quem e da Equipe nao precisam ser revogados aqui: o
-- servidor deixa de aceita-los na hora (`resolveInvite`), e se algum cadastro
-- chegasse ate o banco por eles, esta guarda o recusaria.
-- ===========================================================================

begin;

create or replace function public.cmd_members_lider_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nivel_responsavel text;
begin
  -- Nada mudou no responsavel: nao ha o que conferir. E isso que deixa em
  -- paz as edicoes comuns (nome, telefone, endereco) de qualquer cadastro,
  -- inclusive dos antigos.
  if tg_op = 'UPDATE'
     and new.recruited_by_user_id is not distinct from old.recruited_by_user_id
     and new.recruited_by_role is not distinct from old.recruited_by_role then
    return new;
  end if;

  -- 1. O responsavel tem de ser quem cadastra. Do perfil EQUIPE, o nivel
  --    dele e o de quem o cadastrou: se foi outro do perfil EQUIPE, ele e
  --    Equipe, e Equipe nao cadastra.
  if new.recruited_by_user_id is not null then
    select m.recruited_by_role
      into v_nivel_responsavel
      from public.cmd_users u
      join public.cmd_members m on m.id = u.member_id
     where u.id = new.recruited_by_user_id
       and u.role = 'EQUIPE';

    if v_nivel_responsavel = 'EQUIPE' then
      raise exception 'quem e da equipe nao cadastra: so o lider';
    end if;
  end if;

  -- 2. Passar a ser Equipe (ficar abaixo de um Lider) so para quem ainda nao
  --    cadastrou ninguem. O que sai daqui e a Equipe do Lider, que nao pode
  --    ficar pendurada num terceiro nivel.
  if tg_op = 'UPDATE'
     and new.recruited_by_role = 'EQUIPE'
     and old.recruited_by_role is distinct from 'EQUIPE'
     and exists (
       select 1
         from public.cmd_users u
         join public.cmd_members m on m.recruited_by_user_id = u.id
        where u.member_id = new.id
     ) then
    raise exception 'lider com equipe nao fica abaixo de outro lider';
  end if;

  return new;
end;
$$;

comment on function public.cmd_members_lider_guard() is
  'Lideres e Equipe (migration 046): so o Lider e responsavel por cadastro, '
  'e Lider com Equipe nao passa para baixo de outro Lider.';

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'cmd_members_lider_guard'
       and tgrelid = 'public.cmd_members'::regclass
  ) then
    create trigger cmd_members_lider_guard
      before insert or update on public.cmd_members
      for each row execute function public.cmd_members_lider_guard();
  end if;
end
$$;

commit;

-- ---------------------------------------------------------------------------
-- CONFERENCIA (opcional, fora da transacao). Quantos Lideres e quantos da
-- Equipe cada time tem hoje:
--
--   select c.name as time,
--          count(*) filter (where m.recruited_by_role is distinct from 'EQUIPE') as lideres,
--          count(*) filter (where m.recruited_by_role = 'EQUIPE')              as equipe
--     from public.cmd_members m
--     join public.cmd_clients c on c.id = m.client_id
--    group by c.name
--    order by c.name;
-- ---------------------------------------------------------------------------
