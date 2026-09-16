import { describe, expect, it } from 'vitest';
import {
  canDeleteField,
  countResponses,
  createDefaultFormConfig,
  createField,
  duplicateField,
  moveField,
  reindex,
  withVerificationRules,
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
    recruiterChange: null,
    access: 'NO_PHONE' as const,
    userId: null,
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

describe('confirmação de dados desligada (migration 041)', () => {
  /** O formulário como o ADMIN o montou, com zona e seção opcionais. */
  function base() {
    return createDefaultFormConfig();
  }

  function campo(config: ReturnType<typeof base>, systemKey: string) {
    const encontrado = config.fields.find((field) => field.systemKey === systemKey);
    expect(encontrado, `campo ${systemKey} não existe`).toBeDefined();
    return encontrado!;
  }

  it('ligada, não altera nada: o formulário é o que o ADMIN montou', () => {
    const config = base();
    expect(withVerificationRules(config, true)).toBe(config);
  });

  it('desligada, zona e seção ficam obrigatórias e ligadas', () => {
    const config = withVerificationRules(base(), false);

    for (const chave of ['zone', 'section']) {
      const field = campo(config, chave);
      expect(field.required, `${chave} deveria ser obrigatório`).toBe(true);
      expect(field.enabled, `${chave} deveria estar ligado`).toBe(true);
    }
  });

  it('desligada, religa zona e seção que o ADMIN tinha desativado', () => {
    const original = base();
    const semEleitorais = {
      ...original,
      fields: original.fields.map((field) =>
        field.systemKey === 'zone' || field.systemKey === 'section'
          ? { ...field, enabled: false }
          : field,
      ),
    };

    const config = withVerificationRules(semEleitorais, false);
    expect(campo(config, 'zone').enabled).toBe(true);
    expect(campo(config, 'section').enabled).toBe(true);
  });

  it('desligada, não mexe em nenhum outro campo', () => {
    const original = base();
    const config = withVerificationRules(original, false);

    const intocados = (c: ReturnType<typeof base>) =>
      c.fields
        .filter((field) => field.systemKey !== 'zone' && field.systemKey !== 'section')
        .map((field) => [field.systemKey, field.required, field.enabled]);

    expect(intocados(config)).toEqual(intocados(original));
  });

  it('não reescreve a configuração gravada: religar devolve o formulário como estava', () => {
    const original = base();
    const antes = JSON.stringify(original);

    withVerificationRules(original, false);

    // A regra é derivada, nunca gravada: o objeto do ADMIN sai intacto, e é
    // ele que volta a valer quando a confirmação é religada.
    expect(JSON.stringify(original)).toBe(antes);
    expect(campo(original, 'zone').required).toBe(false);
  });
});
