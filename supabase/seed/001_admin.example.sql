-- ===========================================================================
-- CMD - Cadastro Mobilizacao Digital
-- Seed 001 (EXEMPLO): primeiro administrador
--
-- Execute somente DEPOIS de 001_cmd_initial.sql.
--
-- ATENCAO
--   Este arquivo e um modelo. NAO contem e NUNCA deve conter uma senha real.
--   Gere o hash na sua maquina com:
--
--       npm run gerar-hash -- "seu-email@dominio.com" "sua-senha"
--
--   O comando imprime o INSERT pronto, ja com o hash. Cole a saida dele no
--   SQL Editor do Supabase. A senha em texto puro nunca vai para o banco,
--   para o repositorio nem para o navegador.
-- ===========================================================================

-- Substitua os dois valores abaixo antes de executar.
--   :email        e-mail do administrador, sempre em minusculas
--   :senha_hash   valor no formato scrypt$<salt-hex>$<hash-hex>
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
       locked_until    = null;

-- Conferencia rapida: nunca selecione password_hash em um ambiente
-- compartilhado.
-- select id, name, email, role, is_active, created_at from public.cmd_users;
