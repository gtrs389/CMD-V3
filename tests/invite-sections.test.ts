import { describe, expect, it } from 'vitest';
import { buildInviteSections, isWideField } from '@/components/public/invite-sections';
import { createDefaultFormConfig, createField } from '@/lib/domain/form-config';
import type { ClientFormConfig, CustomField } from '@/lib/types';

/**
 * Secoes da pagina publica de cadastro.
 *
 * O cadastro e uma pagina so: as secoes apenas agrupam os campos com um
 * titulo. Os testes provam que o agrupamento nao inventa campo, nao perde
 * campo ativo e nao mostra campo desativado.
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

describe('seções do cadastro público', () => {
  it('agrupa em dados, endereço e vínculo — sem etapa de revisão', () => {
    const sections = buildInviteSections(config());

    expect(sections.map((section) => section.id)).toEqual(['dados', 'endereco', 'vinculo']);
    // O rotulo da ultima acompanha o que ela tem: com pergunta personalizada
    // ativa, ela deixa de falar so de vinculo.
    expect(sections.map((section) => section.label)).toEqual([
      'Dados pessoais',
      'Endereço',
      'Vínculo e perguntas',
    ]);
  });

  it('distribui os campos do ADMIN entre as seções, sem repetir nem perder', () => {
    const form = config();
    const sections = buildInviteSections(form);

    expect(byKey(sections[0].fields)).toEqual([
      'photo',
      'name',
      'phone',
      'gender',
      'cpf',
      'voter_id',
      'zone',
      'section',
    ]);
    expect(byKey(sections[1].fields)).toEqual(['state', 'city', 'district', 'street']);
    // Vinculo leva tambem os campos personalizados ativos.
    expect(byKey(sections[2].fields)).toEqual(['relationship', 'fld-extra']);

    const distribuidos = sections.flatMap((section) => section.fields.map((field) => field.id));
    expect(new Set(distribuidos).size).toBe(distribuidos.length);
    expect(distribuidos).toHaveLength(form.fields.length);
  });

  it('mantém a ordem definida no construtor', () => {
    const form = config();
    const invertido: ClientFormConfig = {
      ...form,
      fields: form.fields.map((field) => ({ ...field, order: form.fields.length - field.order })),
    };

    expect(byKey(buildInviteSections(invertido)[0].fields)).toEqual([
      'section',
      'zone',
      'voter_id',
      'cpf',
      'gender',
      'phone',
      'name',
      'photo',
    ]);
  });

  it('não mostra campo desativado', () => {
    const form = config();
    const semCpf: ClientFormConfig = {
      ...form,
      fields: form.fields.map((field) =>
        field.systemKey === 'cpf' ? { ...field, enabled: false } : field,
      ),
    };

    const dados = byKey(buildInviteSections(semCpf)[0].fields);
    expect(dados).not.toContain('cpf');
    expect(dados).toContain('name');
  });

  it('some com a seção sem nenhum campo ativo', () => {
    const form = config();
    const semEndereco: ClientFormConfig = {
      ...form,
      fields: form.fields.map((field) =>
        ['state', 'city', 'district', 'street'].includes(field.systemKey ?? '')
          ? { ...field, enabled: false }
          : field,
      ),
    };

    expect(buildInviteSections(semEndereco).map((section) => section.id)).toEqual([
      'dados',
      'vinculo',
    ]);
  });

  it('campos largos ocupam a linha inteira', () => {
    const form = config();
    const campos = new Map(form.fields.map((field) => [field.systemKey ?? field.id, field]));

    expect(isWideField(campos.get('photo')!)).toBe(true);
    expect(isWideField(campos.get('name')!)).toBe(true);
    expect(isWideField(campos.get('relationship')!)).toBe(true);
    expect(isWideField(campos.get('fld-extra')!)).toBe(true);
    expect(isWideField(campos.get('cpf')!)).toBe(false);
  });
});
