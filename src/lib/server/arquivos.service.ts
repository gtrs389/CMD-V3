import 'server-only';
import type { SessionUser } from '@/lib/types';
import {
  validarArquivo,
  type ArquivoDoTime,
  type TipoDeArquivo,
} from '@/lib/domain/arquivos';
import { supabaseAuthHeaders, supabaseEnv } from '@/lib/supabase/env';
import { deleteRows, insertOne, selectOne, selectRows, updateRows } from '@/lib/supabase/rest';
import { TABLES, type TeamFileRow } from '@/lib/supabase/tables';
import { ApiError, badRequest, notFound } from './http';

/**
 * Repositorio de Arquivos do time (migration 059).
 *
 * O ARQUIVO nunca passa por aqui: uma funcao do servidor aceita poucos MB
 * por requisicao, e um video passa disso com folga. O caminho e outro:
 *
 *   1. `prepararEnvio` confere o arquivo (tipo, tamanho, nome) e pede ao
 *      Storage uma URL de envio ASSINADA, de uso unico, para um caminho que
 *      o servidor escolhe (`<time>/<uuid>.<ext>`);
 *   2. o navegador envia o arquivo direto para essa URL, com barra de
 *      progresso — sem chave nenhuma do banco;
 *   3. `confirmarEnvio` confere no Storage que o arquivo chegou (o tamanho
 *      vem de la, nao do navegador) e so entao grava a linha.
 *
 * A leitura e sempre por URL assinada e curta, gerada a cada listagem.
 */

export const ARQUIVOS_BUCKET = 'cmd-arquivos';

/** Validade das URLs de leitura, em segundos. */
const VALIDADE_DA_LEITURA = 60 * 60;

const SELECT = 'id,client_id,path,name,mime,size,kind,uploaded_by_user_id,uploaded_by_name,created_at';

/** O bucket do repositorio: privado, 500 MB por arquivo, os tipos da migration. */
const CONFIGURACAO_DO_BUCKET = {
  id: ARQUIVOS_BUCKET,
  name: ARQUIVOS_BUCKET,
  public: false,
  file_size_limit: 524288000,
  allowed_mime_types: [
    'image/*',
    'video/*',
    'audio/*',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'application/rtf',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed',
    'application/vnd.rar',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/octet-stream',
  ],
};

/** O id do time vira parte do caminho no bucket: so UUID entra. */
function exigirTime(clientId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) throw notFound('Time não encontrado.');
}

function cabecalhos(json = true): Headers {
  const headers = supabaseAuthHeaders();
  if (json) headers.set('Content-Type', 'application/json');
  return headers;
}

/** Cria o bucket se ele ainda nao existir (a migration tambem cria). */
async function garantirBucket(): Promise<void> {
  const { url } = supabaseEnv();
  const resposta = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: cabecalhos(),
    body: JSON.stringify(CONFIGURACAO_DO_BUCKET),
    cache: 'no-store',
  }).catch(() => null);
  // 409/400 "ja existe" tambem serve: o que importa e o bucket estar la.
  if (!resposta) throw new ApiError(503, 'Não foi possível preparar o armazenamento dos arquivos.');
}

function paraArquivo(row: TeamFileRow, url: string | null, download: string | null): ArquivoDoTime {
  return {
    id: row.id,
    nome: row.name,
    mime: row.mime,
    tamanho: Number(row.size),
    tipo: row.kind as TipoDeArquivo,
    criadoEm: row.created_at,
    enviadoPor: row.uploaded_by_name,
    url,
    download,
  };
}

/** URLs assinadas de leitura de varios caminhos, numa chamada so. */
async function assinarLeitura(paths: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(paths)];
  if (unicos.length === 0) return new Map();
  const { url } = supabaseEnv();
  const resposta = await fetch(`${url}/storage/v1/object/sign/${ARQUIVOS_BUCKET}`, {
    method: 'POST',
    headers: cabecalhos(),
    body: JSON.stringify({ expiresIn: VALIDADE_DA_LEITURA, paths: unicos }),
    cache: 'no-store',
  }).catch(() => null);
  if (!resposta?.ok) return new Map();
  const dados = (await resposta.json().catch(() => null)) as { path?: string | null; signedURL?: string | null }[] | null;
  const mapa = new Map<string, string>();
  for (const item of Array.isArray(dados) ? dados : []) {
    if (item?.path && item.signedURL) {
      mapa.set(item.path, `${url}/storage/v1${item.signedURL.startsWith('/') ? '' : '/'}${item.signedURL}`);
    }
  }
  return mapa;
}

/** A URL que baixa com o nome certo (o Storage manda `Content-Disposition`). */
const comDownload = (assinada: string, nome: string) =>
  `${assinada}${assinada.includes('?') ? '&' : '?'}download=${encodeURIComponent(nome)}`;

export async function listarArquivos(clientId: string): Promise<ArquivoDoTime[]> {
  exigirTime(clientId);
  const rows = await selectRows<TeamFileRow>(TABLES.teamFiles, {
    select: SELECT,
    filters: { client_id: `eq.${clientId}` },
    order: 'created_at.desc',
    limit: 2000,
  });
  const assinadas = await assinarLeitura(rows.map((r) => r.path));
  return rows.map((r) => {
    const url = assinadas.get(r.path) ?? null;
    return paraArquivo(r, url, url ? comDownload(url, r.name) : null);
  });
}

export interface EnvioPreparado {
  /** Caminho no bucket, escolhido pelo servidor. Volta na confirmacao. */
  caminho: string;
  /** Para onde o navegador envia o arquivo (PUT), com o token de uso unico. */
  urlDeEnvio: string;
  nome: string;
  mime: string;
}

/** Confere o arquivo e devolve a URL de envio assinada. */
export async function prepararEnvio(
  clientId: string,
  arquivo: { nome: string; tamanho: number; mime: string },
): Promise<EnvioPreparado> {
  exigirTime(clientId);
  const validado = validarArquivo(arquivo);
  if (!validado.ok) throw badRequest(validado.motivo);

  const caminho = `${clientId}/${crypto.randomUUID()}.${validado.extensao}`;
  const { url } = supabaseEnv();

  const pedir = () =>
    fetch(`${url}/storage/v1/object/upload/sign/${ARQUIVOS_BUCKET}/${caminho}`, {
      method: 'POST',
      headers: cabecalhos(),
      body: JSON.stringify({}),
      cache: 'no-store',
    }).catch(() => null);

  let resposta = await pedir();
  // Bucket ainda nao criado (migration nao rodou): cria e tenta de novo.
  if (resposta && !resposta.ok && [400, 404].includes(resposta.status)) {
    await garantirBucket();
    resposta = await pedir();
  }
  if (!resposta?.ok) throw new ApiError(503, 'Não foi possível preparar o envio. Tente novamente.');

  const dados = (await resposta.json().catch(() => null)) as { url?: string } | null;
  if (!dados?.url) throw new ApiError(503, 'Não foi possível preparar o envio. Tente novamente.');

  return {
    caminho,
    urlDeEnvio: `${url}/storage/v1${dados.url.startsWith('/') ? '' : '/'}${dados.url}`,
    nome: validado.nome,
    mime: validado.mime,
  };
}

/** O que o Storage diz do arquivo enviado: se existe e quanto pesa. */
async function arquivoNoStorage(caminho: string): Promise<{ tamanho: number; mime: string | null } | null> {
  const { url } = supabaseEnv();
  const barra = caminho.lastIndexOf('/');
  const pasta = caminho.slice(0, barra);
  const nome = caminho.slice(barra + 1);
  const resposta = await fetch(`${url}/storage/v1/object/list/${ARQUIVOS_BUCKET}`, {
    method: 'POST',
    headers: cabecalhos(),
    body: JSON.stringify({ prefix: pasta, search: nome, limit: 5 }),
    cache: 'no-store',
  }).catch(() => null);
  if (!resposta?.ok) return null;
  const lista = (await resposta.json().catch(() => null)) as
    | { name?: string; metadata?: { size?: number; mimetype?: string } | null }[]
    | null;
  const achado = (Array.isArray(lista) ? lista : []).find((item) => item?.name === nome);
  if (!achado) return null;
  return { tamanho: Number(achado.metadata?.size ?? 0), mime: achado.metadata?.mimetype ?? null };
}

/** Confere que o arquivo chegou ao Storage e grava a linha do repositorio. */
export async function confirmarEnvio(
  clientId: string,
  entrada: { caminho: string; nome: string; mime: string },
  user: SessionUser,
): Promise<ArquivoDoTime> {
  exigirTime(clientId);
  // O caminho tem de ser deste time e no formato que o servidor criou.
  const formato = new RegExp(`^${clientId}/[0-9a-f-]{36}\\.[a-z0-9]{1,10}$`);
  if (!formato.test(entrada.caminho)) throw badRequest('Envio inválido.');

  const noStorage = await arquivoNoStorage(entrada.caminho);
  if (!noStorage || noStorage.tamanho <= 0) throw badRequest('O arquivo não chegou ao armazenamento. Envie de novo.');

  const validado = validarArquivo({ nome: entrada.nome, tamanho: noStorage.tamanho, mime: noStorage.mime ?? entrada.mime });
  if (!validado.ok) {
    await apagarDoStorage(entrada.caminho);
    throw badRequest(validado.motivo);
  }

  const row = await insertOne<TeamFileRow>(
    TABLES.teamFiles,
    {
      client_id: clientId,
      path: entrada.caminho,
      name: validado.nome,
      mime: validado.mime,
      size: noStorage.tamanho,
      kind: validado.tipo,
      uploaded_by_user_id: user.id,
      uploaded_by_name: user.name?.slice(0, 200) || null,
    },
    SELECT,
  );
  const assinadas = await assinarLeitura([row.path]);
  const url = assinadas.get(row.path) ?? null;
  return paraArquivo(row, url, url ? comDownload(url, row.name) : null);
}

async function apagarDoStorage(caminho: string): Promise<void> {
  const { url } = supabaseEnv();
  const resposta = await fetch(`${url}/storage/v1/object/${ARQUIVOS_BUCKET}/${caminho}`, {
    method: 'DELETE',
    headers: cabecalhos(false),
    cache: 'no-store',
  }).catch(() => null);
  if (!resposta?.ok) console.warn('[arquivos] Não foi possível remover do armazenamento:', caminho);
}

async function linhaDoTime(clientId: string, arquivoId: string): Promise<TeamFileRow> {
  exigirTime(clientId);
  if (!/^[0-9a-f-]{36}$/i.test(arquivoId)) throw notFound('Arquivo não encontrado.');
  const row = await selectOne<TeamFileRow>(TABLES.teamFiles, {
    select: SELECT,
    filters: { id: `eq.${arquivoId}`, client_id: `eq.${clientId}` },
  });
  if (!row) throw notFound('Arquivo não encontrado.');
  return row;
}

export async function excluirArquivo(clientId: string, arquivoId: string): Promise<void> {
  const row = await linhaDoTime(clientId, arquivoId);
  await deleteRows(TABLES.teamFiles, { id: `eq.${row.id}`, client_id: `eq.${clientId}` });
  await apagarDoStorage(row.path);
}

export async function renomearArquivo(clientId: string, arquivoId: string, nome: string): Promise<ArquivoDoTime> {
  const row = await linhaDoTime(clientId, arquivoId);
  // O novo nome mantem a extensao do arquivo: renomear nao muda o tipo.
  const ext = row.name.includes('.') ? row.name.slice(row.name.lastIndexOf('.')) : '';
  const base = nome.trim().replace(/\.[^.]+$/, '') || 'arquivo';
  const validado = validarArquivo({ nome: `${base}${ext}`, tamanho: Number(row.size), mime: row.mime });
  if (!validado.ok) throw badRequest(validado.motivo);
  const [nova] = await updateRows<TeamFileRow>(
    TABLES.teamFiles,
    { id: `eq.${row.id}`, client_id: `eq.${clientId}` },
    { name: validado.nome },
    SELECT,
  );
  const atual = nova ?? { ...row, name: validado.nome };
  const assinadas = await assinarLeitura([atual.path]);
  const url = assinadas.get(atual.path) ?? null;
  return paraArquivo(atual, url, url ? comDownload(url, atual.name) : null);
}

/** Exclusao do time: os arquivos do bucket vao junto (as linhas caem em cascata). */
export async function apagarArquivosDoTime(clientId: string): Promise<void> {
  exigirTime(clientId);
  const rows = await selectRows<Pick<TeamFileRow, 'path'>>(TABLES.teamFiles, {
    select: 'path',
    filters: { client_id: `eq.${clientId}` },
    limit: 5000,
  }).catch(() => []);
  if (rows.length === 0) return;
  const { url } = supabaseEnv();
  await fetch(`${url}/storage/v1/object/${ARQUIVOS_BUCKET}`, {
    method: 'DELETE',
    headers: cabecalhos(),
    body: JSON.stringify({ prefixes: rows.map((r) => r.path) }),
    cache: 'no-store',
  }).catch(() => null);
}
