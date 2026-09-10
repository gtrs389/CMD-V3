import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Os testes cobrem a camada de regras (validacao, permissoes, dominio e
 * persistencia), que roda sem navegador. A interface e verificada manualmente.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
