import { describe, expect, it } from 'vitest';
import type { Member } from '@/lib/types';
import {
  avisoDeFaltas,
  cadastroIncompleto,
  camposFaltantes,
  resumoDasFaltas,
} from '@/lib/domain/member-completeness';

/**
 * A etiqueta de cadastro incompleto.
 *
 * Ela existe por causa da planilha: a lista entra com buraco, a pessoa nao
 * se perde, e a ficha diz o que falta. E CALCULADA da propria ficha, e nao
 * guardada — preencher o dado tira a etiqueta no mesmo instante.
 */

const COMPLETO: Member = {
  id: 'mem-1',
  clientId: 'cli-1',
  name: 'Ana Lima',
  phone: '82999990002',
  email: null,
  photo: null,
  gender: null,
  cpf: null,
  voterId: '100000002720',
  zone: '10',
  section: '147',
  state: 'AL',
  city: 'Palmeira dos Índios',
  district: 'Centro',
  street: 'Rua Brasil Novo',
  relationshipOptionId: null,
  relationshipLabel: null,
  responses: [],
  consentAt: null,
  source: 'admin',
  recruitedBy: null,
  recruiterChange: null,
  access: 'ACTIVE',
  userId: null,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

describe('cadastro incompleto', () => {
  it('ficha cheia não recebe etiqueta', () => {
    expect(camposFaltantes(COMPLETO)).toEqual([]);
    expect(cadastroIncompleto(COMPLETO)).toBe(false);
    expect(avisoDeFaltas(COMPLETO)).toBe('');
  });

  it('aponta cada buraco, seja qual for', () => {
    expect(camposFaltantes({ ...COMPLETO, phone: '' })).toEqual(['telefone']);
    expect(camposFaltantes({ ...COMPLETO, voterId: null })).toEqual(['título de eleitor']);
    expect(camposFaltantes({ ...COMPLETO, zone: null })).toEqual(['zona']);
    expect(camposFaltantes({ ...COMPLETO, section: null })).toEqual(['seção']);
    expect(camposFaltantes({ ...COMPLETO, state: null })).toEqual(['estado']);
    expect(camposFaltantes({ ...COMPLETO, city: null })).toEqual(['município']);
    expect(camposFaltantes({ ...COMPLETO, district: null })).toEqual(['bairro']);
    expect(camposFaltantes({ ...COMPLETO, street: null })).toEqual(['rua']);
  });

  it('espaço em branco não conta como preenchido', () => {
    expect(cadastroIncompleto({ ...COMPLETO, city: '   ' })).toBe(true);
  });

  it('foto, CPF, gênero e e-mail não pintam a equipe inteira de incompleta', () => {
    // São opcionais por natureza e nem toda operação os coleta: contá-los
    // marcaria todo mundo, e uma etiqueta em todo mundo não aponta ninguém.
    expect(cadastroIncompleto({ ...COMPLETO, cpf: null, gender: null, email: null })).toBe(false);
  });

  it('preencher o que faltava tira a etiqueta, sem ninguém desmarcar nada', () => {
    const importado = { ...COMPLETO, phone: '', zone: null };
    expect(cadastroIncompleto(importado)).toBe(true);

    const corrigido = { ...importado, phone: '82999990002', zone: '10' };
    expect(cadastroIncompleto(corrigido)).toBe(false);
  });

  it('o aviso lista o que falta, do jeito que se fala', () => {
    expect(resumoDasFaltas(['telefone'])).toBe('telefone');
    expect(resumoDasFaltas(['telefone', 'zona'])).toBe('telefone e zona');
    expect(resumoDasFaltas(['telefone', 'zona', 'seção'])).toBe('telefone, zona e seção');
    expect(resumoDasFaltas(['telefone', 'zona', 'seção', 'rua'])).toBe(
      'telefone, zona, seção e mais 1',
    );

    expect(avisoDeFaltas({ ...COMPLETO, phone: '', zone: null })).toBe(
      'Cadastro incompleto: falta telefone e zona.',
    );
  });
});
