import { describe, expect, it } from 'vitest';
import { DEFAULT_TILE_URL, tileUrlFrom } from '@/lib/domain/map-tile';

/**
 * Quando o endereco dos tiles nao presta, o mapa NAO acusa erro: os pinos
 * continuam desenhados, sobre um fundo cinza vazio. E a falha que mais
 * parece "credencial faltando" sem ser — o OpenStreetMap nao usa nenhuma.
 * Por isso a regra tem teste proprio: o fundo cinza nao avisa.
 */

describe('endereco dos tiles do mapa', () => {
  it('sem configuracao nenhuma, usa o OpenStreetMap', () => {
    expect(tileUrlFrom(undefined)).toBe(DEFAULT_TILE_URL);
    expect(tileUrlFrom(null)).toBe(DEFAULT_TILE_URL);
  });

  it('variavel cadastrada e VAZIA cai no padrao', () => {
    // O `??` de antes entregava a string vazia inteira, e o mapa pedia tile
    // de lugar nenhum. Criar a variavel na hospedagem e deixar o campo em
    // branco era o caminho mais curto para o fundo cinza.
    expect(tileUrlFrom('')).toBe(DEFAULT_TILE_URL);
    expect(tileUrlFrom('   ')).toBe(DEFAULT_TILE_URL);
  });

  it('valor colado com aspas continua valendo', () => {
    // Em `.env` as aspas somem sozinhas; num painel de hospedagem elas
    // entram no valor.
    expect(tileUrlFrom('"https://tile.exemplo.com/{z}/{x}/{y}.png"')).toBe(
      'https://tile.exemplo.com/{z}/{x}/{y}.png',
    );
    expect(tileUrlFrom("'https://tile.exemplo.com/{z}/{x}/{y}.png'")).toBe(
      'https://tile.exemplo.com/{z}/{x}/{y}.png',
    );
  });

  it('endereco sem {z}/{x}/{y} cai no padrao', () => {
    // Sem os tres marcadores todo tile do mapa vira a mesma imagem, ou
    // nenhuma. Um mapa em pe vale mais que um fundo cinza.
    expect(tileUrlFrom('https://tile.exemplo.com/mapa.png')).toBe(DEFAULT_TILE_URL);
    expect(tileUrlFrom('https://tile.exemplo.com/{z}/{x}.png')).toBe(DEFAULT_TILE_URL);
  });

  it('endereco proprio valido e respeitado', () => {
    const proprio = 'https://tile.exemplo.com/estilo/{z}/{x}/{y}@2x.png?key=abc';
    expect(tileUrlFrom(proprio)).toBe(proprio);
  });

  it('o padrao tem os tres marcadores', () => {
    for (const marca of ['{z}', '{x}', '{y}']) {
      expect(DEFAULT_TILE_URL).toContain(marca);
    }
  });
});
