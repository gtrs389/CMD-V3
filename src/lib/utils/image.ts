import { appConfig } from '@/config/app.config';

/**
 * Tratamento de imagens no navegador.
 *
 * Nesta etapa as fotos ficam no localStorage como data URL. Por isso todo
 * arquivo passa por validacao de tipo/tamanho e por redimensionamento com
 * compressao, reduzindo o risco de estourar a cota do navegador.
 */

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ACCEPTED_IMAGE_ACCEPT_ATTR = 'image/jpeg,image/png,image/webp';

export class ImageError extends Error {}

export interface ProcessedImage {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

function isAcceptedType(type: string): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

export function validateImageFile(file: File): void {
  if (!isAcceptedType(file.type)) {
    throw new ImageError('Formato nao suportado. Envie uma imagem JPG, PNG ou WEBP.');
  }
  if (file.size > appConfig.limits.maxUploadBytes) {
    const maxMb = Math.round(appConfig.limits.maxUploadBytes / (1024 * 1024));
    throw new ImageError(`Imagem muito grande. O limite e de ${maxMb} MB.`);
  }
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageError('Nao foi possivel ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageError('Arquivo de imagem invalido.'));
    img.src = src;
  });
}

/** Tamanho aproximado, em bytes, do conteudo de uma data URL base64. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Valida, redimensiona e comprime o arquivo, devolvendo uma data URL enxuta.
 * A qualidade cai progressivamente ate atingir o alvo de tamanho configurado.
 */
export async function processImageFile(
  file: File,
  options: { maxEdge?: number; targetBytes?: number } = {},
): Promise<ProcessedImage> {
  validateImageFile(file);

  const maxEdge = options.maxEdge ?? appConfig.limits.maxImageEdge;
  const targetBytes = options.targetBytes ?? appConfig.limits.targetImageBytes;

  const sourceDataUrl = await readAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);

  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new ImageError('Nao foi possivel processar a imagem neste navegador.');
  }
  context.drawImage(image, 0, 0, width, height);

  const mime = 'image/jpeg';
  let quality = 0.82;
  let dataUrl = canvas.toDataURL(mime, quality);

  while (dataUrlBytes(dataUrl) > targetBytes && quality > 0.4) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL(mime, quality);
  }

  return { dataUrl, width, height, bytes: dataUrlBytes(dataUrl) };
}
