import { describe, expect, it } from 'vitest';
import {
  canDeleteField,
  countResponses,
  createDefaultFormConfig,
  createField,
  duplicateField,
  moveField,
  reindex,
} from '@/lib/domain/form-config';
import type { Member } from '@/lib/types';

describe('configuracao padrao', () => {
  it('cria os tres campos nativos na ordem correta', () => {
    const config = createDefaultFormConfig();
    expect(config.fields.map((field) => field.systemKey)).toEqual(['photo', 'name', 'phone']);
    expect(config.fields.map((field) => field.order)).toEqual([0, 1, 2]);
  });

  it('protege os campos nativos contra exclusao', () => {
    const config = createDefaultFormConfig();
    expect(config.fields.every((field) => canDeleteField(field))).toBe(false);
    expect(canDeleteField(createField('text'))).toBe(true);
  });
});

describe('reordenacao', () => {
  it('move um campo e reindexa a ordem', () => {
    const fields = reindex([createField('text'), createField('email'), createField('date')]);
    const moved = moveField(fields, 0, 2);

    expect(moved.map((field) => field.id)).toEqual([fields[1].id, fields[2].id, fields[0].id]);
    expect(moved.map((field) => field.order)).toEqual([0, 1, 2]);
  });

  it('ignora indices invalidos sem perder campos', () => {
    const fields = reindex([createField('text'), createField('email')]);
    expect(moveField(fields, 0, 5)).toHaveLength(2);
    expect(moveField(fields, -1, 0)).toHaveLength(2);
  });
});

describe('duplicacao', () => {
  it('gera novos IDs para o campo e para as opcoes', () => {
    const original = { ...createField('select'), label: 'Regiao' };
    const copy = duplicateField(original);

    expect(copy.id).not.toBe(original.id);
    expect(copy.label).toBe('Regiao (copia)');
    copy.options.forEach((option, index) => {
      expect(option.id).not.toBe(original.options[index].id);
    });
  });
});

describe('contagem de respostas', () => {
  const base = {
    id: 'm1',
    clientId: 'c1',
    name: 'Ana',
    phone: '11987654321',
    photo: null,
    consentAt: null,
    source: 'invite' as const,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  it('conta apenas respostas preenchidas', () => {
    const members: Member[] = [
      { ...base, id: 'm1', responses: [{ fieldId: 'f1', value: 'Centro' }] },
      { ...base, id: 'm2', responses: [{ fieldId: 'f1', value: '' }] },
      { ...base, id: 'm3', responses: [{ fieldId: 'f1', value: null }] },
      { ...base, id: 'm4', responses: [{ fieldId: 'f1', value: [] }] },
      { ...base, id: 'm5', responses: [{ fieldId: 'f1', value: ['a'] }] },
    ];

    expect(countResponses(members, 'f1')).toBe(2);
    expect(countResponses(members, 'inexistente')).toBe(0);
  });
});
