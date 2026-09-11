import { describe, expect, it } from 'vitest';
import { createDefaultFormConfig, createField } from '@/lib/domain/form-config';
import type { ClientFormConfig, CustomField } from '@/lib/types';
import {
  CONSENT_KEY,
  buildDynamicSchema,
  emptyValues,
  formatResponse,
  toSubmission,
  valuesFromMember,
  visibleFields,
} from '@/lib/validation/dynamic-form';

function configWith(extra: CustomField[] = []): ClientFormConfig {
  const config = createDefaultFormConfig();
  return { ...config, fields: [...config.fields, ...extra] };
}

function systemField(config: ClientFormConfig, key: string): CustomField {
  const field = config.fields.find((item) => item.systemKey === key);
  if (!field) throw new Error(`Campo nativo ${key} ausente.`);
  return field;
}

describe('schema dinamico', () => {
  it('exige nome e telefone', () => {
    const config = configWith();
    const result = buildDynamicSchema(config).safeParse(emptyValues(config));

    expect(result.success).toBe(false);
    if (result.success) return;

    const paths = result.error.issues.map((issue) => issue.path[0]);
    expect(paths).toContain(systemField(config, 'name').id);
    expect(paths).toContain(systemField(config, 'phone').id);
  });

  it('recusa telefone fora do padrão brasileiro', () => {
    const config = configWith();
    const values = {
      ...emptyValues(config),
      [systemField(config, 'name').id]: 'Ana Souza',
      [systemField(config, 'phone').id]: '(11) 1234',
    };

    const result = buildDynamicSchema(config).safeParse(values);
    expect(result.success).toBe(false);
  });

  it('aceita o preenchimento mínimo valido', () => {
    const config = configWith();
    const values = {
      ...emptyValues(config),
      [systemField(config, 'name').id]: 'Ana Souza',
      // O e-mail e campo padrao obrigatorio: sem ele o envio nao passa.
      [systemField(config, 'email').id]: 'ana.souza@exemplo.test',
      [systemField(config, 'phone').id]: '(11) 98765-4321',
    };

    expect(buildDynamicSchema(config).safeParse(values).success).toBe(true);

    const semEmail = { ...values, [systemField(config, 'email').id]: '' };
    expect(buildDynamicSchema(config).safeParse(semEmail).success).toBe(false);

    const emailInvalido = { ...values, [systemField(config, 'email').id]: 'ana@@exemplo' };
    expect(buildDynamicSchema(config).safeParse(emailInvalido).success).toBe(false);
  });

  it('ignora campos desativados', () => {
    const extra: CustomField = { ...createField('text'), label: 'Bairro', required: true, enabled: false, order: 3 };
    const config = configWith([extra]);

    expect(visibleFields(config).some((field) => field.id === extra.id)).toBe(false);

    const values = {
      ...emptyValues(config),
      [systemField(config, 'name').id]: 'Ana',
      [systemField(config, 'email').id]: 'ana@exemplo.test',
      [systemField(config, 'phone').id]: '11987654321',
    };
    expect(buildDynamicSchema(config).safeParse(values).success).toBe(true);
  });

  it('exige consentimento quando configurado', () => {
    const base = createDefaultFormConfig();
    const config: ClientFormConfig = {
      ...base,
      privacy: { ...base.privacy, enabled: true, requireConsent: true },
    };

    const values = {
      ...emptyValues(config),
      [systemField(config, 'name').id]: 'Ana',
      [systemField(config, 'email').id]: 'ana@exemplo.test',
      [systemField(config, 'phone').id]: '11987654321',
    };

    expect(buildDynamicSchema(config).safeParse(values).success).toBe(false);
    expect(
      buildDynamicSchema(config).safeParse({ ...values, [CONSENT_KEY]: true }).success,
    ).toBe(true);
  });
});

describe('conversao para persistencia', () => {
  it('normaliza telefone e separa respostas personalizadas', () => {
    const extra: CustomField = { ...createField('number'), label: 'Idade', order: 3 };
    const config = configWith([extra]);

    const payload = toSubmission(config, {
      ...emptyValues(config),
      [systemField(config, 'name').id]: '  Ana Souza  ',
      [systemField(config, 'phone').id]: '+55 (11) 98765-4321',
      [extra.id]: '32',
    });

    expect(payload.name).toBe('Ana Souza');
    expect(payload.phone).toBe('11987654321');
    expect(payload.responses).toEqual([{ fieldId: extra.id, value: 32 }]);
  });

  it('salva o nome da localidade, nunca o marcador da opção "Outro"', () => {
    const config = configWith([]);

    const payload = toSubmission(config, {
      ...emptyValues(config),
      [systemField(config, 'name').id]: 'Ana',
      [systemField(config, 'phone').id]: '11987654321',
      [systemField(config, 'state').id]: 'sp',
      [systemField(config, 'city').id]: '  Campinas  ',
      [systemField(config, 'district').id]: 'Centro',
      [systemField(config, 'street').id]: '  Rua   das   Flores  ',
    });

    expect(payload.state).toBe('SP');
    expect(payload.city).toBe('Campinas');
    expect(payload.district).toBe('Centro');
    expect(payload.street).toBe('Rua das Flores');

    // Nenhum identificador de API entra no que e salvo.
    expect(JSON.stringify(payload)).not.toMatch(/__OTHER__|cityId|districtId|ibge/i);
  });

  it('mantem a resposta ligada ao ID mesmo após renomear o campo', () => {
    const extra: CustomField = { ...createField('text'), label: 'Bairro', order: 3 };
    const config = configWith([extra]);

    const payload = toSubmission(config, {
      ...emptyValues(config),
      [systemField(config, 'name').id]: 'Ana',
      [systemField(config, 'phone').id]: '11987654321',
      [extra.id]: 'Centro',
    });

    const renamed: ClientFormConfig = {
      ...config,
      fields: config.fields.map((field) =>
        field.id === extra.id ? { ...field, label: 'Região de atuação' } : field,
      ),
    };

    const member = {
      id: 'm1',
      clientId: 'c1',
      name: payload.name,
      phone: payload.phone,
      photo: null,
      gender: null,
      cpf: null,
      voterId: null,
      state: null,
      city: null,
      district: null,
  street: null,
      relationshipOptionId: null,
      relationshipLabel: null,
      responses: payload.responses,
      consentAt: null,
      source: 'invite' as const,
      email: null,
      recruitedBy: null,
      access: 'NO_EMAIL' as const,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    expect(valuesFromMember(renamed, member)[extra.id]).toBe('Centro');
  });
});

describe('formatacao de respostas', () => {
  it('resolve rotulos de lista e múltipla escolha', () => {
    const select = createField('select');
    select.options = [
      { id: 'o1', label: 'Norte' },
      { id: 'o2', label: 'Sul' },
    ];

    expect(formatResponse(select, 'o2')).toBe('Sul');

    const multi = { ...createField('multiselect'), options: select.options };
    expect(formatResponse(multi, ['o1', 'o2'])).toBe('Norte, Sul');

    const checkbox = createField('checkbox');
    expect(formatResponse(checkbox, true)).toBe('Sim');
    expect(formatResponse(checkbox, false)).toBe('Não');
  });
});
