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

    const { message } = await corpo(response);
    expect(message).toContain('Não foi possível concluir a operação.');
    // O texto interno do banco continua sem chegar a tela.
    expect(message).not.toContain('detalhe interno');
    // Codigo de referencia: e ele que liga a tela ao log do servidor.
    expect(message).toMatch(/\(código [0-9A-F]{6}\)$/);
  });

  it('trata dado recusado pelo banco como pedido inválido, e não como falha do servidor', async () => {
    // Violacao de check: o cadastro tem algo fora do formato aceito. Isso
    // virava 500 — a pessoa nao sabia se tentava de novo, se corrigia algum
    // campo ou se avisava alguem.
    const check = toErrorResponse(
      new SupabaseRequestError(
        'new row for relation "cmd_members" violates check constraint "cmd_members_zone_check"',
        400,
        '23514',
      ),
    );

    expect(check.status).toBe(400);
    const { message } = await corpo(check);
    expect(message).toContain('Revise os campos');
    // Nome de tabela e de constraint ficam so no log.
    expect(message).not.toContain('cmd_members');
    expect(message).not.toContain('check constraint');

    const longo = toErrorResponse(new SupabaseRequestError('value too long', 400, '22001'));
    expect(longo.status).toBe(400);
    expect((await corpo(longo)).message).toContain('longo demais');

    const chave = toErrorResponse(new SupabaseRequestError('fk violation', 409, '23503'));
    expect(chave.status).toBe(409);
  });

  it('traduz as guardas da origem do cadastro', async () => {
    const semDono = toErrorResponse(
      new SupabaseRequestError('responsavel pelo cadastro nao encontrado', 400, 'P0001'),
    );

    expect(semDono.status).toBe(409);
    expect((await corpo(semDono)).message).toContain('link novo');

    const outroTime = toErrorResponse(
      new SupabaseRequestError('responsavel pertence a outro candidato', 400, 'P0001'),
    );

    expect(outroTime.status).toBe(409);
    expect((await corpo(outroTime)).message).toContain('outro time');
  });

  it('continua avisando quando falta migration', async () => {
    const response = toErrorResponse(
      new SupabaseRequestError('column x does not exist', 400, '42703'),
    );

    expect(response.status).toBe(503);
    expect((await corpo(response)).message).toContain('migration');
  });
});
