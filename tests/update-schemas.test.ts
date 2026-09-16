import { describe, expect, it } from 'vitest';
import {
  clientUpdateSchema,
  formUpdateSchema,
  memberUpdateSchema,
  surveyUpdateSchema,
} from '@/lib/validation/server.schema';

/**
 * Numa edicao PARCIAL, o que nao foi enviado nao pode chegar ao servico.
 *
 * A armadilha e `.partial()` sobre um schema de criacao que tem
 * `.default()`: `.partial()` deixa o campo opcional, mas o padrao continua
 * sendo aplicado quando a chave esta ausente. O campo entao chega preenchido
 * com o padrao — e, para quem grava, padrao nao se distingue de escolha.
 *
 * Foi assim que salvar a estampa do banner apagava a foto do time: o payload
 * ganhava `photo: null` no caminho, e `null` quer dizer "remova".
 */

describe('edicao parcial nao inventa campo', () => {
  it('time: salvar so a estampa do banner nao toca em foto nem anotacoes', () => {
    const saida = clientUpdateSchema.parse({
      bannerTag: { left: 10, width: 50, top: 10, size: 5, color: '#0b5c2c' },
    });

    // `photo: null` chegaria ao servico como "REMOVA A FOTO".
    expect('photo' in saida).toBe(false);
    // `notes: ''` apagaria as anotacoes do time junto.
    expect('notes' in saida).toBe(false);
    expect(Object.keys(saida)).toEqual(['bannerTag']);
  });

  it('time: salvar so o banner nao toca na foto', () => {
    const saida = clientUpdateSchema.parse({ banner: null });

    expect('photo' in saida).toBe(false);
    expect(saida.banner).toBeNull();
  });

  it('time: renomear nao toca em foto, banner nem anotacoes', () => {
    const saida = clientUpdateSchema.parse({ name: 'Time Montenegro' });

    expect(Object.keys(saida)).toEqual(['name']);
  });

  it('time: o que E enviado continua chegando, inclusive a remocao', () => {
    // `null` explicito e uma ORDEM, e tem de passar: e assim que se remove a
    // foto de propósito.
    const remove = clientUpdateSchema.parse({ photo: null });
    expect('photo' in remove).toBe(true);
    expect(remove.photo).toBeNull();

    const nova = clientUpdateSchema.parse({ photo: 'data:image/png;base64,AAAA' });
    expect(nova.photo).toBe('data:image/png;base64,AAAA');
  });

  it('integrante, formulario e Formulario 2 seguem a mesma regra', () => {
    expect(Object.keys(memberUpdateSchema.parse({ name: 'Maria de Souza' }))).toEqual(['name']);
    expect(Object.keys(formUpdateSchema.parse({ introText: 'Olá' }))).toEqual(['introText']);
    expect(Object.keys(surveyUpdateSchema.parse({ active: true }))).toEqual(['active']);
  });
});
