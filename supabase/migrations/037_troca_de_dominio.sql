-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 037: troca do dominio do sistema
--
-- Execute no SQL Editor do Supabase depois de 036_acesso_do_time_demo.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Nenhuma API externa e consultada.
--
-- POR QUE ELA EXISTE
--
-- O dominio do sistema mudou:
--
--   7061696e656c2061646d.convitetimebezerra.com  ->  7061696e656c2061646d.appdemo.sbs
--   painel.convitetimebezerra.com                ->  painel.appdemo.sbs
--   www.convitetimebezerra.com                   ->  www.appdemo.sbs
--
-- O CODIGO NAO PRECISA DE MUDANCA NENHUMA: `src/lib/domain/hosts.ts` nunca
-- soube qual e o dominio. Ele trabalha com os rotulos — `painel.`, o rotulo
-- do ADMIN, e o `www.` do dominio publico — e deduz um endereco do outro,
-- qualquer que seja o dominio abaixo deles.
--
-- O QUE NAO SE DEDUZ sao os dois enderecos que o ADMIN pode ter ESCRITO a
-- mao em Configuracoes -> "Entrada pelo dominio publico", e que ficam
-- gravados em public.cmd_settings:
--
--   public_link_origin   endereco que vai nos links enviados por WhatsApp.
--                        Preenchido com o dominio velho, TODO convite novo
--                        sairia apontando para um dominio que nao responde
--                        mais — e o DNS do dominio novo nao conserta isso,
--                        porque o valor gravado manda na frente da deducao;
--   public_redirect_url  para onde vai quem chega ao dominio publico sem um
--                        link valido.
--
-- Por isso esta migration mexe SO NESSES DOIS CAMPOS, e so na parte deles
-- que e o dominio: o esquema, a porta e o caminho ficam como estao.
--
-- Vazio continua vazio — vazio quer dizer "deduza", e a deducao ja da o
-- dominio novo sozinha.
--
-- IDEMPOTENTE: rodar de novo nao acha mais nenhuma ocorrencia do dominio
-- velho e nao muda nada. Um valor que ja aponta para o dominio novo, ou para
-- um dominio de terceiro, nao e tocado.
-- ===========================================================================

begin;

update public.cmd_settings
   set public_link_origin  = replace(public_link_origin,  'convitetimebezerra.com', 'appdemo.sbs'),
       public_redirect_url = replace(public_redirect_url, 'convitetimebezerra.com', 'appdemo.sbs'),
       updated_at          = now()
 where public_link_origin  like '%convitetimebezerra.com%'
    or public_redirect_url like '%convitetimebezerra.com%';

commit;

-- ---------------------------------------------------------------------------
-- CONFERENCIA (opcional, fora da transacao). Deve devolver os enderecos ja
-- com o dominio novo, ou vazio:
--
--   select public_link_origin, public_redirect_url from public.cmd_settings;
-- ---------------------------------------------------------------------------
