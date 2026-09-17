-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Migration 043: varios links de cadastro do mesmo dono, gerados de uma vez
--
-- Execute no SQL Editor do Supabase depois de 042_locais_de_votacao.sql.
-- Nao altera nenhuma migration anterior. Roda inteira dentro de UMA
-- transacao, e idempotente e nao apaga dado nenhum: nao ha DROP TABLE, DROP
-- COLUMN, DELETE nem TRUNCATE. Nenhuma API externa e consultada.
--
-- POR QUE ELA EXISTE
--
-- Cada link de cadastro vale para UMA pessoa: ele e reservado pelo primeiro
-- navegador que o abre e consumido quando o cadastro e enviado. Ate aqui,
-- porem, cada dono podia ter UM link por vez — um indice unico garantia isso,
-- e gerar um novo revogava o anterior na hora.
--
-- Entao mandar o link para dez pessoas era dez idas ao painel: gerar, enviar,
-- esperar a pessoa se cadastrar, gerar de novo. Quem enviasse o mesmo
-- endereco para duas pessoas veria a segunda bater em "link ja utilizado".
--
-- Agora o mesmo dono pode ter QUANTOS links quiser valendo ao mesmo tempo,
-- e `cmd_invite_issue_lote` gera todos de uma vez. Nada do que ja existe
-- muda de comportamento:
--
--   - cada link continua sendo de uso unico, com o mesmo prazo, a mesma
--     reserva por navegador e o mesmo historico;
--   - o dono continua sendo quem recebe os cadastros, e o nome dele e o que
--     permanece em "Cadastrado por";
--   - `cmd_invite_issue` — o botao "Gerar link" de sempre — continua
--     revogando o anterior. Gerar um link novo do jeito antigo nao deixa dois
--     valendo sem querer; para isso existe o lote, que e explicito.
--
-- O LINK "ATUAL" DE UM DONO passa a ser o mais recente. E o que o painel
-- mostra e o que a API devolve, e era o que acontecia quando so havia um.
--
-- IDEMPOTENTE: `drop index if exists`, `create index if not exists` e
-- `create or replace function`. Rodar de novo nao muda nada.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Um dono pode ter varios links valendo
--
-- O indice unico da migration 012 e trocado por um indice comum: as buscas
-- por dono continuam rapidas, mas deixa de existir o limite de um.
--
-- O indice unico do TOKEN continua onde esta, e ele e o que importa para a
-- seguranca: dois links nunca compartilham o mesmo endereco.
-- ---------------------------------------------------------------------------
drop index if exists public.cmd_invites_user_id_key;

create index if not exists cmd_invites_user_id_idx
  on public.cmd_invites (user_id)
  where user_id is not null;

-- O link mais recente de um dono e lido a cada abertura do painel: o indice
-- responde na ordem certa, sem ordenar em memoria.
create index if not exists cmd_invites_user_recentes_idx
  on public.cmd_invites (user_id, issued_at desc)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- 2. cmd_invite_issue_lote: N links de uma vez, sem revogar nada
--
-- Recebe os tokens ja prontos (gerados no servidor, com a mesma entropia de
-- sempre) e devolve, para cada um, o identificador e o prazo. O banco e quem
-- decide o prazo, conforme o PERFIL DO DONO — o navegador nao escolhe nada.
--
-- Nao existe teto de quantidade aqui: quem chama e o painel do ADMIN, e o
-- limite pratico e o tamanho da requisicao.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_issue_lote(
  p_user_id      uuid,
  p_tokens       text[],
  p_token_hashes text[],
  p_generated_by uuid
)
returns table (invite_id uuid, token text, issued_at timestamptz, expires_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user     record;
  v_gerador  record;
  v_segundos integer;
  v_agora    timestamptz := now();
  v_fim      timestamptz;
  v_geracao  integer;
  v_id       uuid;
  v_total    integer;
  i          integer;
begin
  v_total := coalesce(array_length(p_tokens, 1), 0);

  if v_total = 0 then
    raise exception 'nenhum token informado';
  end if;
  if coalesce(array_length(p_token_hashes, 1), 0) <> v_total then
    raise exception 'tokens e hashes em quantidades diferentes';
  end if;

  -- Mesma conferencia de sempre, uma vez por token: endereco de link nao
  -- entra no banco sem ter a forma de um.
  for i in 1 .. v_total loop
    if p_tokens[i] is null or p_tokens[i] !~ '^[A-Za-z0-9_-]{16,64}$' then
      raise exception 'token invalido';
    end if;
    if p_token_hashes[i] is null or p_token_hashes[i] !~ '^[0-9a-f]{64}$' then
      raise exception 'hash do token invalido';
    end if;
  end loop;

  select u.id, u.client_id, u.name, u.role::text as role, u.is_active
    into v_user
    from public.cmd_users u
   where u.id = p_user_id
   for share;

  if v_user is null or v_user.client_id is null then
    raise exception 'usuario sem operacao';
  end if;
  if not v_user.is_active then
    raise exception 'usuario inativo';
  end if;
  if v_user.role not in ('CANDIDATE', 'EQUIPE') then
    raise exception 'perfil sem link pessoal';
  end if;

  select u.id, u.name, u.role::text as role
    into v_gerador
    from public.cmd_users u
   where u.id = coalesce(p_generated_by, p_user_id);

  v_segundos := public.cmd_invite_seconds(v_user.role);
  v_fim := v_agora + make_interval(secs => v_segundos);

  -- A numeracao continua de onde o dono parou: o historico do link dele
  -- segue sendo uma linha do tempo so, sem geracao repetida.
  select coalesce(max(i2.generation), 0)
    into v_geracao
    from public.cmd_invites i2
   where i2.user_id = p_user_id;

  for i in 1 .. v_total loop
    v_geracao := v_geracao + 1;

    insert into public.cmd_invites
      (client_id, user_id, token, token_hash, active, issued_at, expires_at, status,
       generation, owner_name, owner_role,
       generated_by_user_id, generated_by_name, generated_by_role)
    values (v_user.client_id, v_user.id, p_tokens[i], p_token_hashes[i], true,
            v_agora, v_fim, 'ACTIVE', v_geracao, v_user.name, v_user.role,
            v_gerador.id, v_gerador.name, v_gerador.role)
    returning id into v_id;

    insert into public.cmd_invite_events
      (invite_id, client_id, user_id, owner_name, owner_role, generation, event,
       generated_by_user_id, generated_by_name, generated_by_role)
    values (v_id, v_user.client_id, v_user.id, v_user.name, v_user.role, v_geracao,
            'GENERATED', v_gerador.id, v_gerador.name, v_gerador.role);

    invite_id  := v_id;
    token      := p_tokens[i];
    issued_at  := v_agora;
    expires_at := v_fim;
    return next;
  end loop;
end
$$;

comment on function public.cmd_invite_issue_lote(uuid, text[], text[], uuid) is
  'Gera varios links de cadastro do mesmo dono de uma vez, sem revogar os '
  'que ja existem. Cada um continua de uso unico, com o prazo do perfil do '
  'dono (migration 043).';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function
      public.cmd_invite_issue_lote(uuid, text[], text[], uuid) to service_role;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. cmd_invite_issue: qual link o botao "Gerar link" rotaciona
--
-- A funcao de sempre continua fazendo o de sempre — gerar um link novo e
-- revogar o anterior. O que muda e UMA escolha que antes nao existia: com um
-- link por dono, `select ... where user_id = ?` so podia devolver aquele.
-- Agora que o mesmo dono tem varios, um `select` sem ordem devolveria uma
-- linha qualquer, e a rotacao poderia revogar a esmo um endereco que ja
-- tivesse sido enviado a alguem.
--
-- Entao ela passa a rotacionar sempre o MAIS RECENTE, que e o "meu link" que
-- o painel mostra, e a numerar a geracao nova pelo maior numero JA USADO
-- pelo dono — senao dois links dele compartilhariam a mesma geracao e o
-- historico deixaria de ser uma linha do tempo.
--
-- O corpo abaixo e o da migration 021, com essas duas mudancas e nada mais.
-- ---------------------------------------------------------------------------
create or replace function public.cmd_invite_issue(
  p_user_id      uuid,
  p_token        text,
  p_token_hash   text,
  p_generated_by uuid
)
returns table (invite_id uuid, issued_at timestamptz, expires_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user     record;
  v_gerador  record;
  v_atual    record;
  v_id       uuid;
  v_geracao  integer := 1;
  v_segundos integer;
  v_agora    timestamptz := now();
  v_fim      timestamptz;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{16,64}$' then
    raise exception 'token invalido';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'hash do token invalido';
  end if;

  select u.id, u.client_id, u.name, u.role::text as role, u.is_active
    into v_user
    from public.cmd_users u
   where u.id = p_user_id
   for share;

  if v_user is null or v_user.client_id is null then
    raise exception 'usuario sem operacao';
  end if;
  if not v_user.is_active then
    raise exception 'usuario inativo';
  end if;
  if v_user.role not in ('CANDIDATE', 'EQUIPE') then
    raise exception 'perfil sem link pessoal';
  end if;

  select u.id, u.name, u.role::text as role
    into v_gerador
    from public.cmd_users u
   where u.id = coalesce(p_generated_by, p_user_id);

  v_segundos := public.cmd_invite_seconds(v_user.role);
  v_fim := v_agora + make_interval(secs => v_segundos);

  -- O link ATUAL do dono e o MAIS RECENTE.
  --
  -- Ate a migration 043 havia um so por dono, e um `select` sem ordem dava
  -- sempre a mesma linha. Com o lote, o mesmo dono passa a ter varios
  -- valendo — e sem a ordem esta rotacao revogaria um deles a esmo, talvez
  -- um endereco que ja tivesse sido enviado a alguem.
  select i.id, i.generation, i.status
    into v_atual
    from public.cmd_invites i
   where i.user_id = p_user_id
   order by i.issued_at desc nulls last, i.generation desc
   limit 1
   for update;

  if v_atual.id is not null then
    v_id := v_atual.id;

    -- A numeracao segue o DONO, e nao a linha: com varios links do mesmo
    -- dono, `v_atual.generation + 1` poderia repetir uma geracao que outro
    -- link ja usou, e o historico dele deixaria de ser uma linha do tempo.
    select coalesce(max(i2.generation), 0) + 1
      into v_geracao
      from public.cmd_invites i2
     where i2.user_id = p_user_id;

    if v_atual.status in ('ACTIVE', 'CLAIMED', 'SUBMITTING') then
      insert into public.cmd_invite_events
        (invite_id, client_id, user_id, owner_name, owner_role, generation, event,
         generated_by_user_id, generated_by_name, generated_by_role)
      select v_id, v_user.client_id, v_user.id, v_user.name, v_user.role,
             v_atual.generation, 'REVOKED',
             v_gerador.id, v_gerador.name, v_gerador.role
       where not exists (
         select 1
           from public.cmd_invite_events e
          where e.invite_id = v_id
            and e.generation = v_atual.generation
            and e.event = 'REVOKED'
       );
    end if;

    update public.cmd_invites
       set token = p_token,
           token_hash = p_token_hash,
           active = true,
           rotated_at = v_agora,
           issued_at = v_agora,
           expires_at = v_fim,
           status = 'ACTIVE',
           claim_hash = null,
           claimed_at = null,
           consumed_at = null,
           revoked_at = null,
           member_id = null,
           generation = v_geracao,
           owner_name = v_user.name,
           owner_role = v_user.role,
           generated_by_user_id = v_gerador.id,
           generated_by_name = v_gerador.name,
           generated_by_role = v_gerador.role
     where id = v_id;
  else
    insert into public.cmd_invites
      (client_id, user_id, token, token_hash, active, issued_at, expires_at, status,
       generation, owner_name, owner_role,
       generated_by_user_id, generated_by_name, generated_by_role)
    values (v_user.client_id, v_user.id, p_token, p_token_hash, true,
            v_agora, v_fim, 'ACTIVE', 1, v_user.name, v_user.role,
            v_gerador.id, v_gerador.name, v_gerador.role)
    returning id into v_id;
  end if;

  insert into public.cmd_invite_events
    (invite_id, client_id, user_id, owner_name, owner_role, generation, event,
     generated_by_user_id, generated_by_name, generated_by_role)
  select v_id, v_user.client_id, v_user.id, v_user.name, v_user.role, v_geracao, 'GENERATED',
         v_gerador.id, v_gerador.name, v_gerador.role
   where not exists (
     select 1
       from public.cmd_invite_events e
      where e.invite_id = v_id
        and e.generation = v_geracao
        and e.event = 'GENERATED'
   );

  -- Registro imutavel da geracao: e ele que reconhece este endereco depois
  -- que o hash em cmd_invites for substituido pela proxima renovacao.
  insert into public.cmd_invite_generations
    (invite_ref, invite_id, client_id, generation, token_hash, issued_at, expires_at,
     owner_user_id, owner_name, owner_role,
     generated_by_user_id, generated_by_name, generated_by_role)
  select v_id, v_id, v_user.client_id, v_geracao, p_token_hash, v_agora, v_fim,
         v_user.id, v_user.name, v_user.role,
         v_gerador.id, v_gerador.name, v_gerador.role
   where not exists (
     select 1
       from public.cmd_invite_generations g
      where g.invite_ref = v_id
        and g.generation = v_geracao
   );

  return query select v_id, v_agora, v_fim;
end
$$;

comment on function public.cmd_invite_issue(uuid, text, text, uuid) is
  'Gera ou renova o link pessoal, rotacionando sempre o mais recente do dono '
  '(migration 043), e registrando dono, gerador e a geracao imutavel.';

commit;


-- ---------------------------------------------------------------------------
-- CONFERENCIA (opcional, fora da transacao). Depois de gerar um lote pelo
-- painel, o mesmo dono deve aparecer com varios links ATIVOS:
--
--   select user_id, count(*) filter (where status = 'ACTIVE') as ativos,
--          count(*) as total
--     from public.cmd_invites group by user_id order by ativos desc;
-- ---------------------------------------------------------------------------
