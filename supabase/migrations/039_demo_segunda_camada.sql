-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 039: a segunda camada do Time DEMO passa a ser aceita pelo banco
--
-- Execute no SQL Editor do Supabase depois de 038_time_estado_municipios.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Nenhuma tabela, coluna ou policy nova.
--
-- O QUE ESTAVA ERRADO
--
-- A segunda camada do Time DEMO — as pessoas da equipe que TAMBEM recrutam,
-- que e o que enche o "Ranking de cadastros equipe" — reescreve o
-- responsavel de parte das pessoas GERADAS. O banco recusava, com
-- 'origem do cadastro nao pode ser alterada' (P0001), e a tela pedia para
-- executar a migration 032, que ja estava executada.
--
-- A recusa estava CERTA para a regra que existia. A guarda das migrations
-- 012 e 032 diz: a origem do cadastro so muda quando a troca vem REGISTRADA
-- — quando mudou, quem mudou e de quem era. Isso protege o que a origem
-- decide: quem enxerga a pessoa e de quem e o numero no ranking.
--
-- O QUE MUDA AQUI, E POR QUE E ESTREITO
--
-- Uma terceira excecao, so para a linha GERADA de demonstracao: aquela que
-- tem `demo_seed`. A marca e escrita unicamente pela geracao do Time DEMO, e
-- e a mesma que a rotina de correcao ja usa para saber o que pode refazer.
--
-- A origem dessa linha e FABRICADA desde o INSERT — foi o proprio sistema
-- que escolheu, no momento da criacao, qual administrador "cadastrou" cada
-- pessoa ficticia. Ajustar a segunda camada e reescrever dado fabricado, e
-- nao adulterar historia real: nao ha de quem preservar. Exigir registro de
-- troca aqui encheria mil fichas ficticias de "responsavel alterado por
-- Fulano" — um historico de uma troca que nunca aconteceu, no meio de uma
-- apresentacao.
--
-- O QUE CONTINUA PROTEGIDO, exatamente como antes:
--
--   - todo cadastro REAL. Ele nunca tem `demo_seed`: a marca so e escrita
--     pela geracao;
--   - o cadastro feito A MAO durante uma demonstracao, inclusive dentro de
--     um Time DEMO. Ele tambem nao tem a marca — foi digitado por alguem, e
--     tem origem de verdade;
--   - a COERENCIA do vinculo, para todos: o responsavel tem de existir, ser
--     do mesmo time e ter o perfil que a linha diz que ele tem. Essa parte
--     da guarda nao e tocada aqui, e continua valendo tambem para o Time
--     DEMO;
--   - o desligamento por exclusao do responsavel, que ja passava.
--
-- A troca pela ficha ("Alterar responsavel") segue exigindo registro
-- verdadeiro, para qualquer pessoa, inclusive num Time DEMO com dado
-- gerado: quem passa pela rota GRAVA o registro, e uma troca registrada
-- continua sendo aceita pelo caminho de sempre.
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
  v_gerado    boolean;
begin
  -- Coerencia do vinculo, igual as migrations 012 e 032: o responsavel tem
  -- de existir, ser do MESMO time (ADMIN nao tem time e alcanca qualquer um)
  -- e o perfil gravado tem de bater com o perfil real. Vale no INSERT e no
  -- UPDATE, e vale TAMBEM para o dado gerado — a excecao abaixo dispensa o
  -- registro da troca, nunca a coerencia do destino.
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

      -- 3. Linha GERADA de demonstracao (migration 039). A origem dela e
      --    fabricada desde o INSERT, e a segunda camada a reescreve quando o
      --    ADMIN geral ajusta quantas pessoas do time tambem recrutam. A
      --    marca `demo_seed` so e escrita pela geracao: cadastro real, e
      --    cadastro feito a mao dentro de um Time DEMO, nao a tem, e
      --    continuam exigindo registro.
      v_gerado := old.demo_seed is not null and new.demo_seed is not null;

      if not (v_desligou or v_registrou or v_gerado) then
        raise exception 'origem do cadastro nao pode ser alterada';
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.cmd_members_recruiter_guard() is
  'Guarda a origem do cadastro: mesmo time, perfil conferido, e alteracao somente com registro verdadeiro da troca — ou na linha gerada de demonstracao, cuja origem e fabricada.';

-- O gatilho das migrations 012 e 032 continua o mesmo e ja aponta para esta
-- funcao. Recriado apenas quando nao existir.
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
