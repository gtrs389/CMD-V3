#!/usr/bin/env node
/**
 * Gera o valor de ADMIN_PASSWORD_HASH para o arquivo .env.local.
 *
 * Uso: npm run gerar-hash -- "sua-senha"
 * A senha nunca e gravada em disco nem enviada ao navegador.
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const KEYLEN = 64;

function hash(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

let password = process.argv[2];

if (!password) {
  const rl = createInterface({ input: stdin, output: stdout });
  password = await rl.question('Senha do administrador: ');
  rl.close();
}

if (!password || password.length < 8) {
  console.error('A senha precisa ter pelo menos 8 caracteres.');
  process.exit(1);
}

console.log('\nAdicione ao seu .env.local:\n');
console.log(`ADMIN_PASSWORD_HASH="${hash(password)}"`);
console.log('');
