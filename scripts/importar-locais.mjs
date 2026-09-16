#!/usr/bin/env node
/**
 * Carrega os locais de votacao do TSE na tabela `cmd_polling_places`
 * (migration 042).
 *
 * Uso:
 *   npm run importar-locais                       # supabase/dados/locais-de-votacao.csv
 *   npm run importar-locais -- caminho/do/arquivo.csv
 *   npm run importar-locais -- arquivo.csv --conferir   # so confere, nao grava
 *
 * O comando e IDEMPOTENTE: a chave natural da planilha (UF + municipio +
 * zona + local) faz cada linha ser atualizada no lugar. Rodar de novo, ou
 * rodar com a planilha de mais um estado, nunca duplica e nunca apaga o que
 * ja esta la. Nao existe DELETE em lugar nenhum deste arquivo.
 *
 * O CSV pode vir separado por virgula ou por ponto e virgula, com ou sem
 * aspas, com BOM do Excel e com coordenada escrita com virgula decimal: tudo
 * isso e reconhecido sozinho. As colunas sao encontradas pelo NOME, sem
 * depender da ordem.
 *
 * Nenhum dado pessoal passa por aqui: sao enderecos publicos de escolas.
 * A chave secreta e lida do ambiente (ou de .env.local) e nunca e exibida.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TABELA = 'cmd_polling_places';
const CHAVE = 'uf,city_code,zone,name';
const PADRAO = 'supabase/dados/locais-de-votacao.csv';
/** Linhas por requisicao. Alto o bastante para ser rapido, baixo o bastante
 *  para caber no corpo aceito pelo PostgREST e para o progresso ser visivel. */
const LOTE = 500;

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/** Le .env.local sem dependencia externa. O ambiente tem prioridade. */
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

function env(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/* -------------------------------------------------------------------------
   Leitura do CSV
   ------------------------------------------------------------------------- */

/**
 * Separador da planilha, decidido pela PRIMEIRA linha.
 *
 * "Secoes neste local" traz virgulas dentro do campo, entao contar virgulas
 * no arquivo inteiro enganaria. O cabecalho nao tem esse problema.
 */
function detectarSeparador(primeiraLinha) {
  const virgulas = (primeiraLinha.match(/,/g) ?? []).length;
  const pontoEVirgula = (primeiraLinha.match(/;/g) ?? []).length;
  const tabulacoes = (primeiraLinha.match(/\t/g) ?? []).length;

  if (tabulacoes > virgulas && tabulacoes > pontoEVirgula) return '\t';
  return pontoEVirgula > virgulas ? ';' : ',';
}

/**
 * CSV completo: aspas, aspas duplicadas dentro do campo e quebra de linha
 * dentro de campo entre aspas. Escrito a mao porque o projeto nao tem (e nao
 * precisa ter) uma dependencia so para isto.
 */
function parseCsv(texto, separador) {
  const linhas = [];
  let campo = '';
  let linha = [];
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const char = texto[i];

    if (dentroDeAspas) {
      if (char === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += char;
      }
      continue;
    }

    if (char === '"') {
      dentroDeAspas = true;
    } else if (char === separador) {
      linha.push(campo);
      campo = '';
    } else if (char === '\n') {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else if (char !== '\r') {
      campo += char;
    }
  }

  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  return linhas;
}

/** Acento, caixa e pontuacao nao decidem qual coluna e qual. */
function chaveDaColuna(nome) {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Nomes aceitos para cada coluna, do mais explicito ao mais curto.
 * A planilha do TSE e a exportada do Excel batem nos dois.
 */
const COLUNAS = {
  uf: ['uf', 'sigla uf', 'estado'],
  city_code: ['cod municipio', 'codigo municipio', 'cod ibge', 'cod mun'],
  city: ['municipio', 'nome municipio', 'cidade'],
  zone: ['zona', 'zona eleitoral', 'nr zona'],
  name: ['local de votacao escola', 'local de votacao', 'local votacao', 'local', 'escola'],
  place_type: ['tipo de local', 'tipo local', 'tipo'],
  address: ['endereco', 'logradouro'],
  district: ['bairro'],
  postal_code: ['cep'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'long', 'lon'],
  section_count: ['qtd secoes', 'quantidade de secoes', 'qtde secoes', 'total de secoes'],
  sections: ['secoes neste local', 'secoes', 'secao'],
};

function mapearCabecalho(cabecalho) {
  const chaves = cabecalho.map(chaveDaColuna);
  const indices = {};

  for (const [campo, aceitos] of Object.entries(COLUNAS)) {
    for (const aceito of aceitos) {
      const posicao = chaves.indexOf(aceito);
      if (posicao !== -1) {
        indices[campo] = posicao;
        break;
      }
    }
  }

  return indices;
}

/* -------------------------------------------------------------------------
   Conversao de cada campo
   ------------------------------------------------------------------------- */

function texto(valor, limite) {
  const limpo = (valor ?? '').replace(/\s+/g, ' ').trim();
  if (!limpo) return null;
  return limpo.length > limite ? limpo.slice(0, limite) : limpo;
}

function inteiro(valor) {
  const digitos = (valor ?? '').replace(/\D/g, '');
  if (!digitos) return null;
  const numero = Number.parseInt(digitos, 10);
  return Number.isFinite(numero) ? numero : null;
}

/** Aceita "-9.25912678" e "-9,25912678": a planilha vem dos dois jeitos. */
function coordenada(valor, limite) {
  const limpo = (valor ?? '').trim().replace(',', '.');
  if (!limpo) return null;
  const numero = Number.parseFloat(limpo);
  if (!Number.isFinite(numero)) return null;
  if (numero < -limite || numero > limite) return null;
  // Zero exato nas duas coordenadas e "sem coordenada" disfarcado de ponto no
  // meio do Atlantico. Tratado na linha, nao aqui.
  return numero;
}

function cep(valor) {
  const digitos = (valor ?? '').replace(/\D/g, '');
  return digitos.length === 8 ? digitos : null;
}

/** "1, 2, 3, 4, 16" -> [1, 2, 3, 4, 16], sem repetidas e em ordem. */
function secoes(valor) {
  const encontradas = (valor ?? '').match(/\d+/g) ?? [];
  const numeros = encontradas
    .map((item) => Number.parseInt(item, 10))
    .filter((numero) => Number.isFinite(numero) && numero > 0);
  return [...new Set(numeros)].sort((a, b) => a - b);
}

/* -------------------------------------------------------------------------
   Execucao
   ------------------------------------------------------------------------- */

loadEnvFile();

const argumentos = process.argv.slice(2);
const conferir = argumentos.includes('--conferir') || argumentos.includes('--dry-run');
const caminho = argumentos.find((item) => !item.startsWith('--')) ?? PADRAO;

let bruto;
try {
  bruto = readFileSync(resolve(process.cwd(), caminho), 'utf8');
} catch {
  fail(
    `Nao foi possivel ler "${caminho}".\n` +
      `Coloque a planilha em ${PADRAO} ou passe o caminho:\n` +
      '  npm run importar-locais -- caminho/do/arquivo.csv',
  );
}

// BOM do Excel: invisivel, mas quebraria o nome da primeira coluna.
if (bruto.charCodeAt(0) === 0xfeff) bruto = bruto.slice(1);

const primeiraQuebra = bruto.indexOf('\n');
const separador = detectarSeparador(
  primeiraQuebra === -1 ? bruto : bruto.slice(0, primeiraQuebra),
);

const linhas = parseCsv(bruto, separador);
if (linhas.length < 2) fail('A planilha nao tem linhas de dados.');

const indices = mapearCabecalho(linhas[0]);
const obrigatorias = ['uf', 'city_code', 'city', 'zone', 'name', 'sections'];
const faltando = obrigatorias.filter((campo) => indices[campo] === undefined);

if (faltando.length > 0) {
  fail(
    `A planilha nao tem as colunas: ${faltando.join(', ')}.\n` +
      `Cabecalho lido: ${linhas[0].join(' | ')}`,
  );
}

function valor(linha, campo) {
  const posicao = indices[campo];
  return posicao === undefined ? null : (linha[posicao] ?? null);
}

/**
 * Uma linha por LOCAL. Duas linhas da planilha com a mesma chave (a mesma
 * escola aparecendo duas vezes, uma por faixa de secoes) viram uma so, com as
 * secoes somadas — enviar as duas faria o banco recusar o lote inteiro.
 */
const locais = new Map();
const problemas = [];
let ignoradas = 0;
let semCoordenada = 0;

for (let i = 1; i < linhas.length; i += 1) {
  const linha = linhas[i];
  if (linha.length === 1 && (linha[0] ?? '').trim() === '') continue;

  const uf = (valor(linha, 'uf') ?? '').trim().toUpperCase();
  const cityCode = inteiro(valor(linha, 'city_code'));
  const zone = inteiro(valor(linha, 'zone'));
  const name = texto(valor(linha, 'name'), 300);

  if (!/^[A-Z]{2}$/.test(uf) || !cityCode || !zone || !name) {
    ignoradas += 1;
    if (problemas.length < 5) problemas.push(`linha ${i + 1}: ${linha.slice(0, 5).join(' | ')}`);
    continue;
  }

  const latitude = coordenada(valor(linha, 'latitude'), 90);
  const longitude = coordenada(valor(linha, 'longitude'), 180);
  const temCoordenada = latitude !== null && longitude !== null && (latitude !== 0 || longitude !== 0);
  if (!temCoordenada) semCoordenada += 1;

  const chave = `${uf}|${cityCode}|${zone}|${name}`;
  const anterior = locais.get(chave);
  const listaDeSecoes = secoes(valor(linha, 'sections'));

  if (anterior) {
    anterior.sections = [...new Set([...anterior.sections, ...listaDeSecoes])].sort((a, b) => a - b);
    anterior.section_count = anterior.sections.length;
    continue;
  }

  locais.set(chave, {
    uf,
    city_code: cityCode,
    city: texto(valor(linha, 'city'), 120) ?? String(cityCode),
    zone,
    name,
    place_type: texto(valor(linha, 'place_type'), 60),
    address: texto(valor(linha, 'address'), 400),
    district: texto(valor(linha, 'district'), 160),
    postal_code: cep(valor(linha, 'postal_code')),
    latitude: temCoordenada ? latitude : null,
    longitude: temCoordenada ? longitude : null,
    section_count: inteiro(valor(linha, 'section_count')) ?? listaDeSecoes.length,
    sections: listaDeSecoes,
  });
}

const registros = [...locais.values()];
const porUf = new Map();
for (const registro of registros) {
  porUf.set(registro.uf, (porUf.get(registro.uf) ?? 0) + 1);
}

console.log('');
console.log(`  arquivo ............ ${caminho}`);
console.log(`  separador .......... ${separador === '\t' ? 'tabulacao' : separador}`);
console.log(`  linhas lidas ....... ${linhas.length - 1}`);
console.log(`  locais ............. ${registros.length}`);
console.log(`  secoes ............. ${registros.reduce((total, item) => total + item.sections.length, 0)}`);
console.log(`  sem coordenada ..... ${semCoordenada}`);
console.log(`  ignoradas .......... ${ignoradas}`);
console.log(`  estados ............ ${[...porUf.keys()].sort().join(', ') || '-'}`);
console.log('');

if (problemas.length > 0) {
  console.log('  Primeiras linhas ignoradas (UF, municipio, zona ou local ausentes):');
  for (const problema of problemas) console.log(`    ${problema}`);
  console.log('');
}

if (registros.length === 0) fail('Nenhum local valido na planilha. Nada foi enviado.');

if (conferir) {
  console.log('Conferencia apenas: nada foi enviado ao banco.\n');
  process.exit(0);
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

if (secretKey.startsWith('sb_publishable_') || secretKey.startsWith('sbp_')) {
  fail('A chave configurada e publicavel. Use a chave secreta do projeto (sb_secret_...).');
}

const isLegacyJwtKey = JWT_SHAPE.test(secretKey);

if (!secretKey.startsWith('sb_secret_') && !isLegacyJwtKey) {
  fail('Formato de chave nao reconhecido. Use a chave secreta do projeto (sb_secret_...).');
}

function headers() {
  const value = {
    apikey: secretKey,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  };
  if (isLegacyJwtKey) value.Authorization = `Bearer ${secretKey}`;
  return value;
}

/** Nunca inclui a chave nem o corpo: apenas o motivo devolvido pela API. */
function describe(response, corpo) {
  const reason = corpo?.message ?? corpo?.error ?? corpo?.hint ?? '';
  return `HTTP ${response.status}${reason ? ` (${reason})` : ''}`;
}

async function enviar(lote) {
  const alvo = `${url}/rest/v1/${TABELA}?on_conflict=${CHAVE}`;

  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    let response;
    try {
      response = await fetch(alvo, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(lote),
      });
    } catch {
      if (tentativa === 3) return { ok: false, motivo: 'falha de conexao com o Supabase' };
      await new Promise((pronto) => setTimeout(pronto, tentativa * 2000));
      continue;
    }

    if (response.ok) return { ok: true };

    const texto = await response.text();
    let corpo = null;
    try {
      corpo = texto ? JSON.parse(texto) : null;
    } catch {
      corpo = null;
    }

    // Recusa do banco (coluna, check, permissao) nao melhora tentando de
    // novo: para na hora e diz o motivo.
    if (response.status < 500) return { ok: false, motivo: describe(response, corpo) };
    if (tentativa === 3) return { ok: false, motivo: describe(response, corpo) };
    await new Promise((pronto) => setTimeout(pronto, tentativa * 2000));
  }

  return { ok: false, motivo: 'falha desconhecida' };
}

console.log(`Enviando ${registros.length} locais em lotes de ${LOTE}...`);

let enviados = 0;
for (let i = 0; i < registros.length; i += LOTE) {
  const lote = registros.slice(i, i + LOTE);
  const resultado = await enviar(lote);

  if (!resultado.ok) {
    fail(
      `Falha ao enviar o lote que comeca na linha ${i + 1}: ${resultado.motivo}.\n` +
        `Os ${enviados} locais ja enviados continuam gravados — rode o comando de novo ` +
        'quando resolver: ele atualiza no lugar e nao duplica nada.',
    );
  }

  enviados += lote.length;
  process.stdout.write(`\r  enviados ........... ${enviados}/${registros.length}`);
}

console.log('');
console.log('');
console.log('Locais de votacao importados.\n');
