-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 018: acesso dos membros da equipe por link do time + telefone
--
-- Execute no SQL Editor do Supabase depois de
-- 017_team_admin_trusted_device.sql. Nao altera as anteriores. Idempotente,
-- transacional e sem DROP TABLE, DROP COLUMN, DELETE ou TRUNCATE: nenhuma
-- pessoa e apagada e nenhum dado historico e perdido.
--
-- O que muda:
--   1. O integrante (perfil EQUIPE) deixa de ter e-mail e senha. Ele entra
--      pelo MESMO par que o Administrador do time ja usa: LINK DO TIME +
--      TELEFONE. Os e-mails antigos continuam gravados, apenas nao
--      autenticam mais ninguem.
--   2. O telefone ATIVO passa a identificar uma unica pessoa dentro do
--      mesmo time, considerando juntos os Administradores do time e os
--      membros da equipe. Em times diferentes o mesmo telefone pode existir:
--      quem diz de qual time se trata e o link.
--   3. O aparelho confiavel da migration 017 passa a valer tambem para o
--      perfil EQUIPE. NAO nasce outro sistema de aparelhos: as mesmas
--      tabela, funcoes e cookie atendem os dois perfis.
--   4. O campo padrao E-mail sai dos formularios existentes (desativado e
--      nao obrigatorio). As respostas antigas nao sao tocadas.
--
-- O ADMIN geral nao e afetado: continua com e-mail e senha, sem vinculo de
-- aparelho, e nenhuma sessao dele e revogada aqui.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. E-mail do integrante deixa de ser exigido
--
-- A coluna ja nasceu opcional na 012; a chamada abaixo apenas garante o
-- estado, e e inofensiva quando a coluna ja aceita nulo. Os enderecos
-- gravados continuam onde estao: o check de formato avalia como nulo quando
-- a coluna e nula, entao a ausencia e aceita.
-- ---------------------------------------------------------------------------
alter table public.cmd_members alter column email drop not null;

-- ---------------------------------------------------------------------------
-- 2. cmd_users: e-mail nulo no perfil EQUIPE, telefone obrigatorio nos novos
--
-- O e-mail ja podia ser nulo desde a 016, e o check
-- `cmd_users_admin_email_check` exige endereco apenas no ADMIN geral: o
-- perfil EQUIPE entra nessa mesma regra sem precisar de alteracao.
--
-- O telefone passa a ser exigido de todo usuario EQUIPE ATIVO. A restricao
-- nasce `not valid` de proposito: as linhas antigas nao sao revalidadas
-- agora (elas sao tratadas na secao 6), mas toda insercao e toda atualizacao
-- a partir daqui precisam satisfaze-la. Usuario bloqueado por telefone
-- duplicado continua existindo, inativo e sem telefone.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cmd_users_equipe_phone_check'
  ) then
    alter table public.cmd_users
      add constraint cmd_users_equipe_phone_check
      check (
        role <> 'EQUIPE'
        or not is_active
        or phone ~ '^[0-9]{10,11}$'
      )
      not valid;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Telefone ativo unico por time, entre Administrador do time e EQUIPE
--
-- O indice da 016 cobria qualquer linha com telefone, inclusive as
-- desativadas: uma pessoa desligada segurava o numero para sempre. Aqui a
-- unicidade passa a valer entre os ATIVOS, que sao os unicos que conseguem
-- entrar. Os dois perfis dividem a mesma restricao, entao o telefone nunca
-- fica ambiguo dentro do time.
--
-- O indice novo e criado na secao 7, depois do preenchimento: assim o
-- preenchimento nao esbarra no indice antigo nem cria duplicidade.
-- ---------------------------------------------------------------------------
drop index if exists public.cmd_users_client_phone_key;

-- ---------------------------------------------------------------------------
-- 4. Aparelho confiavel: a mesma infraestrutura passa a servir o EQUIPE
--
-- Somente o teste de perfil muda. Tabela, indices, cookie, credencial
-- secreta, auditoria e a funcao de conferencia continuam exatamente os
-- mesmos da 017:
--
--   Administrador do time -> CANDIDATE com team_person_id
--   Membro da equipe      -> EQUIPE com member_id
--
--   sem aparelho ativo          -> cria o vinculo e devolve o id
--   aparelho ativo, hash igual  -> devolve o mesmo id (acesso permitido)
--   aparelho ativo, hash outro  -> devolve null (acesso recusado)
--
-- Quem chama nunca sabe qual dos casos aconteceu: a rota responde sempre a
-- mesma mensagem generica.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_admin_device_bind(
  p_user_id          uuid,
  p_token_hash       text,
  p_device_type      text default null,
  p_browser          text default null,
  p_os               text default null,
  p_platform         text default null,
  p_user_agent       text default null,
  p_screen_width     integer default null,
  p_screen_height    integer default null,
  p_timezone         text default null,
  p_languages        text default null,
  p_max_touch_points integer default null,
  p_ip_hash          text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id   uuid;
  v_device_id uuid;
  v_hash      text;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'credencial de aparelho invalida';
  end if;

  -- Trava a linha do usuario: serializa o primeiro vinculo.
  select u.id
    into v_user_id
    from public.cmd_users u
   where u.id = p_user_id
     and u.is_active
     and (
       (u.role = 'CANDIDATE' and u.team_person_id is not null)
       or (u.role = 'EQUIPE' and u.member_id is not null)
     )
     for update;

  if v_user_id is null then
    return null;
  end if;

  select d.id, d.device_token_hash
    into v_device_id, v_hash
    from public.cmd_admin_devices d
   where d.user_id = v_user_id
     and d.active
   limit 1;

  if v_device_id is null then
    insert into public.cmd_admin_devices
      (user_id, device_token_hash, active, device_type, browser, os, platform,
       user_agent, screen_width, screen_height, timezone, languages,
       max_touch_points, ip_hash)
    values
      (v_user_id, p_token_hash, true, p_device_type, p_browser, p_os, p_platform,
       p_user_agent, p_screen_width, p_screen_height, p_timezone, p_languages,
       p_max_touch_points, p_ip_hash)
    returning id into v_device_id;

    return v_device_id;
  end if;

  -- Aparelho ja autorizado: so passa quem apresentar a mesma credencial.
  if v_hash is distinct from p_token_hash then
    return null;
  end if;

  update public.cmd_admin_devices
     set last_seen_at      = now(),
         device_type       = coalesce(p_device_type, device_type),
         browser           = coalesce(p_browser, browser),
         os                = coalesce(p_os, os),
         platform          = coalesce(p_platform, platform),
         user_agent        = coalesce(p_user_agent, user_agent),
         screen_width      = coalesce(p_screen_width, screen_width),
         screen_height     = coalesce(p_screen_height, screen_height),
         timezone          = coalesce(p_timezone, timezone),
         languages         = coalesce(p_languages, languages),
         max_touch_points  = coalesce(p_max_touch_points, max_touch_points),
         ip_hash           = coalesce(p_ip_hash, ip_hash)
   where id = v_device_id;

  return v_device_id;
end;
$$;

comment on function public.cmd_admin_device_bind is
  'Vincula (ou reconhece) o aparelho do Administrador do time ou do membro da equipe. Devolve o id do aparelho autorizado ou null quando o acesso deve ser recusado.';

-- Privilegios da funcao recriada: identicos aos da 017.
do $$
declare
  assinatura text := 'public.cmd_admin_device_bind(uuid, text, text, text, text, text, text, '
                  || 'integer, integer, text, text, integer, text)';
  papel      text;
begin
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
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Acesso por telefone para os integrantes que ja existem
--
-- Entra quem tem telefone normalizado (10 ou 11 digitos) e que nao gera
-- ambiguidade dentro do proprio time: nem com outro integrante, nem com um
-- Administrador do time ativo. Ninguem e escolhido automaticamente entre
-- dois homonimos de telefone — os dois ficam de fora ate o ADMIN geral
-- corrigir o numero.
--
-- Quem ja tinha usuario mantem a linha (e o e-mail historico dela): apenas
-- recebe o telefone e deixa de exigir troca de senha.
-- ---------------------------------------------------------------------------
create temporary table cmd_018_elegiveis on commit drop as
with candidatos as (
  select m.id       as member_id,
         m.client_id,
         btrim(m.name) as name,
         m.phone
    from public.cmd_members m
   where m.phone ~ '^[0-9]{10,11}$'
)
select c.*
  from candidatos c
 where (
         select count(*)
           from candidatos d
          where d.client_id = c.client_id
            and d.phone = c.phone
       ) = 1
   and not exists (
     select 1
       from public.cmd_users u
      where u.client_id = c.client_id
        and u.phone = c.phone
        and u.is_active
        and (u.member_id is null or u.member_id <> c.member_id)
   );

-- 5a. Integrante que ja tinha usuario: telefone preenchido, acesso liberado.
--     O e-mail antigo continua gravado, apenas nao autentica mais.
update public.cmd_users u
   set phone                = e.phone,
       must_change_password = false,
       is_active            = true
  from cmd_018_elegiveis e
 where u.member_id = e.member_id
   and u.role = 'EQUIPE'
   and (
     u.phone is distinct from e.phone
     or u.must_change_password
     or not u.is_active
   );

-- 5b. Integrante ainda sem usuario: nasce o acesso, sem e-mail e sem senha.
insert into public.cmd_users
  (name, email, phone, role, client_id, member_id, password_hash,
   must_change_password, is_active)
select e.name,
       null,
       e.phone,
       'EQUIPE'::public.cmd_role,
       e.client_id,
       e.member_id,
       null,
       false,
       true
  from cmd_018_elegiveis e
 where not exists (
   select 1 from public.cmd_users u where u.member_id = e.member_id
 );

-- ---------------------------------------------------------------------------
-- 5c. Link pessoal de recrutamento dos acessos recem-criados
--
-- No cadastro normal o usuario e o link nascem juntos. Aqui o mesmo vale
-- para quem acabou de ganhar acesso: sem isso "Minha mobilizacao" abriria
-- sem link nenhum. Token aleatorio de 256 bits (gen_random_uuid), guardado
-- tambem como SHA-256, com o prazo configurado para a EQUIPE.
-- ---------------------------------------------------------------------------
with novos as (
  insert into public.cmd_invites
    (client_id, user_id, token, token_hash, active, issued_at, expires_at, status, generation)
  select u.client_id,
         u.id,
         t.token,
         encode(public.cmd_sha256(t.token), 'hex'),
         true,
         now(),
         now() + make_interval(secs => public.cmd_invite_seconds('EQUIPE')),
         'ACTIVE',
         1
    from public.cmd_users u
    cross join lateral (
      select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as token
    ) t
   where u.role = 'EQUIPE'
     and u.member_id is not null
     and u.phone is not null
     and u.is_active
     and not exists (
       select 1 from public.cmd_invites i where i.user_id = u.id
     )
  returning id, client_id, user_id
)
insert into public.cmd_invite_events
  (invite_id, client_id, user_id, owner_name, owner_role, generation, event)
select n.id, n.client_id, n.user_id, u.name, 'EQUIPE', 1, 'GENERATED'
  from novos n
  join public.cmd_users u on u.id = n.user_id
on conflict (invite_id, generation, event) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Telefone ausente ou duplicado: acesso bloqueado, pessoa preservada
--
-- Nenhum integrante e apagado e nenhum cadastro e unido. O usuario fica
-- inativo e sem telefone, o que impede o acesso ambiguo e mantem o historico
-- inteiro. Em Configuracoes o ADMIN geral ve o estado e corrige o numero;
-- depois disso o acesso e criado ou liberado normalmente pelo painel.
-- ---------------------------------------------------------------------------
update public.cmd_users u
   set phone                = null,
       must_change_password = false,
       is_active            = false
 where u.role = 'EQUIPE'
   and u.member_id is not null
   and not exists (
     select 1 from cmd_018_elegiveis e where e.member_id = u.member_id
   );

-- ---------------------------------------------------------------------------
-- 7. Indice do telefone ativo, ja com os dados no lugar
-- ---------------------------------------------------------------------------
create unique index if not exists cmd_users_client_phone_active_key
  on public.cmd_users (client_id, phone)
  where phone is not null and is_active;

-- ---------------------------------------------------------------------------
-- 8. Sessoes antigas do perfil EQUIPE caem
--
-- Elas nasceram de e-mail e senha, sem aparelho vinculado. Depois do deploy,
-- o primeiro acesso valido pelo link do time cria o vinculo do aparelho.
-- Nenhuma sessao de ADMIN geral e tocada, e as sessoes e os aparelhos dos
-- Administradores do time continuam exatamente como estao.
-- ---------------------------------------------------------------------------
update public.cmd_sessions s
   set revoked_at = now()
  from public.cmd_users u
 where s.user_id = u.id
   and u.role = 'EQUIPE'
   and s.revoked_at is null;

-- ---------------------------------------------------------------------------
-- 9. Campo padrao E-mail sai dos formularios existentes
--
-- Desativado e nao obrigatorio: ele deixa de aparecer no construtor, no
-- formulario publico e na revisao. A linha continua no banco e as respostas
-- ja gravadas nao sao tocadas — nenhum outro campo e alterado.
-- ---------------------------------------------------------------------------
update public.cmd_form_fields
   set enabled  = false,
       required = false
 where system_key::text = 'email'
   and (enabled or required);

-- ---------------------------------------------------------------------------
-- 10. RLS e privilegios: nada afrouxa
--
-- As tabelas envolvidas seguem com RLS habilitado e forcado, sem policy
-- publica. O acesso continua exclusivo do `service_role`, que e a chave
-- usada apenas no servidor.
-- ---------------------------------------------------------------------------
do $$
declare
  tabela text;
  papel  text;
begin
  foreach tabela in array array[
    'cmd_users', 'cmd_sessions', 'cmd_admin_devices', 'cmd_members',
    'cmd_form_fields', 'cmd_team_access_links'
  ]
  loop
    execute format('alter table public.%I enable row level security', tabela);
    execute format('alter table public.%I force row level security', tabela);

    foreach papel in array array['public', 'anon', 'authenticated']
    loop
      if papel = 'public' then
        execute format('revoke all on table public.%I from public', tabela);
      elsif exists (select 1 from pg_roles where rolname = papel) then
        execute format('revoke all on table public.%I from %I', tabela, papel);
      end if;
    end loop;

    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format(
        'grant select, insert, update, delete on table public.%I to service_role',
        tabela
      );
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 11. Comentarios
-- ---------------------------------------------------------------------------
comment on column public.cmd_users.phone is
  'Telefone normalizado (somente digitos) do acesso por link do time. Vale para o Administrador do time e para o membro da equipe. Nunca e senha: o link faz parte obrigatoria da autenticacao.';
comment on column public.cmd_members.email is
  'E-mail historico do integrante. Preservado, mas nao autentica ninguem: o acesso do membro e link do time + telefone.';
comment on table public.cmd_admin_devices is
  'Aparelho autorizado de quem entra por link do time + telefone (Administrador do time e membro da equipe): um ativo por usuario. Guarda apenas o SHA-256 da credencial secreta do cookie; as demais colunas sao auditoria e nunca decidem o acesso. Separada de cmd_member_devices, que e observacao do cadastro publico.';

commit;
