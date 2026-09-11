import { describe, expect, it } from 'vitest';
import { buildInviteSteps, isWideField, stepValueKeys } from '@/components/public/invite-steps';
import { createDefaultFormConfig, createField } from '@/lib/domain/form-config';
import { CONSENT_KEY, formatFilledValue } from '@/lib/validation/dynamic-form';
import type { ClientFormConfig, CustomField } from '@/lib/types';

/**
 * Etapas da pagina publica de cadastro.
 *
 * Os campos continuam vindo da configuracao do ADMIN: os testes provam que a
 * distribuicao em etapas nao inventa campo, nao perde campo ativo e nao
 * mostra campo desativado.
 */

function config(): ClientFormConfig {
  const base = createDefaultFormConfig();
  const extra: CustomField = {
    ...createField('textarea'),
    id: 'fld-extra',
    label: 'Como você quer ajudar?',
    order: base.fields.length,
  };
  return { ...base, fields: [...base.fields, extra] };
}

function byKey(fields: CustomField[]): string[] {
  return fields.map((field) => field.systemKey ?? field.id);
}

describe('etapas do cadastro público', () => {
  it('tem as quatro etapas, na ordem do desenho', () => {
    const steps = buildInviteSteps(config());

    expect(steps.map((step) => step.id)).toEqual([
      'dados',
      'localizacao',
      'vinculo',
      'revisao',
    ]);
    expect(steps.map((step) => step.label)).toEqual([
      'Dados pessoais',
      'Localização',
      'Vínculo',
      'Revisão e confirmação',
    ]);
    // A revisao nunca tem campo proprio: e so o resumo.
    expect(steps[3].fields).toEqual([]);
  });

  it('distribui os campos do ADMIN entre as etapas, sem repetir nem perder', () => {
    const form = config();
    const steps = buildInviteSteps(form);

    expect(byKey(steps[0].fields)).toEqual([
      'photo',
      'name',
      'email',
      'phone',
      'gender',
      'cpf',
      'voter_id',
    ]);
    expect(byKey(steps[1].fields)).toEqual(['state', 'city', 'district', 'street']);
    // Vinculo leva tambem os campos personalizados ativos.
    expect(byKey(steps[2].fields)).toEqual(['relationship', 'fld-extra']);

    const distribuidos = steps.flatMap((step) => step.fields.map((field) => field.id));
    expect(new Set(distribuidos).size).toBe(distribuidos.length);
    expect(distribuidos).toHaveLength(form.fields.length);
  });

  it('mantém a ordem definida no construtor', () => {
    const form = config();
    const invertido: ClientFormConfig = {
      ...form,
      fields: form.fields.map((field) => ({ ...field, order: form.fields.length - field.order })),
    };

    const nomes = byKey(buildInviteSteps(invertido)[0].fields);
    expect(nomes).toEqual(['voter_id', 'cpf', 'gender', 'phone', 'email', 'name', 'photo']);
  });

  it('não mostra campo desativado', () => {
    const form = config();
    const semCpf: ClientFormConfig = {
      ...form,
      fields: form.fields.map((field) =>
        field.systemKey === 'cpf' ? { ...field, enabled: false } : field,
      ),
    };

    const dados = byKey(buildInviteSteps(semCpf)[0].fields);
    expect(dados).not.toContain('cpf');
    expect(dados).toContain('name');
  });

  it('some com a etapa sem nenhum campo ativo', () => {
    const form = config();
    const semLocalizacao: ClientFormConfig = {
      ...form,
      fields: form.fields.map((field) =>
        ['state', 'city', 'district', 'street'].includes(field.systemKey ?? '')
          ? { ...field, enabled: false }
          : field,
      ),
    };

    const steps = buildInviteSteps(semLocalizacao);
    expect(steps.map((step) => step.id)).toEqual(['dados', 'vinculo', 'revisao']);
  });

  it('valida na etapa apenas as chaves dela', () => {
    const form = config();
    const steps = buildInviteSteps(form);

    const dados = stepValueKeys(steps[0], form);
    expect(dados).toEqual(steps[0].fields.map((field) => field.id));
    expect(dados).not.toContain(CONSENT_KEY);

    // Sem aceite obrigatorio, a revisao nao tem chave nenhuma.
    expect(stepValueKeys(steps[3], form)).toEqual([]);

    const comAceite: ClientFormConfig = {
      ...form,
      privacy: { ...form.privacy, enabled: true, requireConsent: true },
    };
    expect(stepValueKeys(buildInviteSteps(comAceite)[3], comAceite)).toEqual([CONSENT_KEY]);
  });

  it('reserva a linha inteira para os campos largos', () => {
    const form = config();
    const porChave = new Map(form.fields.map((field) => [field.systemKey ?? field.id, field]));

    for (const chave of ['photo', 'name', 'gender', 'relationship', 'fld-extra']) {
      expect(isWideField(porChave.get(chave)!)).toBe(true);
    }
    for (const chave of ['email', 'phone', 'cpf', 'voter_id', 'city']) {
      expect(isWideField(porChave.get(chave)!)).toBe(false);
    }
  });
});

describe('resumo da revisão', () => {
  const form = config();
  const campo = (chave: string): CustomField =>
    form.fields.find((field) => (field.systemKey ?? field.id) === chave)!;

  it('mostra o valor formatado, como a pessoa informou', () => {
    expect(formatFilledValue(campo('phone'), '11988887777')).toBe('(11) 98888-7777');
    expect(formatFilledValue(campo('cpf'), '52998224725')).toBe('529.982.247-25');
    expect(formatFilledValue(campo('voter_id'), '102385080141')).toBe('1023 8508 0141');
    expect(formatFilledValue(campo('gender'), 'MULHER')).toBe('Mulher');
    expect(formatFilledValue(campo('name'), 'Ana Paula')).toBe('Ana Paula');
  });

  it('marca o que ficou em branco', () => {
    expect(formatFilledValue(campo('cpf'), '')).toBe('--');
    expect(formatFilledValue(campo('cpf'), '   ')).toBe('--');
    expect(formatFilledValue(campo('city'), null)).toBe('--');
    expect(formatFilledValue(campo('photo'), null)).toBe('--');
    expect(formatFilledValue(campo('photo'), 'data:image/png;base64,AAA')).toBe('Foto enviada');
  });

  it('usa o rótulo da opção escolhida', () => {
    const vinculo = campo('relationship');
    const opcao = vinculo.options[0];
    expect(formatFilledValue(vinculo, opcao.id)).toBe(opcao.label);
  });
});
