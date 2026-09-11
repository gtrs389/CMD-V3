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

describe('configuração padrão', () => {
  it('cria os campos nativos na ordem correta', () => {
    const config = createDefaultFormConfig();
    expect(config.fields.map((field) => field.systemKey)).toEqual([
      'photo',
      'name',
      'email',
      'phone',
      'gender',
      'cpf',
      'voter_id',
      'zone',
      'section',
      'state',
      'city',
      'district',
      'street',
      'relationship',
    ]);
    expect(config.fields.map((field) => field.order)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
  });

  it('protege os campos nativos contra exclusão', () => {
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

  it('ignora indices inválidos sem perder campos', () => {
    const fields = reindex([createField('text'), createField('email')]);
    expect(moveField(fields, 0, 5)).toHaveLength(2);
    expect(moveField(fields, -1, 0)).toHaveLength(2);
  });
});

describe('duplicacao', () => {
  it('gera novos IDs para o campo e para as opções', () => {
    const original = { ...createField('select'), label: 'Região' };
    const copy = duplicateField(original);

    expect(copy.id).not.toBe(original.id);
    expect(copy.label).toBe('Região (cópia)');
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
    gender: null,
    cpf: null,
    voterId: null,
    zone: null,
    section: null,
    state: null,
    city: null,
    district: null,
  street: null,
    relationshipOptionId: null,
    relationshipLabel: null,
    consentAt: null,
    source: 'invite' as const,
    email: null,
    recruitedBy: null,
    access: 'NO_EMAIL' as const,
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
