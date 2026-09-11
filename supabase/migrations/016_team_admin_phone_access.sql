-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 016: acesso dos Administradores do time por link + telefone
--
-- Execute no SQL Editor do Supabase depois de 015_team_people.sql.
-- Nao altera as anteriores. Idempotente, transacional e sem DROP TABLE,
-- DROP COLUMN, DELETE ou TRUNCATE: nenhum dado antigo e apagado.
--
-- O que muda:
--   1. O e-mail do time deixa de ser obrigatorio (os valores antigos ficam).
--   2. Cada Administrador do time (cmd_team_people) ganha um usuario proprio,
--      de perfil CANDIDATE, sem e-mail e sem senha, autenticado pelo par
--      LINK DO TIME + TELEFONE.
--   3. Um mesmo time passa a ter varios usuarios CANDIDATE (um por
--      administrador), no lugar do unico acesso por e-mail e senha.
--   4. Nasce a tabela do link administrativo do time, separada de
--      cmd_invites (que continua sendo o link de recrutamento: expira, e
--      reservado e e consumido por UMA pessoa).
--
-- O ADMIN geral nao e tocado: continua com e-mail e senha obrigatorios.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. E-mail do time deixa de ser obrigatorio
--
-- Os valores ja gravados continuam onde estao. Os checks de formato
-- avaliam como NULL quando a coluna e nula, entao aceitam a ausencia.
-- ---------------------------------------------------------------------------
alter table public.cmd_clients alter column email drop not null;

-- ---------------------------------------------------------------------------
-- 2. Alvo da chave estrangeira composta em cmd_team_people
--
-- O par (id, client_id) unico permite amarrar o usuario ao administrador do
-- MESMO time: o banco recusa um usuario de um time apontando para o
-- administrador de outro.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_team_people_id_client_uniq'
  ) then
    alter table public.cmd_team_people
      add constraint cmd_team_people_id_client_uniq unique (id, client_id);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. cmd_users: e-mail opcional, telefone de acesso e vinculo com o
--    administrador do time
-- ---------------------------------------------------------------------------
alter table public.cmd_users
  add column if not exists team_person_id uuid,
  add column if not exists phone text;

alter table public.cmd_users alter column email drop not null;

do $$
begin
  -- Telefone normalizado: apenas digitos. Fixo (10) ou celular (11).
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_users_phone_check'
  ) then
    alter table public.cmd_users
      add constraint cmd_users_phone_check
      check (phone is null or phone ~ '^[0-9]{10,11}$');
  end if;

  -- O ADMIN geral continua exigindo e-mail: so o acesso por telefone pode
  -- existir sem endereco.
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_users_admin_email_check'
  ) then
    alter table public.cmd_users
      add constraint cmd_users_admin_email_check
      check (role <> 'ADMIN' or email is not null);
  end if;

  -- O administrador apontado pertence ao mesmo time do usuario.
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_users_team_person_fk'
  ) then
    alter table public.cmd_users
      add constraint cmd_users_team_person_fk
      foreign key (team_person_id, client_id)
      references public.cmd_team_people (id, client_id) on delete cascade;
  end if;

  -- Coerencia entre perfil e vinculos, agora com o administrador do time.
  if exists (
    select 1 from pg_constraint where conname = 'cmd_users_role_vinculo_check'
  ) then
    alter table public.cmd_users drop constraint cmd_users_role_vinculo_check;
  end if;

  alter table public.cmd_users
    add constraint cmd_users_role_vinculo_check
    check (
      (role = 'ADMIN' and client_id is null and member_id is null and team_person_id is null)
      or (role = 'CANDIDATE' and client_id is not null and member_id is null)
      or (role = 'EQUIPE' and client_id is not null and member_id is not null
          and team_person_id is null)
    );
end
$$;

-- Varios administradores por time: o limite de um unico CANDIDATE por time
-- deixa de existir. O indice antigo era exatamente essa restricao.
drop index if exists public.cmd_users_candidate_client_id_key;

-- Um usuario por administrador do time.
create unique index if not exists cmd_users_team_person_id_key
  on public.cmd_users (team_person_id)
  where team_person_id is not null;

-- O mesmo telefone nunca se repete dentro do mesmo time. Em times
-- diferentes pode: o link identifica primeiro qual time esta sendo acessado.
create unique index if not exists cmd_users_client_phone_key
  on public.cmd_users (client_id, phone)
  where phone is not null;

-- ---------------------------------------------------------------------------
-- 4. Link administrativo do time
--
-- Separado de cmd_invites de proposito: este link nao expira sozinho, nao e
-- reservado, nao e consumido e serve a TODOS os administradores ativos do
-- time. Vale ate o ADMIN geral renovar ou revogar.
--
-- O token fica em claro porque o ADMIN geral precisa copia-lo; o hash existe
-- para a busca no acesso, sem varrer a tabela pelo valor bruto.
-- ---------------------------------------------------------------------------
create table if not exists public.cmd_team_access_links (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.cmd_clients (id) on delete cascade,

  token      text not null check (token ~ '^[A-Za-z0-9_-]{32,128}$'),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  active     boolean not null default true,

  -- Limite de tentativas por link: o telefone nao e senha, entao o link
  -- precisa travar depois de varias tentativas erradas.
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until    timestamptz,

  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cmd_team_access_links_client_uniq unique (client_id),
  constraint cmd_team_access_links_token_hash_uniq unique (token_hash)
);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'cmd_team_access_links_updated_at'
  ) then
    create trigger cmd_team_access_links_updated_at
      before update on public.cmd_team_access_links
      for each row execute function public.cmd_set_updated_at();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS e privilegios da tabela nova
-- ---------------------------------------------------------------------------
alter table public.cmd_team_access_links enable row level security;
alter table public.cmd_team_access_links force row level security;

do $$
declare
  papel text;
begin
  foreach papel in array array['public', 'anon', 'authenticated']
  loop
    if papel = 'public' then
      execute 'revoke all on table public.cmd_team_access_links from public';
    elsif exists (select 1 from pg_roles where rolname = papel) then
      execute format('revoke all on table public.cmd_team_access_links from %I', papel);
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.cmd_team_access_links '
         || 'to service_role';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Link administrativo para os times que ja existem
--
-- Token aleatorio de 256 bits, montado com gen_random_uuid() (gerador
-- aleatorio forte do PostgreSQL) e guardado tambem como SHA-256.
-- ---------------------------------------------------------------------------
insert into public.cmd_team_access_links (client_id, token, token_hash)
select c.id,
       t.token,
       encode(public.cmd_sha256(t.token), 'hex')
  from public.cmd_clients c
  cross join lateral (
    select replace(
             gen_random_uuid()::text || gen_random_uuid()::text, '-', ''
           ) as token
  ) t
 where not exists (
   select 1 from public.cmd_team_access_links l where l.client_id = c.id
 );

-- ---------------------------------------------------------------------------
-- 7. Acesso por telefone para os administradores ja cadastrados
--
-- Cada linha de cmd_team_people vira um usuario CANDIDATE proprio, sem
-- e-mail e sem senha: quem autentica e o par link + telefone.
-- ---------------------------------------------------------------------------
-- `distinct on` protege contra duas pessoas com o mesmo telefone dentro do
-- mesmo time: nesse caso a primeira da ordem de cadastro recebe o acesso, e
-- o ADMIN geral ajusta a outra depois. Sem isso a migration inteira falharia
-- no indice unico.
insert into public.cmd_users
  (name, email, phone, role, client_id, team_person_id, password_hash,
   must_change_password, is_active)
select distinct on (p.client_id, p.phone)
       p.name,
       null,
       p.phone,
       'CANDIDATE'::public.cmd_role,
       p.client_id,
       p.id,
       null,
       false,
       true
  from public.cmd_team_people p
 where not exists (
   select 1 from public.cmd_users u where u.team_person_id = p.id
 )
   and not exists (
     select 1 from public.cmd_users u
      where u.client_id = p.client_id and u.phone = p.phone
   )
 order by p.client_id, p.phone, p.position, p.created_at;

-- ---------------------------------------------------------------------------
-- 8. Acesso antigo do time (e-mail + senha) sai de operacao
--
-- A linha continua no banco, para o historico: ela apenas deixa de estar
-- ativa e as sessoes abertas sao revogadas. Times sem nenhum administrador
-- ficam sem acesso ate o ADMIN geral cadastrar o primeiro.
-- ---------------------------------------------------------------------------
update public.cmd_sessions s
   set revoked_at = now()
  from public.cmd_users u
 where s.user_id = u.id
   and u.role = 'CANDIDATE'
   and u.team_person_id is null
   and s.revoked_at is null;

update public.cmd_users
   set is_active = false,
       must_change_password = false
 where role = 'CANDIDATE'
   and team_person_id is null
   and is_active = true;

-- ---------------------------------------------------------------------------
-- 9. Comentarios
-- ---------------------------------------------------------------------------
comment on table public.cmd_team_access_links is
  'Link administrativo do time: unico por time, nao expira sozinho, nao e consumido e serve a todos os administradores ativos. Separado de cmd_invites (recrutamento).';
comment on column public.cmd_users.team_person_id is
  'Administrador do time correspondente. Preenchido apenas no acesso por link + telefone.';
comment on column public.cmd_users.phone is
  'Telefone normalizado (somente digitos) usado no acesso por link do time. Nunca e senha: o link faz parte obrigatoria da autenticacao.';

commit;
