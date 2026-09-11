-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 012: hierarquia de recrutamento e acesso da EQUIPE
--
-- Execute no SQL Editor do Supabase depois de 011. Nao altera nenhuma
-- migration anterior. Roda inteira dentro de UMA transacao, e idempotente
-- (pode ser executada duas vezes seguidas sem efeito adicional) e nao apaga
-- dado nenhum: nao ha DROP TABLE, DROP COLUMN, DELETE nem TRUNCATE.
--
-- O perfil 'EQUIPE' ja existe no enum public.cmd_role desde a migration 001,
-- por isso nao e preciso um bloco separado so para o enum: tudo cabe na
-- mesma transacao.
--
-- Continua sem Supabase Authentication: nenhuma referencia a auth.users,
-- auth.uid() ou policy baseada em sessao do Supabase. Usuarios, senhas e
-- sessoes seguem em cmd_users e cmd_sessions, acessadas somente pelo
-- servidor do Next.js com a chave secreta.
--
-- Senha em texto puro nunca chega ao banco: as funcoes abaixo recebem
-- somente o hash scrypt ja calculado pelo servidor.
--
-- Regra da hierarquia, garantida aqui e repetida nos servicos e rotas:
--   ADMIN      ve tudo.
--   CANDIDATE  ve toda a operacao dele (qualquer nivel).
--   EQUIPE     ve somente quem se cadastrou pelo proprio link.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. cmd_users: vinculo com o integrante (perfil EQUIPE)
--
-- ADMIN:     client_id nulo  e member_id nulo.
-- CANDIDATE: client_id valido e member_id nulo.
-- EQUIPE:    client_id valido e member_id valido, do MESMO candidato.
-- ---------------------------------------------------------------------------
alter table public.cmd_users
  add column if not exists member_id uuid;

-- Alvo das chaves estrangeiras compostas: o par (id, client_id) e unico.
-- Serve para amarrar convite e integrante ao mesmo candidato do usuario.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_users_id_client_uniq'
  ) then
    alter table public.cmd_users
      add constraint cmd_users_id_client_uniq unique (id, client_id);
  end if;
end
$$;

-- Chave composta: o integrante apontado pertence ao mesmo candidato do
-- usuario. Nao existe usuario EQUIPE de um candidato apontando para
-- integrante de outro: o banco recusa antes do servico.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_users_member_fk'
  ) then
    alter table public.cmd_users
      add constraint cmd_users_member_fk
      foreign key (member_id, client_id)
      references public.cmd_members (id, client_id) on delete cascade;
  end if;
end
$$;

-- Um unico usuario EQUIPE por integrante. Varios usuarios EQUIPE podem
-- conviver dentro do mesmo candidato: o indice e por integrante, nao por
-- candidato.
create unique index if not exists cmd_users_member_id_key
  on public.cmd_users (member_id)
  where member_id is not null;

-- O indice de "um candidato por client_id" passa a valer somente para
-- CANDIDATE. Sem isso o primeiro usuario EQUIPE bloquearia todos os outros
-- da mesma operacao.
drop index if exists public.cmd_users_client_id_key;

create unique index if not exists cmd_users_candidate_client_id_key
  on public.cmd_users (client_id)
  where role = 'CANDIDATE';

-- Coerencia entre perfil e vinculos. Substitui o check da migration 011,
-- que so conhecia ADMIN e CANDIDATE.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'cmd_users_client_role_check'
  ) then
    alter table public.cmd_users drop constraint cmd_users_client_role_check;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cmd_users_role_vinculo_check'
  ) then
    alter table public.cmd_users
      add constraint cmd_users_role_vinculo_check
      check (
        (role = 'ADMIN'     and client_id is null     and member_id is null)
        or (role = 'CANDIDATE' and client_id is not null and member_id is null)
        or (role = 'EQUIPE'    and client_id is not null and member_id is not null)
      );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. cmd_members: e-mail padrao do integrante
--
-- O e-mail passa a ser o identificador de acesso do integrante. Guardado
-- sempre em minusculas, sem espaco nas pontas, e unico em todo o sistema.
-- A coluna e opcional no banco porque os integrantes antigos nao tem valor:
-- eles ficam sem acesso ate que alguem informe o e-mail. Nos cadastros
-- novos a obrigatoriedade e do formulario, que nasce com o campo ativo e
-- obrigatorio (secao 4).
-- ---------------------------------------------------------------------------
alter table public.cmd_members
  add column if not exists email text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cmd_members_email_check') then
    alter table public.cmd_members add constraint cmd_members_email_check
      check (
        email is null
        or (
          length(email) between 6 and 254
          and email = lower(email)
          and email = btrim(email)
          and email ~ '^[^@[:space:]]{1,64}@[^@[:space:]]{1,189}\.[a-z]{2,24}$'
        )
      );
  end if;
end
$$;

-- Unico no sistema inteiro: o e-mail e a credencial de entrada.
create unique index if not exists cmd_members_email_key
  on public.cmd_members (email)
  where email is not null;

-- ---------------------------------------------------------------------------
-- 3. cmd_members: origem imutavel do cadastro
--
-- `recruited_by_user_id` aponta para quem era o dono do link usado. As duas
-- colunas de snapshot preservam a informacao mesmo que o usuario responsavel
-- seja excluido depois: a ficha continua mostrando "Fulano - Equipe
-- (acesso removido)" em vez de perder o historico.
--
-- Registro antigo, de antes deste rastreamento, fica com tudo nulo e a
-- interface mostra "Cadastro anterior ao rastreamento". Nada e atribuido a
-- ninguem sem evidencia.
-- ---------------------------------------------------------------------------
alter table public.cmd_members
  add column if not exists recruited_by_user_id uuid,
  add column if not exists recruited_by_name    text,
  add column if not exists recruited_by_role    text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_members_recruited_by_fkey'
  ) then
    alter table public.cmd_members
      add constraint cmd_members_recruited_by_fkey
      foreign key (recruited_by_user_id) references public.cmd_users (id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'cmd_members_recruited_by_role_check'
  ) then
    alter table public.cmd_members
      add constraint cmd_members_recruited_by_role_check
      check (recruited_by_role is null or recruited_by_role in ('ADMIN', 'CANDIDATE', 'EQUIPE'));
  end if;

  -- O nome so existe junto com o perfil: meia evidencia nao vira historico.
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_members_recruited_by_snapshot_check'
  ) then
    alter table public.cmd_members
      add constraint cmd_members_recruited_by_snapshot_check
      check (
        (recruited_by_name is null and recruited_by_role is null)
        or (recruited_by_name is not null and recruited_by_role is not null
            and length(btrim(recruited_by_name)) between 2 and 120)
      );
  end if;

  -- Sem snapshot nao pode haver vinculo: o historico e obrigatorio.
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_members_recruited_by_completo_check'
  ) then
    alter table public.cmd_members
      add constraint cmd_members_recruited_by_completo_check
      check (recruited_by_user_id is null or recruited_by_name is not null);
  end if;
end
$$;

create index if not exists cmd_members_recruiter_idx
  on public.cmd_members (client_id, recruited_by_user_id, created_at desc);

-- Guarda do vinculo: o responsavel precisa ser do MESMO candidato (ou um
-- ADMIN, que nao tem candidato). Bloqueia no banco qualquer tentativa de
-- ligar o cadastro de um candidato a um usuario de outro, venha de onde vier.
-- Tambem torna a origem imutavel: depois de gravada, so pode perder o
-- usuario (exclusao do recrutador), nunca trocar de dono nem de snapshot.
create or replace function public.cmd_members_recruiter_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_role      text;
begin
  if new.recruited_by_user_id is not null then
    select u.client_id, u.role::text
      into v_client_id, v_role
      from public.cmd_users u
     where u.id = new.recruited_by_user_id;

    if not found then
      raise exception 'responsavel pelo cadastro nao encontrado';
    end if;

    -- ADMIN nao tem candidato e alcanca qualquer operacao. Os demais so
    -- podem recrutar dentro do proprio candidato.
    if v_client_id is not null and v_client_id <> new.client_id then
      raise exception 'responsavel pertence a outro candidato';
    end if;

    if new.recruited_by_role is distinct from v_role then
      raise exception 'perfil do responsavel nao confere';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- Origem imutavel. A unica mudanca aceita e a perda do usuario, feita
    -- pelo "on delete set null" quando o recrutador e excluido.
    if old.recruited_by_user_id is not null
       and new.recruited_by_user_id is distinct from old.recruited_by_user_id
       and new.recruited_by_user_id is not null then
      raise exception 'origem do cadastro nao pode ser alterada';
    end if;

    if old.recruited_by_name is not null
       and new.recruited_by_name is distinct from old.recruited_by_name then
      raise exception 'origem do cadastro nao pode ser alterada';
    end if;

    if old.recruited_by_role is not null
       and new.recruited_by_role is distinct from old.recruited_by_role then
      raise exception 'origem do cadastro nao pode ser alterada';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.cmd_members_recruiter_guard() is
  'Guarda a origem do cadastro: mesmo candidato, perfil conferido e valor imutavel.';

do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'cmd_members_recruiter_guard'
       and tgrelid = 'public.cmd_members'::regclass
  ) then
    create trigger cmd_members_recruiter_guard
      before insert or update on public.cmd_members
      for each row execute function public.cmd_members_recruiter_guard();
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Campo padrao "E-mail" no formulario
--
-- Entra como os demais campos padrao: linha propria em cmd_form_fields com
-- `system_key`, coluna propria em cmd_members. Nasce ATIVO e OBRIGATORIO,
-- porque e o que da acesso ao CMD. O CHECK e recriado inteiro, como nas
-- migrations anteriores.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'cmd_form_fields_system_key_valido'
  ) then
    alter table public.cmd_form_fields drop constraint cmd_form_fields_system_key_valido;
  end if;

  alter table public.cmd_form_fields
    add constraint cmd_form_fields_system_key_valido check (
      system_key is null or system_key in (
        'photo', 'name', 'phone', 'email',
        'gender', 'cpf', 'voter_id', 'state', 'city', 'district', 'street',
        'relationship'
      )
    );
end
$$;

-- Candidatos que ja existiam recebem o campo no fim da lista, preservando a
-- ordem montada pelo ADMIN. O `not exists` impede duplicacao: rodar de novo
-- nao cria um segundo campo.
insert into public.cmd_form_fields
  (client_id, system_key, type, label, placeholder, help_text, required, enabled, position, options)
select
  c.id,
  'email',
  'email'::public.cmd_field_type,
  'E-mail',
  'voce@exemplo.com',
  'Usado para acessar o CMD.',
  true,
  true,
  coalesce((select max(f.position) from public.cmd_form_fields f where f.client_id = c.id), -1) + 1,
  '[]'::jsonb
from public.cmd_clients c
where not exists (
  select 1 from public.cmd_form_fields f
   where f.client_id = c.id and f.system_key = 'email'
);

-- O campo e obrigatorio para o acesso: mesmo que alguem tenha conseguido
-- desativa-lo antes, ele volta a ativo e obrigatorio.
update public.cmd_form_fields
   set required = true, enabled = true
 where system_key = 'email'
   and (required is distinct from true or enabled is distinct from true);

-- ---------------------------------------------------------------------------
-- 5. Backfill seguro do e-mail dos integrantes antigos
--
-- Aproveita apenas valor que ja existia em um campo de e-mail do proprio
-- formulario (type = 'email'). Nada e inventado e nada e sobrescrito:
--   - integrante que ja tem e-mail e ignorado;
--   - valor fora do formato e descartado;
--   - valor repetido (entre integrantes ou ja usado por um usuario) e
--     descartado inteiro, para nenhum acesso nascer trocado.
-- ---------------------------------------------------------------------------
with candidatos as (
  select distinct on (r.member_id)
         r.member_id,
         lower(btrim(r.value #>> '{}')) as email
    from public.cmd_member_responses r
    join public.cmd_form_fields f
      on f.id = r.field_id and f.client_id = r.client_id
    join public.cmd_members m
      on m.id = r.member_id
   where f.type = 'email'
     and m.email is null
     and jsonb_typeof(r.value) = 'string'
     and lower(btrim(r.value #>> '{}')) ~ '^[^@[:space:]]{1,64}@[^@[:space:]]{1,189}\.[a-z]{2,24}$'
     and length(lower(btrim(r.value #>> '{}'))) between 6 and 254
   order by r.member_id, f.position, r.id
),
unicos as (
  select c.member_id, c.email
    from candidatos c
   where not exists (
           select 1 from candidatos d
            where d.email = c.email and d.member_id <> c.member_id
         )
     and not exists (select 1 from public.cmd_members m2 where m2.email = c.email)
     and not exists (select 1 from public.cmd_users  u  where u.email  = c.email)
)
update public.cmd_members m
   set email = u.email
  from unicos u
 where m.id = u.member_id
   and m.email is null;

-- As colunas do link pessoal entram antes porque a secao 6 ja precisa saber
-- quais convites tem dono. Detalhes e indices ficam na secao 7.
alter table public.cmd_invites
  add column if not exists user_id uuid,
  add column if not exists token   text;

-- ---------------------------------------------------------------------------
-- 6. Interruptor de recrutamento da operacao
--
-- Uma operacao tem varios links (o do candidato e o de cada integrante).
-- Quando o ADMIN desliga o recrutamento, TODOS os links daquela operacao
-- param de aceitar cadastro de uma vez. O estado atual do convite e
-- preservado: quem estava desativado continua desativado.
-- ---------------------------------------------------------------------------
alter table public.cmd_clients
  add column if not exists recruiting_active boolean not null default true;

update public.cmd_clients c
   set recruiting_active = i.active
  from public.cmd_invites i
 where i.client_id = c.id
   and i.user_id is null
   and c.recruiting_active is distinct from i.active
   and not exists (
     select 1 from public.cmd_invites j where j.client_id = c.id and j.user_id is not null
   );

-- ---------------------------------------------------------------------------
-- 7. cmd_invites: um link pessoal por usuario
--
-- Antes existia um convite por candidato. Agora existe um por usuario
-- (CANDIDATE ou EQUIPE), e o link diz ao servidor QUEM recrutou.
--
-- `token` guarda o identificador opaco em claro, de proposito: o link
-- precisa continuar disponivel depois de sair, entrar de novo, trocar de
-- aparelho ou recarregar a pagina, sem depender de sessionStorage e sem que
-- abrir a pagina gere, renove ou invalide nada. Ele nao e credencial de
-- login, nao carrega dado pessoal, e aleatorio (160 bits), revogavel
-- (`active`) e substituivel. `token_hash` continua sendo a chave de busca,
-- o que preserva os links antigos, gerados quando so o hash era guardado.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cmd_invites_token_check') then
    alter table public.cmd_invites add constraint cmd_invites_token_check
      check (token is null or token ~ '^[A-Za-z0-9_-]{16,64}$');
  end if;

  -- O dono do link pertence ao mesmo candidato do convite. Chave composta:
  -- nao ha como apontar para usuario de outra operacao.
  if not exists (select 1 from pg_constraint where conname = 'cmd_invites_user_fk') then
    alter table public.cmd_invites
      add constraint cmd_invites_user_fk
      foreign key (user_id, client_id)
      references public.cmd_users (id, client_id) on delete cascade;
  end if;
end
$$;

create unique index if not exists cmd_invites_token_key
  on public.cmd_invites (token)
  where token is not null;

-- Um link por usuario; e no maximo um link "sem dono" por candidato, que e o
-- convite legado de antes desta migration.
create unique index if not exists cmd_invites_user_id_key
  on public.cmd_invites (user_id)
  where user_id is not null;

create unique index if not exists cmd_invites_legacy_client_key
  on public.cmd_invites (client_id)
  where user_id is null;

create index if not exists cmd_invites_client_user_idx
  on public.cmd_invites (client_id, user_id);

-- O convite unico por candidato deixa de valer: agora sao varios por
-- candidato, um para cada usuario.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'cmd_invites_client_uniq') then
    alter table public.cmd_invites drop constraint cmd_invites_client_uniq;
  end if;
end
$$;

-- Migracao compativel: o convite que ja existia passa a ser o link pessoal
-- do usuario CANDIDATE daquela operacao. O token nao muda, entao nenhum
-- link ja compartilhado deixa de funcionar.
update public.cmd_invites i
   set user_id = u.id
  from public.cmd_users u
 where u.client_id = i.client_id
   and u.role = 'CANDIDATE'
   and i.user_id is null
   and not exists (
     select 1 from public.cmd_invites j where j.user_id = u.id
   );

-- ---------------------------------------------------------------------------
-- 8. Criacao atomica do acesso do integrante
--
-- Recebe o integrante ja gravado e cria, em uma transacao so, o usuario
-- EQUIPE e o link pessoal dele. Se qualquer passo falhar, nada e gravado:
-- nao sobra usuario sem link nem link sem usuario.
--
-- A senha chega apenas como hash scrypt. O token chega pronto do servidor
-- (aleatorio, 160 bits) e nunca e registrado em log.
-- ---------------------------------------------------------------------------
-- SHA-256 sem depender de pgcrypto: o hash do token e calculado pelo
-- proprio servidor e conferido aqui, entao basta uma funcao estavel.
create or replace function public.cmd_sha256(p_text text)
returns bytea
language sql
immutable
security invoker
set search_path = ''
as $$
  select sha256(convert_to(p_text, 'UTF8'));
$$;

comment on function public.cmd_sha256(text) is
  'SHA-256 do texto, em bytea. Usado para guardar somente o hash do token.';

create or replace function public.cmd_create_team_access(
  p_client_id     uuid,
  p_member_id     uuid,
  p_name          text,
  p_email         text,
  p_password_hash text,
  p_token         text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_password_hash is not null
     and p_password_hash !~ '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$' then
    raise exception 'formato de hash invalido';
  end if;

  if p_token !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'token invalido';
  end if;

  -- O integrante precisa ser mesmo daquele candidato.
  if not exists (
    select 1 from public.cmd_members m
     where m.id = p_member_id and m.client_id = p_client_id
  ) then
    raise exception 'integrante nao pertence ao candidato';
  end if;

  insert into public.cmd_users
    (name, email, role, client_id, member_id, password_hash, must_change_password, is_active)
  values
    (p_name, lower(btrim(p_email)), 'EQUIPE'::public.cmd_role, p_client_id, p_member_id,
     p_password_hash, true, true)
  returning id into v_user_id;

  insert into public.cmd_invites (client_id, user_id, token, token_hash, active)
  values (p_client_id, v_user_id, p_token, encode(public.cmd_sha256(p_token), 'hex'), true);

  return v_user_id;
end;
$$;

comment on function public.cmd_create_team_access(uuid, uuid, text, text, text, text) is
  'Cria o usuario EQUIPE e o link pessoal do integrante em uma transacao so.';

-- ---------------------------------------------------------------------------
-- 9. Acesso pendente dos integrantes que ja existiam
--
-- Quem tem e-mail valido ganha usuario EQUIPE e link pessoal, porem SEM
-- senha utilizavel: o estado fica em "Acesso pendente" e o ADMIN gera a
-- senha temporaria em Configuracoes quando quiser. Nenhuma senha e criada
-- aqui, e nada em texto puro passa por esta migration.
--
-- Quem nao tem e-mail continua sem usuario: a interface mostra
-- "E-mail necessário". E-mail ja usado por outro usuario e ignorado, para
-- nenhum acesso nascer trocado.
--
-- O identificador do link vem de gen_random_uuid(), que no PostgreSQL usa
-- gerador aleatorio forte. O banco guarda o identificador e o hash dele.
-- ---------------------------------------------------------------------------
with novos as (
  insert into public.cmd_users
    (name, email, role, client_id, member_id, password_hash, must_change_password, is_active)
  select m.name, m.email, 'EQUIPE'::public.cmd_role, m.client_id, m.id, null, true, true
    from public.cmd_members m
   where m.email is not null
     and not exists (select 1 from public.cmd_users u where u.member_id = m.id)
     and not exists (select 1 from public.cmd_users u where u.email = m.email)
  returning id, client_id
)
insert into public.cmd_invites (client_id, user_id, token, token_hash, active)
select n.client_id,
       n.id,
       t.token,
       encode(public.cmd_sha256(t.token), 'hex')
     , true
  from novos n
  cross join lateral (
    select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as token
  ) t;

-- ---------------------------------------------------------------------------
-- 10. Privilegios: apenas o servidor, pela chave secreta.
-- ---------------------------------------------------------------------------
do $$
declare
  funcoes constant text[] := array[
    'public.cmd_sha256(text)',
    'public.cmd_create_team_access(uuid, uuid, text, text, text, text)',
    'public.cmd_members_recruiter_guard()'
  ];
  assinatura text;
  papel text;
begin
  foreach assinatura in array funcoes
  loop
    execute format('revoke all on function %s from public', assinatura);

    foreach papel in array array['anon', 'authenticated']
    loop
      if exists (select 1 from pg_roles where rolname = papel) then
        execute format('revoke all on function %s from %I', assinatura, papel);
      end if;
    end loop;

    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', assinatura);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 11. Comentarios de documentacao
-- ---------------------------------------------------------------------------
comment on column public.cmd_users.member_id is
  'Integrante correspondente. Obrigatorio no perfil EQUIPE e sempre nulo nos demais.';
comment on column public.cmd_members.email is
  'E-mail de acesso do integrante. Minusculo, sem espacos e unico no sistema.';
comment on column public.cmd_members.recruited_by_user_id is
  'Dono do link usado no cadastro. Determinado no servidor, nunca pelo navegador.';
comment on column public.cmd_members.recruited_by_name is
  'Nome do responsavel no momento do cadastro. Sobrevive a exclusao do usuario.';
comment on column public.cmd_members.recruited_by_role is
  'Perfil do responsavel no momento do cadastro: ADMIN, CANDIDATE ou EQUIPE.';
comment on column public.cmd_clients.recruiting_active is
  'Interruptor da operacao: em false, nenhum link daquele candidato aceita cadastro.';
comment on column public.cmd_invites.user_id is
  'Dono do link pessoal. Nulo apenas nos convites anteriores a esta migration.';
comment on column public.cmd_invites.token is
  'Identificador opaco do link, aleatorio e revogavel. Nao e credencial nem dado pessoal.';

commit;
