import { describe, expect, it } from 'vitest';

/**
 * O endereco que vai nos links enviados.
 *
 * O link era montado no navegador, com o endereco da aba aberta. Como quem
 * gera esta no painel, o link saia apontando para `painel.<dominio>` — o
 * endereco que justamente nao se divulga, e onde a pessoa convidada cai na
 * tela de saida. A deducao mora aqui e tem teste porque errar nela manda
 * todo mundo para o lugar errado, um convite de cada vez.
 */

/** Mesma regra de `src/lib/server/public-origin.ts`. */
function derive(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.hostname.startsWith('painel.')) {
      url.hostname = `www.${url.hostname.slice('painel.'.length)}`;
    }
    return url.origin;
  } catch {
    return origin;
  }
}

describe('endereço dos links enviados', () => {
  it('troca o painel pelo domínio público', () => {
    expect(derive('https://painel.appdemo.sbs')).toBe(
      'https://www.appdemo.sbs',
    );
  });

  it('deixa em paz quem não está no painel', () => {
    // Quem ainda nao separou os dominios continua gerando o link no proprio
    // endereco: trocar por um `www.` que talvez nao exista seria pior.
    expect(derive('https://appdemo.sbs')).toBe('https://appdemo.sbs');
    expect(derive('https://www.appdemo.sbs')).toBe(
      'https://www.appdemo.sbs',
    );
    expect(derive('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('não inventa caminho nem perde a porta', () => {
    expect(derive('https://painel.exemplo.com:8443')).toBe('https://www.exemplo.com:8443');
  });
});
