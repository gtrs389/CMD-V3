import { describe, expect, it } from 'vitest';
import { toErrorResponse } from '@/lib/server/http';
import { SupabaseRequestError } from '@/lib/supabase/rest';

/**
 * Recusa prevista do banco (P0001) precisa chegar legivel na tela.
 *
 * O caso real: o lider clicou em "Gerar link" com o Formulario 2 desligado
 * e recebeu "Não foi possível concluir a operação." — sem nenhuma pista de
 * que bastava ligar a chave em Configuracoes.
 */
async function corpo(response: Response): Promise<{ message: string }> {
  return (await response.json()) as { message: string };
}

describe('erros do banco', () => {
  it('traduz a recusa do Formulário 2 desligado', async () => {
    const response = toErrorResponse(
      new SupabaseRequestError('questionario desligado para este time', 400, 'P0001'),
    );

    expect(response.status).toBe(409);
    const { message } = await corpo(response);
    expect(message).toContain('Formulário 2 está desligado');
    expect(message).toContain('Configurações');
    // O nome antigo do modulo nao pode vazar para a tela.
    expect(message.toLowerCase()).not.toContain('question');
  });

  it('traduz a recusa do Formulário 2 sem campos ativos', async () => {
    const response = toErrorResponse(
      new SupabaseRequestError('questionario sem perguntas', 400, 'P0001'),
    );

    expect(response.status).toBe(409);
    expect((await corpo(response)).message).toContain('nenhum campo ativo');
  });

  it('guarda a recusa que nao esta na lista atras da mensagem generica', async () => {
    const response = toErrorResponse(
      new SupabaseRequestError('detalhe interno do banco', 400, 'P0001'),
    );

    expect(response.status).toBe(500);
    expect((await corpo(response)).message).toBe('Não foi possível concluir a operação.');
  });

  it('continua avisando quando falta migration', async () => {
    const response = toErrorResponse(
      new SupabaseRequestError('column x does not exist', 400, '42703'),
    );

    expect(response.status).toBe(503);
    expect((await corpo(response)).message).toContain('migration');
  });
});
