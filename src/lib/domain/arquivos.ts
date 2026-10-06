/**
 * Repositorio de Arquivos do time (migration 059): as regras puras.
 *
 * O que entra, de que tipo e, quanto pode pesar e como o nome fica guardado.
 * Modulo sem servidor nem navegador: a tela confere antes de enviar (para a
 * pessoa saber na hora), e o servidor confere de novo (porque a tela nao
 * protege nada).
 */

export type TipoDeArquivo = 'IMAGEM' | 'VIDEO' | 'DOCUMENTO' | 'AUDIO' | 'OUTRO';

export const TIPOS_DE_ARQUIVO: readonly TipoDeArquivo[] = ['IMAGEM', 'VIDEO', 'DOCUMENTO', 'AUDIO', 'OUTRO'];

export const ROTULO_DO_TIPO: Record<TipoDeArquivo, { um: string; varios: string }> = {
  IMAGEM: { um: 'Imagem', varios: 'Imagens' },
  VIDEO: { um: 'Vídeo', varios: 'Vídeos' },
  DOCUMENTO: { um: 'Documento', varios: 'Documentos' },
  AUDIO: { um: 'Áudio', varios: 'Áudios' },
  OUTRO: { um: 'Arquivo', varios: 'Outros' },
};

/** Limite por arquivo. O plano do Supabase pode impor um teto menor. */
export const LIMITE_DO_ARQUIVO = 500 * 1024 * 1024;

/** Quantos arquivos de uma vez na fila de envio. */
export const ARQUIVOS_POR_VEZ = 50;

/**
 * Extensoes recusadas: executaveis e paginas com codigo. Um repositorio de
 * time guarda material de campanha — nada aqui precisa rodar.
 */
const BLOQUEADAS = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'dll', 'sys', 'vbs', 'vbe', 'js', 'jse', 'mjs', 'ws', 'wsf',
  'ps1', 'psm1', 'sh', 'bash', 'zsh', 'jar', 'apk', 'app', 'dmg', 'pkg', 'deb', 'rpm', 'iso', 'html', 'htm', 'xhtml',
  'svg', 'svgz', 'php', 'asp', 'aspx', 'jsp', 'py', 'rb', 'pl', 'lnk', 'reg', 'hta', 'msc', 'gadget',
]);

const DOCUMENTOS = new Set([
  'pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp', 'key', 'pages',
  'numbers', 'zip', 'rar', '7z', 'tar', 'gz', 'epub',
]);
const IMAGENS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'avif']);
const VIDEOS = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', '3gp', 'wmv', 'mpeg', 'mpg']);
const AUDIOS = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'amr']);

/** "Relatório Final.PDF" -> "pdf". Sem ponto: vazio. */
export function extensaoDe(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? '';
  const ponto = base.lastIndexOf('.');
  return ponto > 0 ? base.slice(ponto + 1).toLowerCase() : '';
}

/** O tipo pela extensao e, sem ela, pelo tipo que o navegador informou. */
export function tipoDoArquivo(nome: string, mime: string): TipoDeArquivo {
  const ext = extensaoDe(nome);
  if (IMAGENS.has(ext)) return 'IMAGEM';
  if (VIDEOS.has(ext)) return 'VIDEO';
  if (AUDIOS.has(ext)) return 'AUDIO';
  if (DOCUMENTOS.has(ext)) return 'DOCUMENTO';
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'IMAGEM';
  if (m.startsWith('video/')) return 'VIDEO';
  if (m.startsWith('audio/')) return 'AUDIO';
  if (m.startsWith('text/') || m.includes('pdf') || m.includes('document') || m.includes('sheet') || m.includes('presentation')) {
    return 'DOCUMENTO';
  }
  return 'OUTRO';
}

/**
 * O nome que fica guardado: sem pastas, sem caracteres de controle, sem
 * espacos sobrando e com no maximo 200 caracteres (a extensao e mantida).
 */
export function nomeSeguro(nome: string): string {
  const base = (nome.split(/[\\/]/).pop() ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) return 'arquivo';
  if (base.length <= 200) return base;
  const ext = extensaoDe(base);
  const corpo = ext ? base.slice(0, -(ext.length + 1)) : base;
  return ext ? `${corpo.slice(0, 199 - ext.length).trim()}.${ext}` : base.slice(0, 200);
}

/** O tipo MIME que vai junto do arquivo. Vazio vira o generico. */
export function mimeSeguro(mime: string): string {
  const m = mime.trim().toLowerCase();
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(m) && m.length <= 150 ? m : 'application/octet-stream';
}

export type ResultadoDaValidacao =
  | { ok: true; nome: string; mime: string; tipo: TipoDeArquivo; extensao: string }
  | { ok: false; motivo: string };

/** Pode entrar no repositorio? E, se puder, com que nome, tipo e MIME. */
export function validarArquivo(arquivo: { nome: string; tamanho: number; mime: string }): ResultadoDaValidacao {
  const nome = nomeSeguro(arquivo.nome);
  const extensao = extensaoDe(nome);
  if (BLOQUEADAS.has(extensao)) {
    return { ok: false, motivo: `Arquivos .${extensao} não são aceitos: o repositório guarda imagens, vídeos, áudios e documentos.` };
  }
  if (!Number.isFinite(arquivo.tamanho) || arquivo.tamanho <= 0) return { ok: false, motivo: 'O arquivo está vazio.' };
  if (arquivo.tamanho > LIMITE_DO_ARQUIVO) {
    return { ok: false, motivo: `O arquivo passa de ${formatarTamanho(LIMITE_DO_ARQUIVO)}, o limite por arquivo.` };
  }
  const mime = mimeSeguro(arquivo.mime);
  if (/html|javascript|x-sh|x-msdownload|x-executable|svg/.test(mime)) {
    return { ok: false, motivo: 'Esse tipo de arquivo não é aceito.' };
  }
  return { ok: true, nome, mime, tipo: tipoDoArquivo(nome, mime), extensao: extensao || 'bin' };
}

/** 1536 -> "1,5 KB"; 52428800 -> "50 MB". */
export function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  let valor = bytes;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024;
    i += 1;
  }
  const casas = i === 0 || valor >= 100 ? 0 : 1;
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: casas })} ${unidades[i]}`;
}

/** A familia do documento, para o icone e a cor na tela. */
export type FamiliaDoDocumento = 'pdf' | 'texto' | 'planilha' | 'apresentacao' | 'compactado' | 'outro';

export function familiaDoDocumento(nome: string): FamiliaDoDocumento {
  const ext = extensaoDe(nome);
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages', 'epub'].includes(ext)) return 'texto';
  if (['xls', 'xlsx', 'ods', 'csv', 'numbers'].includes(ext)) return 'planilha';
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext)) return 'apresentacao';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'compactado';
  return 'outro';
}

/** Um arquivo do repositorio, como a tela recebe. */
export interface ArquivoDoTime {
  id: string;
  nome: string;
  mime: string;
  tamanho: number;
  tipo: TipoDeArquivo;
  criadoEm: string;
  enviadoPor: string | null;
  /** URL assinada para ver (imagem, video, PDF). Curta. */
  url: string | null;
  /** URL assinada que baixa com o nome do arquivo. Curta. */
  download: string | null;
}

/** O resumo do topo: quantos de cada tipo e o tamanho somado. */
export function resumoDoRepositorio(arquivos: readonly Pick<ArquivoDoTime, 'tipo' | 'tamanho'>[]) {
  const porTipo = Object.fromEntries(TIPOS_DE_ARQUIVO.map((t) => [t, 0])) as Record<TipoDeArquivo, number>;
  let total = 0;
  for (const a of arquivos) {
    porTipo[a.tipo] += 1;
    total += a.tamanho;
  }
  return { quantidade: arquivos.length, porTipo, tamanho: total };
}
