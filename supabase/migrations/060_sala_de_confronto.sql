-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 060: Sala de Confronto (as escolas enviadas para o duelo)
--
-- Execute no SQL Editor do Supabase depois de 059_repositorio_de_arquivos.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum.
--
-- O QUE E
--
-- No Raio-X de uma escola, "Enviar para sala de confronto" guarda a escola
-- aqui: os candidatos que estavam no mapa (o lado esquerdo), os Lideres
-- selecionados e o recorte do mapa (Lider, referencia, secao). Na pagina
-- Sala de Confronto, cada escola vira um duelo contra os adversarios que o
-- time chamar (o lado direito, guardado aqui tambem). Os votos e a gente do
-- time sao recalculados ao abrir: a apuracao anda e a sala anda junto.
--
-- `scope` e o time (o id do time) ou '' para o mapa geral do ADMIN. A mesma
-- escola enviada de novo no mesmo time atualiza a linha, nunca duplica.
--
-- Nenhum dado pessoal entra aqui: so a escola, candidatos (dado publico),
-- nome dos Lideres selecionados e quem enviou.
-- ===========================================================================

begin;

create table if not exists public.cmd_confrontation_schools (
  id uuid primary key default gen_random_uuid(),
  scope text not null default '' check (length(scope) <= 100),
  scope_name text check (length(scope_name) <= 200),
  school_key text not null check (length(school_key) between 1 and 300),
  title text not null check (length(title) between 1 and 300),
  address text check (length(address) <= 400),
  city text check (length(city) <= 120),
  uf text check (length(uf) <= 2),
  -- Os pinos da campanha que formam a escola (para achar a escola de novo).
  campaign_pins jsonb not null default '[]'::jsonb check (jsonb_typeof(campaign_pins) = 'array'),
  -- Resumo de cada candidato (o mesmo da lista da votacao).
  left_candidates jsonb not null check (jsonb_typeof(left_candidates) = 'array'),
  right_candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(right_candidates) = 'array'),
  -- [{ "id": chave do Lider, "nome": "..." }]
  leaders jsonb not null default '[]'::jsonb check (jsonb_typeof(leaders) = 'array'),
  -- { "leader", "references", "section", "rotulo" }: o recorte do mapa no envio.
  recorte jsonb not null default '{}'::jsonb check (jsonb_typeof(recorte) = 'object'),
  -- Os numeros da ultima leitura (para a lista abrir sem recalcular nada).
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  sent_by text check (length(sent_by) <= 100),
  sent_by_name text check (length(sent_by_name) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, school_key)
);

create index if not exists cmd_confrontation_schools_scope_idx
  on public.cmd_confrontation_schools (scope, updated_at desc);

alter table public.cmd_confrontation_schools enable row level security;
alter table public.cmd_confrontation_schools force row level security;

do $$
declare
  papel text;
begin
  foreach papel in array array['public', 'anon', 'authenticated']
  loop
    if papel = 'public' then
      execute 'revoke all on table public.cmd_confrontation_schools from public';
    elsif exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on table public.cmd_confrontation_schools from %I', papel);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.cmd_confrontation_schools to service_role';
  end if;
end
$$;

comment on table public.cmd_confrontation_schools is
  'Escolas enviadas para a Sala de Confronto, por time (migration 060).';

commit;

-- O PostgREST passa a enxergar a tabela nova sem reiniciar.
notify pgrst, 'reload schema';
