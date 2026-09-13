-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 024: para onde vai quem chega pelo dominio publico
--
-- Execute no SQL Editor do Supabase depois de 023_team_survey.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP, DELETE nem
-- TRUNCATE. Nenhuma API externa e consultada.
--
-- O sistema passa a ter DOIS enderecos com papeis diferentes:
--
--   painel.<dominio>   o painel. Login, cadastro, configuracoes, tudo.
--   <dominio>          o dominio publico, que vai nos links enviados por
--                      WhatsApp. Serve o formulario de cadastro, o
--                      questionario e o acesso do time — e MAIS NADA.
--
-- Quem chega ao dominio publico sem um link valido nao deve encontrar a
-- tela de login: e por ela que um ataque comeca, e ela nao tem por que
-- ficar exposta no endereco que milhares de pessoas recebem. Em vez disso,
-- essa pessoa e mandada para um endereco escolhido pelo ADMIN — o site da
-- campanha, uma rede social, o que ele decidir.
--
-- O endereco de destino mora aqui, e nao no codigo, porque muda sem
-- publicacao: e uma decisao do ADMIN, tomada na tela de Configuracoes.
--
-- Vazio significa "nao configurado": nesse caso a pessoa ve apenas um aviso
-- neutro, sem login, sem nome de time e sem nada que identifique o sistema.
--
-- Nenhuma tabela nova e nenhuma policy nova: a coluna entra em
-- public.cmd_settings, que ja tem RLS habilitado e forcado desde a 013 e ja
-- e alcancada somente pelo servidor, com a chave secreta.
-- ===========================================================================

begin;

alter table public.cmd_settings
  add column if not exists public_redirect_url text not null default '';

do $$
begin
  -- Endereco absoluto e http(s), ou vazio. Sem isso, um valor como
  -- "javascript:..." viraria um redirecionamento perigoso na tela publica.
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_settings_public_redirect_check'
  ) then
    alter table public.cmd_settings add constraint cmd_settings_public_redirect_check
      check (
        public_redirect_url = ''
        or (public_redirect_url ~ '^https?://[^[:space:]]+$' and length(public_redirect_url) <= 2000)
      );
  end if;
end
$$;

comment on column public.cmd_settings.public_redirect_url is
  'Para onde mandar quem chega ao dominio publico sem um link valido. Vazio: apenas um aviso neutro.';

commit;
