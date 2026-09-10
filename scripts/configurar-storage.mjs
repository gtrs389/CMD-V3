#!/usr/bin/env node
/**
 * Cria ou atualiza o bucket privado de fotos do CMD pela API oficial do
 * Supabase Storage.
 *
 * Uso:
 *   npm run configurar-storage
 *
 * O comando e idempotente: rodar de novo apenas confere e corrige as
 * configuracoes do bucket. Nada e apagado e nenhum arquivo e tocado.
 *
 * A migration nao mexe em `storage.buckets` de proposito: escrever direto
 * nessa tabela contorna a logica do proprio Storage e pode divergir entre
 * versoes do Supabase.
 *
 * A chave secreta e lida do ambiente (ou de .env.local) e nunca e exibida.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BUCKET = 'cmd-media';
const FILE_SIZE_LIMIT = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/**
 * Le .env.local sem dependencia externa.
 * Valores ja definidos no ambiente tem prioridade.
 */
function loadEnvFile() {
  let content;
  try {
    content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  } catch {
    return;
  }

  for (const line of content.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile();

/** Variavel vazia conta como ausente, nao como valor. */
function env(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

const url = (env('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const currentKey = env('SUPABASE_SECRET_KEY');
const legacyKey = env('SUPABASE_SERVICE_ROLE_KEY');
const secretKey = currentKey ?? legacyKey ?? '';

if (!url || !secretKey) {
  fail(
    'Supabase nao configurado.\n' +
      'Defina SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente ou em .env.local.',
  );
}

if (!/^https:\/\/[^\s]+$/i.test(url)) {
  fail('SUPABASE_URL invalida. Use o endereco https do projeto.');
}

if (secretKey.startsWith('sb_publishable_') || secretKey.startsWith('sbp_')) {
  fail('A chave configurada e publicavel. Use a chave secreta do projeto (sb_secret_...).');
}

const isLegacyJwtKey = JWT_SHAPE.test(secretKey);

if (!secretKey.startsWith('sb_secret_') && !isLegacyJwtKey) {
  fail('Formato de chave nao reconhecido. Use a chave secreta do projeto (sb_secret_...).');
}

if (!currentKey && legacyKey) {
  console.warn('Aviso: usando SUPABASE_SERVICE_ROLE_KEY (legado). Prefira SUPABASE_SECRET_KEY.');
}

/**
 * A chave vai sempre em `apikey`. O `Authorization: Bearer` so e enviado para
 * as chaves antigas, que sao JWT de fato: uma chave `sb_secret_...` nesse
 * cabecalho seria interpretada como JWT invalido.
 */
function headers() {
  const value = { apikey: secretKey, 'Content-Type': 'application/json' };
  if (isLegacyJwtKey) value.Authorization = `Bearer ${secretKey}`;
  return value;
}

async function call(method, path, body) {
  let response;
  try {
    response = await fetch(`${url}/storage/v1${path}`, {
      method,
      headers: headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, data: null, networkError: true };
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  return { ok: response.ok, status: response.status, data, networkError: false };
}

/** Nunca inclui a chave: apenas o motivo devolvido pela API. */
function describe(result) {
  if (result.networkError) return 'falha de conexao com o Supabase';
  const reason = result.data?.message ?? result.data?.error ?? '';
  return `HTTP ${result.status}${reason ? ` (${reason})` : ''}`;
}

const settings = {
  public: false,
  file_size_limit: FILE_SIZE_LIMIT,
  allowed_mime_types: ALLOWED_MIME_TYPES,
};

console.log(`Conferindo o bucket "${BUCKET}"...`);

const existing = await call('GET', `/bucket/${BUCKET}`);

if (existing.networkError) {
  fail(`Nao foi possivel falar com o Supabase: ${describe(existing)}.`);
}

if (existing.status === 401 || existing.status === 403) {
  fail(
    `Acesso recusado pela API do Storage: ${describe(existing)}.\n` +
      'Confira se a chave configurada e a chave secreta do projeto.',
  );
}

if (existing.ok) {
  const updated = await call('PUT', `/bucket/${BUCKET}`, settings);
  if (!updated.ok) {
    fail(`O bucket existe, mas nao foi possivel atualiza-lo: ${describe(updated)}.`);
  }
  console.log('Bucket ja existia. Configuracoes conferidas e atualizadas.');
} else if (existing.status === 404) {
  const created = await call('POST', '/bucket', { id: BUCKET, name: BUCKET, ...settings });

  // Corrida com outra execucao simultanea: alguem criou primeiro.
  if (!created.ok && created.status === 409) {
    const updated = await call('PUT', `/bucket/${BUCKET}`, settings);
    if (!updated.ok) {
      fail(`O bucket foi criado por outra execucao e nao pode ser ajustado: ${describe(updated)}.`);
    }
    console.log('Bucket ja existia. Configuracoes conferidas e atualizadas.');
  } else if (!created.ok) {
    fail(`Nao foi possivel criar o bucket: ${describe(created)}.`);
  } else {
    console.log('Bucket criado.');
  }
} else {
  fail(`Resposta inesperada do Storage: ${describe(existing)}.`);
}

const final = await call('GET', `/bucket/${BUCKET}`);
if (!final.ok) {
  fail(`Nao foi possivel confirmar o estado do bucket: ${describe(final)}.`);
}

const bucket = final.data ?? {};
const limitOk = bucket.file_size_limit === FILE_SIZE_LIMIT;
const mimeOk =
  Array.isArray(bucket.allowed_mime_types) &&
  ALLOWED_MIME_TYPES.every((type) => bucket.allowed_mime_types.includes(type)) &&
  bucket.allowed_mime_types.length === ALLOWED_MIME_TYPES.length;

console.log('');
console.log(`  bucket ............ ${BUCKET}`);
console.log(`  privado ........... ${bucket.public === false ? 'sim' : 'NAO'}`);
console.log(`  limite por arquivo  ${limitOk ? '2 MB' : `${bucket.file_size_limit ?? 'nao definido'}`}`);
console.log(`  tipos aceitos ..... ${mimeOk ? ALLOWED_MIME_TYPES.join(', ') : 'divergente'}`);
console.log('');

if (bucket.public !== false || !limitOk || !mimeOk) {
  fail(
    'O bucket existe, mas as configuracoes nao conferem.\n' +
      'Ajuste pelo painel em Storage > cmd-media > Configuration, conforme supabase/SETUP.md.',
  );
}

console.log('Storage configurado.\n');
