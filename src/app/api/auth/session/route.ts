import { getSessionState } from '@/lib/auth/server';
import { jsonOk } from '@/lib/server/http';

/**
 * Estado da sessao, lido do cookie.
 *
 * Duas funcoes na mesma rota, porque sao a mesma pergunta: reconferir a
 * sessao ao voltar para a aba, e o batimento que o painel mantem enquanto
 * esta aberto.
 *
 * `blocked` e o que torna o desligamento do Time DEMO visivel: sem ele a
 * pessoa apenas se veria de volta no login, sem saber por que. A rota nao
 * exige permissao nenhuma — ela so conta o que ja vale para o cookie que o
 * proprio navegador enviou, e nao revela nada sobre outra conta.
 */
export async function GET() {
  const { user, blocked, message } = await getSessionState();
  return jsonOk({ user, blocked, message });
}
