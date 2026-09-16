-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 035: banner do celular por time
--
-- Execute no SQL Editor do Supabase depois de 034_time_demo_alagoas.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Nenhuma API externa e consultada.
--
-- POR QUE ELA EXISTE
--
-- O banner que aparece no celular de quem abre o link de cadastro era UM SO,
-- o mesmo arquivo para o sistema inteiro, com o endereco escrito no proprio
-- componente. Funcionava enquanto havia uma operacao. Com um Time DEMO na
-- mesma tela, a demonstracao passou a exibir o banner de producao de um
-- cliente real — a arte dele, o nome dele, na apresentacao de outra pessoa.
--
-- Agora cada time pode ter o SEU. A imagem vive no Storage privado, como
-- toda imagem do sistema, e a tabela guarda so o caminho e os metadados.
--
-- O QUE MUDA PARA QUEM JA EXISTE: NADA. As colunas nascem nulas, e time sem
-- banner proprio continua exibindo exatamente o arquivo de sempre.
-- ===========================================================================

begin;

alter table public.cmd_clients
  add column if not exists banner_path text,
  add column if not exists banner_mime text,
  add column if not exists banner_size integer;

-- Os tres campos andam juntos: ou o banner existe inteiro, com tipo e
-- tamanho, ou nao existe. Meio banner seria um caminho apontando para um
-- arquivo que ninguem sabe ler.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_clients_banner_check'
  ) then
    alter table public.cmd_clients
      add constraint cmd_clients_banner_check
      check (
        (banner_path is null and banner_mime is null and banner_size is null)
        or (
          banner_path is not null
          and banner_mime in ('image/jpeg', 'image/png', 'image/webp')
          and banner_size > 0
        )
      );
  end if;
end
$$;

comment on column public.cmd_clients.banner_path is
  'Banner do celular deste time, no Storage privado. Nulo: o time exibe o banner padrao do sistema.';
comment on column public.cmd_clients.banner_mime is
  'Tipo da imagem do banner. Somente JPG, PNG ou WEBP.';
comment on column public.cmd_clients.banner_size is
  'Tamanho do arquivo do banner, em bytes.';

commit;
