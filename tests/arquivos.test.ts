import { describe, expect, it } from 'vitest';
import {
  LIMITE_DO_ARQUIVO,
  extensaoDe,
  familiaDoDocumento,
  formatarTamanho,
  mimeSeguro,
  nomeSeguro,
  resumoDoRepositorio,
  tipoDoArquivo,
  validarArquivo,
} from '@/lib/domain/arquivos';

describe('repositório de arquivos: tipos', () => {
  it('reconhece imagem, vídeo, áudio e documento pela extensão', () => {
    expect(tipoDoArquivo('foto.JPG', '')).toBe('IMAGEM');
    expect(tipoDoArquivo('comicio.mov', 'application/octet-stream')).toBe('VIDEO');
    expect(tipoDoArquivo('jingle.mp3', '')).toBe('AUDIO');
    expect(tipoDoArquivo('plano.pdf', '')).toBe('DOCUMENTO');
    expect(tipoDoArquivo('lista.xlsx', '')).toBe('DOCUMENTO');
  });

  it('sem extensão conhecida, usa o tipo informado pelo navegador', () => {
    expect(tipoDoArquivo('sem-extensao', 'video/mp4')).toBe('VIDEO');
    expect(tipoDoArquivo('sem-extensao', 'application/x-qualquer')).toBe('OUTRO');
  });

  it('separa a família do documento para o ícone', () => {
    expect(familiaDoDocumento('a.pdf')).toBe('pdf');
    expect(familiaDoDocumento('a.docx')).toBe('texto');
    expect(familiaDoDocumento('a.csv')).toBe('planilha');
    expect(familiaDoDocumento('a.pptx')).toBe('apresentacao');
    expect(familiaDoDocumento('a.zip')).toBe('compactado');
  });
});

describe('repositório de arquivos: o que entra', () => {
  it('aceita documento, imagem e vídeo dentro do limite', () => {
    const r = validarArquivo({ nome: 'Relatório final.pdf', tamanho: 1200, mime: 'application/pdf' });
    expect(r).toEqual({ ok: true, nome: 'Relatório final.pdf', mime: 'application/pdf', tipo: 'DOCUMENTO', extensao: 'pdf' });
  });

  it('recusa executável, página com código e SVG', () => {
    expect(validarArquivo({ nome: 'instalador.exe', tamanho: 10, mime: 'application/x-msdownload' }).ok).toBe(false);
    expect(validarArquivo({ nome: 'pagina.html', tamanho: 10, mime: 'text/html' }).ok).toBe(false);
    expect(validarArquivo({ nome: 'logo.svg', tamanho: 10, mime: 'image/svg+xml' }).ok).toBe(false);
  });

  it('recusa arquivo vazio e acima do limite', () => {
    expect(validarArquivo({ nome: 'a.pdf', tamanho: 0, mime: 'application/pdf' }).ok).toBe(false);
    expect(validarArquivo({ nome: 'a.mp4', tamanho: LIMITE_DO_ARQUIVO + 1, mime: 'video/mp4' }).ok).toBe(false);
  });

  it('o nome perde pastas e caracteres de controle, e o MIME estranho vira genérico', () => {
    expect(nomeSeguro('C:\\\\pasta\\\\sub/arquivo\u0007 final.docx')).toBe('arquivo final.docx');
    expect(nomeSeguro('   ')).toBe('arquivo');
    const longo = nomeSeguro(`${'a'.repeat(300)}.pdf`);
    expect(longo.length).toBeLessThanOrEqual(200);
    expect(extensaoDe(longo)).toBe('pdf');
    expect(mimeSeguro('')).toBe('application/octet-stream');
    expect(mimeSeguro('Video/MP4')).toBe('video/mp4');
  });
});

describe('repositório de arquivos: números', () => {
  it('formata o tamanho em português', () => {
    expect(formatarTamanho(0)).toBe('0 B');
    expect(formatarTamanho(512)).toBe('512 B');
    expect(formatarTamanho(1536)).toBe('1,5 KB');
    expect(formatarTamanho(50 * 1024 * 1024)).toBe('50 MB');
  });

  it('resume quantos de cada tipo e o tamanho somado', () => {
    const r = resumoDoRepositorio([
      { tipo: 'IMAGEM', tamanho: 10 },
      { tipo: 'IMAGEM', tamanho: 5 },
      { tipo: 'VIDEO', tamanho: 100 },
    ]);
    expect(r.quantidade).toBe(3);
    expect(r.porTipo.IMAGEM).toBe(2);
    expect(r.porTipo.VIDEO).toBe(1);
    expect(r.porTipo.DOCUMENTO).toBe(0);
    expect(r.tamanho).toBe(115);
  });
});
