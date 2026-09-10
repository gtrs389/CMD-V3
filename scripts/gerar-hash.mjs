#!/usr/bin/env node
/**
 * Gera o hash scrypt da senha do administrador e imprime o INSERT pronto
 * para colar no SQL Editor do Supabase.
 *
 * Uso:
 *   npm run gerar-hash
 *
 * A senha e digitada de forma oculta e confirmada em seguida. Ela nunca e
 * exibida na tela, gravada em disco, registrada em log nem passada por
 * argumento de linha de comando (o que a deixaria no historico do terminal e
 * na lista de processos do sistema).
 */
import { randomBytes, scryptSync } from 'node:crypto';
import { stdin, stdout } from 'node:process';

const KEYLEN = 64;
const SALT_BYTES = 16;
const MIN_PASSWORD = 8;

/** Teclas tratadas durante a leitura. */
const KEY_ENTER = '\r';
const KEY_NEWLINE = '\n';
const KEY_EOT = '';
const KEY_INTERRUPT = '';
const KEY_DELETE = '';
const KEY_BACKSPACE = '';
const SPACE = ' ';

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

/**
 * Le uma linha do terminal.
 *
 * Com `hidden`, nada do que for digitado aparece na tela: nem os caracteres,
 * nem asteriscos, nem o tamanho da senha.
 */
function ask(query, { hidden = false } = {}) {
  return new Promise((resolve, reject) => {
    stdout.write(query);

    const wasRaw = stdin.isRaw === true;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
    };

    const onData = (chunk) => {
      for (const char of chunk) {
        // Enter ou fim de entrada: encerra a leitura.
        if (char === KEY_ENTER || char === KEY_NEWLINE || char === KEY_EOT) {
          cleanup();
          stdout.write(KEY_NEWLINE);
          resolve(value);
          return;
        }

        // Ctrl+C: cancela sem deixar rastro do que foi digitado.
        if (char === KEY_INTERRUPT) {
          cleanup();
          stdout.write(KEY_NEWLINE);
          reject(new Error('Cancelado.'));
          return;
        }

        // Apagar o ultimo caractere.
        if (char === KEY_DELETE || char === KEY_BACKSPACE) {
          if (value.length > 0) {
            value = value.slice(0, -1);
            // Recua, apaga o caractere na tela e recua de novo.
            if (!hidden) stdout.write(KEY_BACKSPACE + SPACE + KEY_BACKSPACE);
          }
          continue;
        }

        // Ignora os demais caracteres de controle.
        if (char < SPACE) continue;

        value += char;
        if (!hidden) stdout.write(char);
      }
    };

    stdin.on('data', onData);
  });
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// A senha nunca pode vir por argumento: ficaria no historico do terminal e
// visivel na lista de processos para outros usuarios da maquina.
if (process.argv.length > 2) {
  fail(
    'Este comando nao aceita argumentos.\n' +
      'Execute apenas "npm run gerar-hash": o e-mail e a senha sao pedidos no terminal,\n' +
      'e a senha e digitada de forma oculta.',
  );
}

// Sem terminal interativo nao ha como ocultar a digitacao.
if (!stdin.isTTY || !stdout.isTTY) {
  fail(
    'Este comando precisa de um terminal interativo.\n' +
      'Execute "npm run gerar-hash" diretamente no terminal, sem redirecionar a entrada\n' +
      'e sem usar pipes ou automacoes.',
  );
}

let email = '';
let name = 'Administrador';
let password = '';

try {
  email = (await ask('E-mail do administrador: ')).trim().toLowerCase();
  name = (await ask('Nome exibido [Administrador]: ')).trim() || 'Administrador';
  password = await ask(`Senha (minimo ${MIN_PASSWORD} caracteres, nao aparece na tela): `, {
    hidden: true,
  });

  const confirmation = await ask('Confirme a senha: ', { hidden: true });

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    fail('E-mail invalido.');
  }

  if (password.length < MIN_PASSWORD) {
    fail(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  }

  if (password !== confirmation) {
    fail('As senhas nao conferem. Execute o comando novamente.');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : 'Nao foi possivel ler a entrada.');
}

const hash = hashPassword(password);

console.log('\n--- Copie a partir daqui e cole no SQL Editor do Supabase ---\n');
console.log('insert into public.cmd_users (name, email, password_hash, role, is_active)');
console.log(`values (${sqlText(name)}, ${sqlText(email)}, ${sqlText(hash)}, 'ADMIN', true)`);
console.log('on conflict (email) do update');
console.log('   set password_hash   = excluded.password_hash,');
console.log('       name            = excluded.name,');
console.log('       role            = excluded.role,');
console.log('       is_active       = true,');
console.log('       failed_attempts = 0,');
console.log('       locked_until    = null;');
console.log('\n--- Fim ---\n');
console.log('A senha em texto puro nao foi exibida, gravada nem registrada em lugar nenhum.\n');
