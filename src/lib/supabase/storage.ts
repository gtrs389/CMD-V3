import 'server-only';
import { appConfig } from '@/config/app.config';
import { supabaseAuthHeaders, supabaseEnv } from './env';

/**
 * Storage privado do CMD.
 *
 * O bucket `cmd-media` nao e publico: as tabelas guardam apenas o caminho do
 * arquivo e alguns metadados. Toda leitura acontece por URL assinada gerada
 * aqui, no servidor, com validade curta.
 */

export const MEDIA_BUCKET = 'cmd-media';

/** Validade da URL assinada, em segundos. */
export const SIGNED_URL_TTL = 60 * 30;

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export class MediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaError';
  }
}

export interface DecodedImage {
  bytes: Uint8Array;
  mime: string;
  size: number;
}

/** Verdadeiro quando o valor recebido do navegador e uma nova imagem embutida. */
export function isDataUrl(value: string): boolean {
  return value.startsWith('data:');
}

/** Valida e decodifica a data URL enviada pelo navegador. */
export function decodeDataUrl(value: string): DecodedImage {
  const match = /^data:([a-z]+\/[a-z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(value);
  if (!match) throw new MediaError('Imagem invalida.');

  const mime = match[1].toLowerCase();
  if (!(ACCEPTED_MIME as readonly string[]).includes(mime)) {
    throw new MediaError('Formato nao suportado. Envie uma imagem JPG, PNG ou WEBP.');
  }

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(match[2], 'base64'));
  } catch {
    throw new MediaError('Imagem invalida.');
  }

  if (bytes.byteLength === 0) throw new MediaError('Imagem vazia.');
  if (bytes.byteLength > appConfig.limits.maxStoredImageBytes) {
    const maxMb = Math.round(appConfig.limits.maxStoredImageBytes / (1024 * 1024));
    throw new MediaError(`Imagem muito grande. O limite e de ${maxMb} MB.`);
  }

  return { bytes, mime, size: bytes.byteLength };
}

function authHeaders(): Headers {
  return supabaseAuthHeaders();
}

export interface StoredMedia {
  path: string;
  mime: string;
  size: number;
}

/** Envia a imagem para o bucket privado e devolve caminho e metadados. */
export async function uploadImage(prefix: string, dataUrl: string): Promise<StoredMedia> {
  const { url } = supabaseEnv();
  const image = decodeDataUrl(dataUrl);
  const extension = EXTENSIONS[image.mime] ?? 'bin';
  const path = `${prefix}/${crypto.randomUUID()}.${extension}`;

  const headers = authHeaders();
  headers.set('Content-Type', image.mime);
  headers.set('x-upsert', 'false');
  headers.set('Cache-Control', 'private, max-age=0');

  const response = await fetch(`${url}/storage/v1/object/${MEDIA_BUCKET}/${path}`, {
    method: 'POST',
    headers,
    body: image.bytes as unknown as BodyInit,
    cache: 'no-store',
  }).catch(() => null);

  if (!response || !response.ok) {
    throw new MediaError('Nao foi possivel salvar a imagem. Tente novamente.');
  }

  return { path, mime: image.mime, size: image.size };
}

/** Remove um arquivo. Falhas sao registradas e ignoradas: nunca travam o fluxo. */
export async function deleteImage(path: string | null): Promise<void> {
  if (!path) return;
  const { url } = supabaseEnv();

  const response = await fetch(`${url}/storage/v1/object/${MEDIA_BUCKET}/${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
    cache: 'no-store',
  }).catch(() => null);

  if (!response || !response.ok) {
    console.warn('[storage] Nao foi possivel remover o arquivo:', path);
  }
}

/** URL assinada de leitura. Retorna null quando o arquivo nao existe mais. */
export async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { url } = supabaseEnv();

  const headers = authHeaders();
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${url}/storage/v1/object/sign/${MEDIA_BUCKET}/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ expiresIn: SIGNED_URL_TTL }),
    cache: 'no-store',
  }).catch(() => null);

  if (!response || !response.ok) return null;

  const data = (await response.json().catch(() => null)) as { signedURL?: string } | null;
  if (!data?.signedURL) return null;

  return `${url}/storage/v1${data.signedURL.startsWith('/') ? '' : '/'}${data.signedURL}`;
}

/**
 * Assina varios caminhos em uma unica chamada, preservando a ordem recebida.
 * Evita uma requisicao por foto ao montar listagens.
 */
export async function signedUrls(paths: (string | null)[]): Promise<(string | null)[]> {
  const wanted = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (wanted.length === 0) return paths.map(() => null);

  const { url } = supabaseEnv();
  const headers = authHeaders();
  headers.set('Content-Type', 'application/json');

  const response = await fetch(`${url}/storage/v1/object/sign/${MEDIA_BUCKET}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ expiresIn: SIGNED_URL_TTL, paths: wanted }),
    cache: 'no-store',
  }).catch(() => null);

  if (!response || !response.ok) return paths.map(() => null);

  const data = (await response.json().catch(() => null)) as
    | { path?: string | null; signedURL?: string | null }[]
    | null;
  if (!Array.isArray(data)) return paths.map(() => null);

  const byPath = new Map<string, string>();
  for (const item of data) {
    if (!item?.path || !item.signedURL) continue;
    byPath.set(
      item.path,
      `${url}/storage/v1${item.signedURL.startsWith('/') ? '' : '/'}${item.signedURL}`,
    );
  }

  return paths.map((path) => (path ? (byPath.get(path) ?? null) : null));
}
