import { describe, expect, it } from 'vitest';
import {
  applyAudience,
  createDefaultFormConfig,
  createField,
  formForAudience,
} from '@/lib/domain/form-config';

/**
 * O time tem dois links de cadastro e cada um tem o proprio formulario. As
 * duas regras que dao errado em silencio moram aqui: salvar um link nao pode
 * apagar o ajuste do outro, e um campo criado em um link nao pode aparecer
 * sozinho no outro.
 */

describe('os dois links de cadastro', () => {
  it('cada link mostra o que foi decidido para ele', () => {
    const base = createDefaultFormConfig();
    const config = {
      ...base,
      fields: base.fields.map((field) =>
        field.systemKey === 'cpf'
          ? { ...field, enabled: true, required: true, enabledEquipe: false, requiredEquipe: false }
          : field,
      ),
    };

    const doAdmin = formForAudience(config, 'CANDIDATE');
    const daEquipe = formForAudience(config, 'EQUIPE');

    const cpfAdmin = doAdmin.fields.find((f) => f.systemKey === 'cpf');
    const cpfEquipe = daEquipe.fields.find((f) => f.systemKey === 'cpf');

    expect(cpfAdmin?.enabled).toBe(true);
    expect(cpfAdmin?.required).toBe(true);
    expect(cpfEquipe?.enabled).toBe(false);
    expect(cpfEquipe?.required).toBe(false);

    // A LISTA e a mesma: o que muda e o que cada link pergunta.
    expect(daEquipe.fields.map((f) => f.id)).toEqual(doAdmin.fields.map((f) => f.id));
  });

  it('salvar um link nunca apaga o ajuste do outro', () => {
    const base = { ...createField('text'), enabled: true, required: true, enabledEquipe: false, requiredEquipe: false };

    // O ADMIN edita o link da equipe e liga o campo la.
    const editado = { ...base, enabled: true, required: true };
    const gravado = applyAudience(base, editado, 'EQUIPE');

    expect(gravado.enabledEquipe).toBe(true);
    expect(gravado.requiredEquipe).toBe(true);
    // O link do administrador continua exatamente como estava.
    expect(gravado.enabled).toBe(true);
    expect(gravado.required).toBe(true);
  });

  it('campo criado dentro de um link não passa a ser pedido pelo outro', () => {
    const novo = { ...createField('text'), enabled: true, required: true };
    const gravado = applyAudience(undefined, novo, 'EQUIPE');

    expect(gravado.enabledEquipe).toBe(true);
    expect(gravado.enabled).toBe(false);
  });
});
