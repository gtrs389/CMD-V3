-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 032: a troca de responsavel passa a ser aceita pelo banco
--
-- Execute no SQL Editor do Supabase depois de 031_api_chave_vinculada.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Nenhuma tabela, coluna ou policy nova.
--
-- O QUE ESTAVA ERRADO
--
-- A migration 012 tornou a origem do cadastro IMUTAVEL: nenhum update podia
-- trocar `recruited_by_user_id`, `recruited_by_name` ou `recruited_by_role`.
-- Era a decisao certa naquele momento — o vinculo decide quem enxerga a
-- pessoa e de quem e o numero no ranking, e mudar isso em silencio nao pode
-- ser possivel.
--
-- A migration 027 criou a TROCA de responsavel: as colunas de auditoria
-- (quando mudou, quem mudou, de quem era antes), a rota e o botao "Alterar
-- responsavel" na ficha. Mas a guarda da 012 continuou de pe, e nenhuma
-- linha a ajustou. Resultado: o ADMIN geral clicava, o banco recusava com
-- 'origem do cadastro nao pode ser alterada', e a tela mostrava uma falha
-- generica. A funcionalidade nunca funcionou uma vez sequer.
--
-- O QUE MUDA AQUI
--
-- A origem continua imutavel. O que passa a existir e UMA excecao, e ela e
-- estreita de proposito: a troca so e aceita quando vem REGISTRADA, e com o
-- registro VERDADEIRO.
--
--   - `recruiter_changed_at` precisa ser novo (instante diferente do que
--     estava la);
--   - `recruiter_changed_by` precisa dizer quem trocou;
--   - `recruiter_previous_name` precisa ser EXATAMENTE o nome que esta
--     saindo.
--
-- E esta ultima condicao que sustenta tudo: nao da para reescrever a origem
-- sem gravar, na mesma linha, de quem ela era. Quem tentar mudar o
-- responsavel "por baixo" — direto no banco, por engano de codigo, por uma
-- rota nova mal escrita — continua recebendo a mesma recusa de sempre.
--
-- O desligamento da chave estrangeira (o responsavel foi excluido) continua
-- passando como antes: o identificador vira nulo e os snapshots de nome e
-- perfil permanecem, que e o que mantem o historico legivel.
--
-- Quem PODE trocar nao se decide aqui: `member.update` so existe no ADMIN
-- geral, e a rota confere permissao e alcance antes de chegar ao banco. Esta
-- guarda cuida da outra metade — que a troca, quando acontecer, deixe rastro
-- verdadeiro.
--
-- O historico dos LINKS (cmd_invite_events) nao e tocado por nada disto: la
-- continua registrado para sempre por qual link a pessoa entrou.
-- ===========================================================================

begin;

create or replace function public.cmd_members_recruiter_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_role      text;
  v_mudou     boolean;
  v_desligou  boolean;
  v_registrou boolean;
begin
  -- Coerencia do vinculo, igual a migration 012: o responsavel tem de
  -- existir, ser do MESMO time (ADMIN nao tem time e alcanca qualquer um) e
  -- o perfil gravado tem de bater com o perfil real. Vale no INSERT e,
  -- depois da troca, tambem no UPDATE — o destino e conferido pelo banco, e
  -- nao apenas pela rota.
  if new.recruited_by_user_id is not null then
    select u.client_id, u.role::text
      into v_client_id, v_role
      from public.cmd_users u
     where u.id = new.recruited_by_user_id;

    if not found then
      raise exception 'responsavel pelo cadastro nao encontrado';
    end if;

    if v_client_id is not null and v_client_id <> new.client_id then
      raise exception 'responsavel pertence a outro candidato';
    end if;

    if new.recruited_by_role is distinct from v_role then
      raise exception 'perfil do responsavel nao confere';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    v_mudou :=
         new.recruited_by_user_id is distinct from old.recruited_by_user_id
      or new.recruited_by_name    is distinct from old.recruited_by_name
      or new.recruited_by_role    is distinct from old.recruited_by_role;

    if v_mudou then
      -- 1. Responsavel excluido: o "on delete set null" tira o identificador
      --    e deixa os snapshots. E a unica perda aceita sem registro.
      v_desligou :=
             new.recruited_by_user_id is null
         and new.recruited_by_name is not distinct from old.recruited_by_name
         and new.recruited_by_role is not distinct from old.recruited_by_role;

      -- 2. Troca registrada (migration 027). O nome anterior gravado tem de
      --    ser o que esta saindo: e isso que impede reescrever a origem sem
      --    contar de quem ela era.
      v_registrou :=
             new.recruited_by_user_id is not null
         and new.recruited_by_name is not null
         and new.recruited_by_role is not null
         and new.recruiter_changed_at is not null
         and new.recruiter_changed_at is distinct from old.recruiter_changed_at
         and new.recruiter_changed_by is not null
         and new.recruiter_previous_name is not distinct from old.recruited_by_name;

      if not (v_desligou or v_registrou) then
        raise exception 'origem do cadastro nao pode ser alterada';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.cmd_members_recruiter_guard() is
  'Guarda a origem do cadastro: mesmo time, perfil conferido e alteracao somente com registro verdadeiro da troca.';

-- O gatilho da 012 continua o mesmo e ja aponta para esta funcao. Recriado
-- apenas quando nao existir, para o caso de um banco onde a 012 tenha sido
-- executada parcialmente.
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'cmd_members_recruiter_guard'
       and tgrelid = 'public.cmd_members'::regclass
  ) then
    create trigger cmd_members_recruiter_guard
      before insert or update on public.cmd_members
      for each row execute function public.cmd_members_recruiter_guard();
  end if;
end
$$;

commit;
