-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 036: liga e desliga o acesso de um Time DEMO
--
-- Execute no SQL Editor do Supabase depois de 035_banner_do_time.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Nenhuma API externa e consultada.
--
-- POR QUE ELA EXISTE
--
-- Um Time DEMO fica na mao de quem esta apresentando, e nem sempre o acesso
-- deve continuar de pe depois da apresentacao. Sem uma chave, a unica saida
-- seria desativar cada administrador do time a mao — e religar depois,
-- adivinhando quem estava ativo antes.
--
-- A chave e UMA: uma coluna no time. Desligada, nenhuma sessao daquele time
-- resolve e nenhum login novo passa. Religada, tudo volta como estava, sem
-- ter mexido em usuario nenhum.
--
-- O QUE ELA NAO E: exclusao, desativacao de usuario, revogacao de sessao ou
-- troca de senha. Nada disso acontece — por isso ligar de volta e imediato e
-- nao perde nada.
--
-- SO TIME DEMO. O `check` abaixo recusa desligar o acesso de um time real:
-- uma operacao de verdade nao fica sem acesso por um clique em uma tela de
-- demonstracao, e uma linha de codigo errada tambem nao consegue faze-lo.
-- ===========================================================================

begin;

alter table public.cmd_clients
  add column if not exists demo_access_enabled boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_clients_demo_access_check'
  ) then
    alter table public.cmd_clients
      add constraint cmd_clients_demo_access_check
      check (demo_access_enabled or is_demo);
  end if;
end
$$;

comment on column public.cmd_clients.demo_access_enabled is
  'Acesso do Time DEMO ao sistema. Desligado, nenhuma sessao do time resolve e nenhum login passa. Time real nao pode ser desligado (check).';

commit;
