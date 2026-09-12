-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 022: estampa do banner ajustavel por time
--
-- Execute no SQL Editor do Supabase depois de 021_invite_click_attempts.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP, DELETE nem
-- TRUNCATE. Nenhuma API externa e consultada.
--
-- O formulario publico aberto no celular mostra o banner do time com a
-- identificacao "#NOME DO TIME" estampada por cima. Ate aqui a posicao, o
-- tamanho e a cor dessa estampa eram numeros fixos no codigo, iguais para
-- todo mundo — e cada banner tem a camisa em um lugar diferente.
--
-- Agora eles moram na linha do proprio time, e o ADMIN geral ajusta pela
-- tela, vendo o resultado na hora.
--
-- Tudo em PORCENTAGEM da propria imagem, nunca em pixels da tela: e isso que
-- mantem a estampa no mesmo ponto do banner quando ele encolhe no celular.
-- O tamanho da fonte segue a largura da imagem pela mesma razao.
--
-- Nenhuma tabela nova, nenhuma policy nova: as colunas entram em
-- public.cmd_clients, que ja tem RLS habilitado e forcado desde a 001 e ja e
-- alcancada somente pelo servidor, com a chave secreta.
-- ===========================================================================

begin;

alter table public.cmd_clients
  -- Faixa horizontal da estampa, em % da largura da imagem. O texto e
  -- centralizado dentro dela.
  add column if not exists banner_tag_left  numeric(6,3) not null default 1.5,
  add column if not exists banner_tag_width numeric(6,3) not null default 16,
  -- Altura da estampa, em % da altura da imagem.
  add column if not exists banner_tag_top   numeric(6,3) not null default 60,
  -- Corpo da fonte, em % da LARGURA da imagem (unidade `cqw` no navegador).
  add column if not exists banner_tag_size  numeric(6,3) not null default 1.45,
  -- Cor do texto, em hexadecimal de 6 digitos.
  add column if not exists banner_tag_color text not null default '#0b5c2c';

do $$
begin
  -- Limites largos, apenas para nao existir valor sem sentido: a estampa
  -- pode ficar em qualquer canto da imagem, mas nunca fora dela.
  if not exists (select 1 from pg_constraint where conname = 'cmd_clients_banner_tag_left_check') then
    alter table public.cmd_clients add constraint cmd_clients_banner_tag_left_check
      check (banner_tag_left between 0 and 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cmd_clients_banner_tag_width_check') then
    alter table public.cmd_clients add constraint cmd_clients_banner_tag_width_check
      check (banner_tag_width between 1 and 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cmd_clients_banner_tag_top_check') then
    alter table public.cmd_clients add constraint cmd_clients_banner_tag_top_check
      check (banner_tag_top between 0 and 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cmd_clients_banner_tag_size_check') then
    alter table public.cmd_clients add constraint cmd_clients_banner_tag_size_check
      check (banner_tag_size between 0.3 and 20);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cmd_clients_banner_tag_color_check') then
    alter table public.cmd_clients add constraint cmd_clients_banner_tag_color_check
      check (banner_tag_color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end
$$;

comment on column public.cmd_clients.banner_tag_left is
  'Inicio da faixa da estampa, em % da largura da imagem do banner.';
comment on column public.cmd_clients.banner_tag_width is
  'Largura da faixa da estampa, em % da largura da imagem. O texto e centralizado nela.';
comment on column public.cmd_clients.banner_tag_top is
  'Altura da estampa, em % da altura da imagem.';
comment on column public.cmd_clients.banner_tag_size is
  'Corpo da fonte da estampa, em % da largura da imagem.';
comment on column public.cmd_clients.banner_tag_color is
  'Cor do texto da estampa, em hexadecimal de 6 digitos.';

commit;
