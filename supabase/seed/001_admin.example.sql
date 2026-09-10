-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Seed 001 (EXEMPLO): primeiro administrador
--
-- Execute somente DEPOIS de 001_cmd_initial.sql.
--
-- ATENCAO
--   Este arquivo e um modelo. NAO contem e NUNCA deve conter uma senha real.
--   Gere o hash na sua maquina, em um terminal interativo:
--
--       npm run gerar-hash
--
--   O comando pergunta e-mail e senha (a senha nao aparece na tela, e e
--   confirmada em seguida) e imprime este mesmo SQL ja preenchido, com o hash
--   e com o escape correto de aspas. Prefira colar a saida dele.
--
--   Nunca passe a senha por argumento: ela ficaria no historico do terminal e
--   na lista de processos. A senha em texto puro nunca vai para o banco, para
--   o repositorio nem para o navegador.
-- ===========================================================================

begin;

-- Substitua os tres valores abaixo antes de executar.
--   nome          entre 2 e 120 caracteres; aspas simples viram duas ('')
--   e-mail        entre 6 e 254 caracteres, sempre em minusculas
--   senha_hash    formato scrypt$<salt-hex-32>$<hash-hex-128>
--
-- `role` nao tem valor padrao na tabela: informe sempre.
with alvo as (
  insert into public.cmd_users (name, email, password_hash, role, is_active)
  values (
    'Administrador',
    'COLE_AQUI_O_EMAIL_EM_MINUSCULAS',
    'COLE_AQUI_O_HASH_SCRYPT',
    'ADMIN',
    true
  )
  on conflict (email) do update
     set password_hash   = excluded.password_hash,
         name            = excluded.name,
         role            = excluded.role,
         is_active       = true,
         failed_attempts = 0,
         locked_until    = null
  returning id
)
-- Toda sessao aberta com a senha anterior para de valer agora.
update public.cmd_sessions
   set revoked_at = now()
  from alvo
 where public.cmd_sessions.user_id = alvo.id
   and public.cmd_sessions.revoked_at is null;

commit;

-- Conferencia rapida: nunca selecione password_hash em um ambiente
-- compartilhado.
-- select id, name, email, role, is_active, created_at from public.cmd_users;
