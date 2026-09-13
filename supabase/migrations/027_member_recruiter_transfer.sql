-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 027: trocar o responsavel por um cadastro
--
-- Execute no SQL Editor do Supabase depois de 026_survey_full_fields.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP, DELETE nem
-- TRUNCATE. Nenhuma API externa e consultada.
--
-- Quem se cadastra por um link fica ligado ao dono daquele link — e esse
-- vinculo decide quem enxerga a pessoa, quem aparece em "Cadastrado por" e
-- de quem e o numero no ranking da equipe.
--
-- Na pratica isso precisa poder mudar: o administrador do time sai da
-- campanha, dois administradores trocam de area, ou o link simplesmente foi
-- o errado. O ADMIN geral passa a poder passar um cadastro de um
-- responsavel para outro.
--
-- POR QUE ISSO DEIXA RASTRO
--
-- O sistema conta quantas pessoas cada um cadastrou, e o ranking da equipe e
-- lido como resultado de trabalho. Mover um cadastro de um nome para outro
-- muda esse numero dos dois lados. Sem registro, a mudanca fica
-- indistinguivel do que sempre foi verdade — e ninguem consegue responder
-- "por que o numero dele caiu?".
--
-- Sao tres colunas: quando mudou, quem mudou e de quem era antes. O
-- historico dos LINKS (cmd_invite_events) nao e tocado: la fica registrado
-- para sempre por qual link a pessoa entrou, e isso continua sendo verdade
-- mesmo depois da troca.
--
-- Nenhuma tabela nova e nenhuma policy nova: as colunas entram em
-- public.cmd_members, que ja tem RLS habilitado e forcado desde a 001.
-- ===========================================================================

begin;

alter table public.cmd_members
  add column if not exists recruiter_changed_at   timestamptz,
  add column if not exists recruiter_changed_by   uuid,
  add column if not exists recruiter_previous_name text;

do $$
begin
  -- Quem fez a troca. `on delete set null`: o ADMIN pode ser excluido depois,
  -- e o instante e o nome anterior continuam contando a historia.
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_members_recruiter_changed_by_fkey'
  ) then
    alter table public.cmd_members
      add constraint cmd_members_recruiter_changed_by_fkey
      foreign key (recruiter_changed_by) references public.cmd_users (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cmd_members_recruiter_previous_name_check'
  ) then
    alter table public.cmd_members
      add constraint cmd_members_recruiter_previous_name_check
      check (recruiter_previous_name is null or length(recruiter_previous_name) <= 120);
  end if;
end
$$;

comment on column public.cmd_members.recruiter_changed_at is
  'Instante da ultima troca de responsavel. Nulo enquanto o cadastro continua com quem o recebeu.';
comment on column public.cmd_members.recruiter_changed_by is
  'Quem fez a troca. Exclusivo do ADMIN geral.';
comment on column public.cmd_members.recruiter_previous_name is
  'Nome do responsavel anterior, guardado no momento da troca.';

commit;
