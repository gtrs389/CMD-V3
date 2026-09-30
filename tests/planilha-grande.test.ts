import { describe, expect, it } from 'vitest';
import { holdDataChanged, notifyDataChanged, subscribeToData } from '@/lib/repositories/events';

/**
 * Planilha grande: 400 pessoas gravadas uma por vez nao podem disparar 400
 * recarregamentos da lista inteira do time. Durante o lote os avisos ficam
 * represados, e as telas recarregam UMA vez, no fim.
 */
describe('avisos represados durante a planilha', () => {
  it('400 gravações viram um recarregamento só, no fim', () => {
    let recarregou = 0;
    const sair = subscribeToData(() => (recarregou += 1));

    const soltar = holdDataChanged();
    for (let i = 0; i < 400; i += 1) notifyDataChanged();
    expect(recarregou).toBe(0);

    soltar();
    expect(recarregou).toBe(1);

    // Soltar de novo nao dispara nada a mais.
    soltar();
    expect(recarregou).toBe(1);
    sair();
  });

  it('lote sem gravação nenhuma não recarrega à toa', () => {
    let recarregou = 0;
    const sair = subscribeToData(() => (recarregou += 1));
    holdDataChanged()();
    expect(recarregou).toBe(0);
    sair();
  });

  it('fora do lote, cada escrita avisa na hora, como sempre', () => {
    let recarregou = 0;
    const sair = subscribeToData(() => (recarregou += 1));
    notifyDataChanged();
    notifyDataChanged();
    expect(recarregou).toBe(2);
    sair();
  });
});
