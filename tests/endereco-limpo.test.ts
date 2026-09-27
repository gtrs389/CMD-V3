import { describe, expect, it } from 'vitest';
import {
  CHAVE_DA_ROTA,
  SCRIPT_DA_MOLDURA,
  ehRotaDaMoldura,
  rotaGuardada,
} from '@/lib/domain/endereco-limpo';

/**
 * Endereco limpo: a barra mostra so o dominio, e o painel roda numa
 * moldura em `/`.
 */

/** Roda o script do `<head>` num navegador de mentira. */
function rodar(caminho: string, opcoes: { dentro?: boolean; busca?: string; semArmazenamento?: boolean } = {}) {
  const guardado = new Map<string, string>();
  const trocas: string[] = [];
  const trocasDeFora: string[] = [];
  const estilo = { visibility: '' };
  const location = {
    pathname: caminho,
    search: opcoes.busca ?? '',
    href: `https://painel.exemplo.com${caminho}${opcoes.busca ?? ''}`,
    replace: (url: string) => trocas.push(url),
  };
  const topo = { location: { replace: (url: string) => trocasDeFora.push(url) } };
  const janela: Record<string, unknown> = {};
  janela.self = janela;
  janela.top = opcoes.dentro ? topo : janela;
  const sessionStorage = {
    setItem: (k: string, v: string) => {
      if (opcoes.semArmazenamento) throw new Error('bloqueado');
      guardado.set(k, v);
    },
  };
  new Function('location', 'window', 'sessionStorage', 'document', SCRIPT_DA_MOLDURA)(
    location,
    janela,
    sessionStorage,
    { documentElement: { style: estilo } },
  );
  return { guardado, trocas, trocasDeFora, estilo };
}

describe('quais caminhos moram na moldura', () => {
  it('o painel e o login, e nada alem deles', () => {
    for (const c of ['/dashboard', '/candidatos', '/candidatos/abc', '/configuracoes', '/minha-mobilizacao', '/login', '/primeiro-acesso']) {
      expect(ehRotaDaMoldura(c), c).toBe(true);
    }
    for (const c of ['/', '/saida', '/api/clients', '/convite/abc', '/inspecionar/tok', '/dashboardx']) {
      expect(ehRotaDaMoldura(c), c).toBe(false);
    }
  });

  it('o caminho anotado so e usado se for uma tela do painel deste site', () => {
    expect(rotaGuardada('/candidatos/abc?aba=equipe')).toBe('/candidatos/abc?aba=equipe');
    expect(rotaGuardada('/login?proximo=/dashboard')).toBe('/login?proximo=/dashboard');
    expect(rotaGuardada('//outro-site.com/dashboard')).toBeNull();
    expect(rotaGuardada('https://outro-site.com/dashboard')).toBeNull();
    expect(rotaGuardada('/api/members')).toBeNull();
    expect(rotaGuardada('/\\outro')).toBeNull();
    expect(rotaGuardada('/')).toBeNull();
    expect(rotaGuardada(null)).toBeNull();
  });
});

describe('o script do <head>', () => {
  it('tela do painel aberta direto: anota o caminho e troca a barra para /', () => {
    const r = rodar('/candidatos/abc', { busca: '?aba=equipe' });
    expect(r.guardado.get(CHAVE_DA_ROTA)).toBe('/candidatos/abc?aba=equipe');
    expect(r.trocas).toEqual(['/']);
    // Escondida ate trocar: o caminho nao pisca na tela.
    expect(r.estilo.visibility).toBe('hidden');
  });

  it('a raiz e as telas publicas ficam como estao', () => {
    for (const c of ['/', '/saida']) {
      const r = rodar(c);
      expect(r.trocas).toEqual([]);
      expect(r.guardado.size).toBe(0);
    }
  });

  it('dentro da moldura, a tela do painel fica', () => {
    const r = rodar('/dashboard', { dentro: true });
    expect(r.trocas).toEqual([]);
    expect(r.trocasDeFora).toEqual([]);
  });

  it('a raiz carregada dentro da moldura sai dela: nunca moldura dentro de moldura', () => {
    expect(rodar('/', { dentro: true }).trocasDeFora).toEqual(['/']);
    expect(rodar('/saida', { dentro: true }).trocasDeFora).toEqual(['https://painel.exemplo.com/saida']);
  });

  it('sem armazenamento, nao troca nada: o painel continua funcionando', () => {
    const r = rodar('/dashboard', { semArmazenamento: true });
    expect(r.trocas).toEqual([]);
    expect(r.estilo.visibility).toBe('');
  });
});
