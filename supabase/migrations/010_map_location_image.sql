-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 010: imagem do local no mapa
--
-- Execute no SQL Editor do Supabase depois de 009. Idempotente, sem DROP e
-- dentro de uma transacao.
--
-- Guarda apenas o endereco de uma miniatura do local, sempre HTTPS. Nenhuma
-- lista de imagens, Street View, avaliacao ou resposta bruta e gravada.
-- ===========================================================================

begin;

alter table public.cmd_map_locations
  add column if not exists image_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cmd_map_locations_image_url_check') then
    alter table public.cmd_map_locations add constraint cmd_map_locations_image_url_check
      check (image_url is null or (image_url ~ '^https://' and length(image_url) <= 1000));
  end if;
end
$$;

comment on column public.cmd_map_locations.image_url is
  'Miniatura do local (HTTPS). Apenas uma imagem; nada mais da resposta e guardado.';

commit;
