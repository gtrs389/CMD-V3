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
const MAX_PASSWORD = 200;

// Limites iguais aos checks de cmd_users na migration 001.
const MIN_NAME = 2;
const MAX_NAME = 120;
const MIN_EMAIL = 6;
const MAX_EMAIL = 254;

// Mesmo formato aceito pelo check de cmd_users.email.
const EMAIL_SHAPE = /^[^@\s]{1,64}@[^@\s]{1,189}\.[a-z]{2,24}$/;

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

/**
 * Literal de texto SQL.
 *
 * Aspas simples viram aspas duplicadas, que e o escape do proprio PostgreSQL.
 * Caracteres de controle sao recusados antes de chegar aqui, entao nao ha o
 * que escapar alem disso.
 */
function sqlText(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Recusa caracteres de controle, que nao tem representacao segura no literal. */
function hasControlChars(value) {
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
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

  if (!EMAIL_SHAPE.test(email)) {
    fail('E-mail invalido.');
  }

  if (email.length < MIN_EMAIL || email.length > MAX_EMAIL) {
    fail(`O e-mail precisa ter entre ${MIN_EMAIL} e ${MAX_EMAIL} caracteres.`);
  }

  if (name.length < MIN_NAME || name.length > MAX_NAME) {
    fail(`O nome precisa ter entre ${MIN_NAME} e ${MAX_NAME} caracteres.`);
  }

  if (hasControlChars(name) || hasControlChars(email)) {
    fail('Nome e e-mail nao podem conter caracteres de controle.');
  }

  if (password.length < MIN_PASSWORD) {
    fail(`A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`);
  }

  if (password.length > MAX_PASSWORD) {
    fail(`A senha precisa ter no maximo ${MAX_PASSWORD} caracteres.`);
  }

  if (password !== confirmation) {
    fail('As senhas nao conferem. Execute o comando novamente.');
  }
} catch (error) {
  fail(error instanceof Error ? error.message : 'Nao foi possivel ler a entrada.');
}

const hash = hashPassword(password);

/**
 * O SQL roda inteiro em uma transacao: ou o ADMIN e gravado e as sessoes
 * antigas dele sao revogadas, ou nada acontece. Trocar a senha sem derrubar as
 * sessoes deixaria um cookie roubado valido ate expirar.
 */
const sql = `begin;

-- Cria o ADMIN, ou atualiza a senha se o e-mail ja existir.
with alvo as (
  insert into public.cmd_users (name, email, password_hash, role, is_active)
  values (${sqlText(name)}, ${sqlText(email)}, ${sqlText(hash)}, 'ADMIN', true)
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

commit;`;

console.log('\n--- Copie a partir daqui e cole no SQL Editor do Supabase ---\n');
console.log(sql);
console.log('\n--- Fim ---\n');
console.log('A senha em texto puro nao foi exibida, gravada nem registrada em lugar nenhum.');
console.log('Ao executar, as sessoes abertas deste ADMIN sao encerradas.\n');
