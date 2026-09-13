import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  API_BASE,
  API_ENDPOINTS,
  API_ERROS_GERAIS,
  API_ERRO_EXEMPLO,
  API_ESTADOS,
} from '@/lib/domain/api-docs';

/**
 * A documentacao da API e conferida contra o codigo.
 *
 * Documentacao que envelhece em silencio e pior do que documentacao nenhuma:
 * quem integra segue um endereco que nao existe mais e perde a tarde. Estes
 * testes abrem cada endpoint descrito na tela de Configuracoes e exigem que o
 * arquivo de rota exista e exporte o metodo documentado.
 */

const raiz = fileURLToPath(new URL('../', import.meta.url));

/** `/api/v1/links/{id}` -> `src/app/api/v1/links/[id]/route.ts`. */
function arquivoDaRota(caminho: string): string {
  const segmentos = caminho
    .replace(/^\//, '')
    .split('/')
    .map((parte) => parte.replace(/^\{(.+)\}$/, '[$1]'));

  return `${raiz}src/app/${segmentos.join('/')}/route.ts`;
}

describe('documentação da API', () => {
  it('descreve endpoints que existem de verdade', () => {
    for (const endpoint of API_ENDPOINTS) {
      const arquivo = arquivoDaRota(endpoint.caminho);
      expect(existsSync(arquivo), `rota ausente para ${endpoint.caminho}`).toBe(true);

      const fonte = readFileSync(arquivo, 'utf8');
      expect(
        fonte.includes(`export async function ${endpoint.metodo}(`),
        `${endpoint.caminho} não exporta ${endpoint.metodo}`,
      ).toBe(true);
    }
  });

  it('mantém todos os endpoints dentro da versão publicada', () => {
    for (const endpoint of API_ENDPOINTS) {
      expect(endpoint.caminho.startsWith(`${API_BASE}/`)).toBe(true);
    }
  });

  it('não repete identificador de endpoint', () => {
    const ids = API_ENDPOINTS.map((endpoint) => endpoint.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('traz exemplo de resposta em JSON válido, com o status documentado', () => {
    for (const endpoint of API_ENDPOINTS) {
      expect(() => JSON.parse(endpoint.resposta), `resposta inválida em ${endpoint.id}`).not.toThrow();
      expect(endpoint.respostaStatus).toBeGreaterThanOrEqual(200);
      expect(endpoint.respostaStatus).toBeLessThan(300);
      expect(endpoint.requisicao).toContain('Authorization: Bearer');
    }
  });

  it('exige cada parâmetro de caminho no corpo da documentação', () => {
    for (const endpoint of API_ENDPOINTS) {
      const naUrl = [...endpoint.caminho.matchAll(/\{(.+?)\}/g)].map((item) => item[1]);
      for (const nome of naUrl) {
        const documentado = endpoint.parametros.find((campo) => campo.nome === nome);
        expect(documentado, `parâmetro ${nome} não documentado em ${endpoint.id}`).toBeDefined();
        expect(documentado?.obrigatorio).toBe(true);
      }
    }
  });

  it('publica o formato de erro com código estável', () => {
    const exemplo = JSON.parse(API_ERRO_EXEMPLO) as {
      erro: { codigo: string; mensagem: string };
      message: string;
    };

    expect(exemplo.erro.codigo).toBeTruthy();
    // A mensagem e repetida em `message`: e a chave que o painel ja le.
    expect(exemplo.message).toBe(exemplo.erro.mensagem);

    const codigos = API_ERROS_GERAIS.map((erro) => erro.codigo);
    expect(codigos).toContain('nao_autenticado');
    expect(codigos).toContain('sem_permissao');
  });

  it('descreve o ciclo de vida inteiro do link', () => {
    const estados = API_ESTADOS.map((item) => item.estado);
    expect(estados).toEqual([
      'ACTIVE',
      'CLAIMED',
      'SUBMITTING',
      'CONSUMED',
      'EXPIRED',
      'REVOKED',
    ]);
  });
});
