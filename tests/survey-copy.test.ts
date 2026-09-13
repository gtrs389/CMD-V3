import { describe, expect, it } from 'vitest';
import { createDefaultFormConfig } from '@/lib/domain/form-config';
import { copyFromRegistration } from '@/lib/domain/survey-config';

/**
 * Copiar os campos do Formulario 1 para o Formulario 2 e um PONTO DE PARTIDA,
 * nao um vinculo. As regras que dao errado em silencio moram aqui: o que tem
 * de vir, o que nao pode vir, e o que o Formulario 2 desenharia vazio.
 */
describe('copiar os campos do Formulário 1', () => {
  const origem = createDefaultFormConfig().fields;

  it('traz TODOS os campos, na mesma ordem e no mesmo estado', () => {
    // Inclusive os desativados: copiar so o que esta ligado deixa de fora
    // campos que o ADMIN quer ter aqui e obriga a remonta-los a mao — que e
    // o trabalho que a copia existe para evitar.
    const comDesativado = origem.map((field) =>
      field.systemKey === 'voter_id' ? { ...field, enabled: false } : field,
    );
    const { fields } = copyFromRegistration(comDesativado);

    const esperados = comDesativado.filter(
      (field) =>
        field.type !== 'photo' && field.systemKey !== 'name' && field.systemKey !== 'phone',
    );

    expect(fields).toHaveLength(esperados.length);
    // Mesma ordem e mesmos rotulos.
    expect(fields.map((field) => field.label)).toEqual(esperados.map((field) => field.label));
    // Mesmo obrigatorio/opcional e mesmo ativo/desativado.
    expect(fields.map((field) => field.required)).toEqual(esperados.map((f) => f.required));
    expect(fields.map((field) => field.enabled)).toEqual(esperados.map((f) => f.enabled));
    // Ordem sem buracos.
    expect(fields.map((field) => field.order)).toEqual(fields.map((_, index) => index));
  });

  it('não traz nome, telefone nem foto, e diz quais ficaram fora', () => {
    const { fields, leftOut } = copyFromRegistration(origem);

    // Nome e telefone ja sao campos fixos do Formulario 2; foto o banco
    // recusa, porque ele nao recebe arquivo.
    expect(fields.some((field) => field.label === 'Nome completo')).toBe(false);
    expect(fields.some((field) => field.label === 'WhatsApp / Telefone')).toBe(false);
    expect(fields.some((field) => field.type === 'photo')).toBe(false);

    expect(leftOut).toEqual(['Foto', 'Nome completo', 'WhatsApp / Telefone']);
  });

  it('traz o resto como campo comum, sem a maquinaria do cadastro', () => {
    const { fields } = copyFromRegistration(origem);

    expect(fields.length).toBeGreaterThan(0);
    // Sem `systemKey` nao ha verificacao de CPF, preenchimento de zona e
    // secao nem lista encadeada de endereco penduradas no campo.
    expect(fields.every((field) => field.systemKey === null)).toBe(true);
    // Identificadores novos: os dois formularios sao separados, e a resposta
    // de um nunca aponta para o campo do outro.
    expect(fields.every((field) => !origem.some((base) => base.id === field.id))).toBe(true);
  });

  it('materializa as listas que o cadastro preenchia sozinho', () => {
    const { fields } = copyFromRegistration(origem);

    // Genero e Estado tem lista fixa do sistema, injetada na hora de
    // desenhar o cadastro. Como campo comum, ficariam sem opcao nenhuma.
    expect(fields.find((field) => field.label === 'Gênero')?.options.length).toBeGreaterThan(0);
    expect(fields.find((field) => field.label === 'Estado (UF)')?.options.length).toBeGreaterThan(0);
    expect(fields.every((field) => field.type !== 'select' || field.options.length > 0)).toBe(true);
  });
});
