#!/usr/bin/env node
/**
 * Gera o hash scrypt da senha do administrador e imprime o INSERT pronto
 * para colar no SQL Editor do Supabase.
 *
 * Uso:
 *   npm run gerar-hash -- "email@dominio.com" "sua-senha"
 *   npm run gerar-hash            (pergunta e-mail e senha no terminal)
 *
 * A senha em texto puro nunca e gravada em disco nem enviada a lugar nenhum.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const KEYLEN = 64;
const SALT_BYTES = 16;
const MIN_PASSWORD = 8;

/** Mesmo formato lido por `src/lib/auth/password.ts`. */
function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = scryptSync(password, salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

/** Escapa aspas simples para uso seguro dentro do literal SQL. */
function sqlText(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

let [, , emailArg, passwordArg, nameArg] = process.argv;

if (!emailArg || !passwordArg) {
  const rl = createInterface({ input: stdin, output: stdout });
  emailArg = emailArg ?? (await rl.question('E-mail do administrador: '));
  passwordArg = passwordArg ?? (await rl.question('Senha (minimo 8 caracteres): '));
  nameArg = nameArg ?? (await rl.question('Nome exibido [Administrador]: '));
  rl.close();
}

const email = String(emailArg).trim().toLowerCase();
const password = String(passwordArg);
const name = (nameArg ?? '').trim() || 'Administrador';

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('E-mail invalido.');
  process.exit(1);
}

if (password.length < MIN_PASSWORD) {
  console.error(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  process.exit(1);
}

const hash = hashPassword(password);

console.log('\n--- Copie a partir daqui e cole no SQL Editor do Supabase ---\n');
console.log(`insert into public.cmd_users (name, email, password_hash, role, is_active)`);
console.log(`values (${sqlText(name)}, ${sqlText(email)}, ${sqlText(hash)}, 'ADMIN', true)`);
console.log(`on conflict (email) do update`);
console.log(`   set password_hash   = excluded.password_hash,`);
console.log(`       name            = excluded.name,`);
console.log(`       role            = excluded.role,`);
console.log(`       is_active       = true,`);
console.log(`       failed_attempts = 0,`);
console.log(`       locked_until    = null;`);
console.log('\n--- Fim ---\n');
console.log('Hash gerado (apenas para conferencia):');
console.log(hash);
console.log('\nA senha em texto puro nao foi gravada em lugar nenhum.\n');
