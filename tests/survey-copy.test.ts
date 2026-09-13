import { describe, expect, it } from 'vitest';
import { createDefaultFormConfig } from '@/lib/domain/form-config';
import { copyFromRegistration } from '@/lib/domain/survey-config';

/**
 * Copiar os campos do Formulario 1 para o Formulario 2 e um PONTO DE PARTIDA,
 * nao um vinculo. As regras que dao errado em silencio moram aqui: o que nao
 * pode vir junto, e o que o Formulario 2 desenharia vazio se viesse.
 */
describe('copiar os campos do Formulário 1', () => {
  const origem = createDefaultFormConfig().fields;

  it('não traz nome, telefone nem foto', () => {
    const copia = copyFromRegistration(origem);

    // Nome e telefone ja sao campos fixos do Formulario 2; foto o banco
    // recusa, porque ele nao recebe arquivo.
    expect(copia.some((field) => field.label === 'Nome completo')).toBe(false);
    expect(copia.some((field) => field.label === 'WhatsApp / Telefone')).toBe(false);
    expect(copia.some((field) => field.type === 'photo')).toBe(false);
  });

  it('traz o resto como campo comum, sem a maquinaria do cadastro', () => {
    const copia = copyFromRegistration(origem);

    expect(copia.length).toBeGreaterThan(0);
    // Sem `systemKey` nao ha verificacao de CPF, preenchimento de zona e
    // secao nem lista encadeada de endereco penduradas no campo.
    expect(copia.every((field) => field.systemKey === null)).toBe(true);
    // Identificadores novos: os dois formularios sao separados, e a resposta
    // de um nunca aponta para o campo do outro.
    expect(copia.every((field) => !origem.some((base) => base.id === field.id))).toBe(true);
    // Ordem sem buracos.
    expect(copia.map((field) => field.order)).toEqual(copia.map((_, index) => index));
  });

  it('materializa as listas que o cadastro preenchia sozinho', () => {
    const copia = copyFromRegistration(origem);

    // Genero e Estado tem lista fixa do sistema, injetada na hora de
    // desenhar o cadastro. Como campo comum, ficariam sem opcao nenhuma.
    const genero = copia.find((field) => field.label === 'Gênero');
    const estado = copia.find((field) => field.label === 'Estado (UF)');

    expect(genero?.options.length).toBeGreaterThan(0);
    expect(estado?.options.length).toBeGreaterThan(0);
    expect(
      copia.every((field) => field.type !== 'select' || field.options.length > 0),
    ).toBe(true);
  });
});
