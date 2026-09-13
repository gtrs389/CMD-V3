-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 028: endereco dos links enviados
--
-- Execute no SQL Editor do Supabase depois de 027_member_recruiter_transfer.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP, DELETE nem
-- TRUNCATE. Nenhuma API externa e consultada.
--
-- O sistema tem dois enderecos: `painel.<dominio>`, onde o ADMIN e a equipe
-- trabalham, e o dominio publico, que vai nos links enviados por WhatsApp.
--
-- O link de cadastro era montado com o endereco da ABA ABERTA. Como quem
-- gera o link esta no painel, o link saia apontando para `painel.<dominio>`
-- — o endereco que justamente nao deve ser divulgado, e onde a pessoa
-- convidada cairia na tela de saida.
--
-- Agora quem monta o endereco e o servidor. Sem nada configurado aqui, ele
-- deriva do proprio painel: `painel.x` vira `www.x`. Esta coluna existe para
-- o caso de o endereco publico nao seguir essa forma — e para poder ser
-- corrigido sem publicar codigo, que e o tipo de coisa que nao pode depender
-- de um deploy.
--
-- Vazio significa "deduza": o comportamento automatico continua valendo.
--
-- Nenhuma tabela nova e nenhuma policy nova: a coluna entra em
-- public.cmd_settings, que ja tem RLS habilitado e forcado desde a 013.
-- ===========================================================================

begin;

alter table public.cmd_settings
  add column if not exists public_link_origin text not null default '';

do $$
begin
  -- Endereco absoluto http(s), sem caminho, ou vazio. Um valor com caminho
  -- ou com outro esquema montaria um link quebrado em cada convite enviado.
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_settings_public_link_origin_check'
  ) then
    alter table public.cmd_settings add constraint cmd_settings_public_link_origin_check
      check (
        public_link_origin = ''
        or (public_link_origin ~ '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'
            and length(public_link_origin) <= 255)
      );
  end if;
end
$$;

comment on column public.cmd_settings.public_link_origin is
  'Endereco publico usado nos links enviados. Vazio: deduzido do painel (painel.x vira www.x).';

commit;
