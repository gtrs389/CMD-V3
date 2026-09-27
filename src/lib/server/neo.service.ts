import 'server-only';
import {
  NEO_INSTRUCOES,
  NEO_MODELO_PADRAO,
  NEO_SCHEMA,
  lerAnalise,
  textoDaResposta,
  type AnaliseDoNeo,
  type ResumoParaONeo,
} from '@/lib/domain/neo';

/**
 * O NEO, pela API da OpenAI (Responses API, com Structured Outputs).
 *
 * Somente o servidor fala com a OpenAI. A chave vive em `OPENAI_API_KEY`
 * (sem `NEXT_PUBLIC_`) e vai apenas no cabecalho `Authorization`. O modelo e
 * `gpt-5.4-mini`, trocavel por `OPENAI_MODEL` sem mexer em codigo.
 *
 * O que sai daqui e o RESUMO do time (`resumoParaONeo`): numeros e os nomes
 * de quem coordena. Telefone, CPF, titulo e endereco de ninguem.
 *
 * Nada e registrado em log alem do codigo de falha: nem o resumo enviado,
 * nem a resposta. Cada chamada e cobrada, entao este modulo nunca repete
 * sozinho — quem quiser de novo clica de novo.
 */

const ENDPOINT = 'https://api.openai.com/v1/responses';
/** A analise e longa: o modelo precisa de tempo para escrever. */
const TIMEOUT_MS = 110_000;

export type NeoErro =
  | 'SEM_CONFIGURACAO'
  | 'CHAVE_INVALIDA'
  | 'LIMITE'
  | 'INDISPONIVEL'
  | 'DEMOROU'
  | 'RESPOSTA_INVALIDA';

/** O que a tela mostra quando o NEO nao escreveu. */
export const NEO_ERRO_MENSAGEM: Record<NeoErro, string> = {
  SEM_CONFIGURACAO:
    'O NEO não está configurado neste servidor (falta OPENAI_API_KEY). O relatório sai com todos os números, sem a análise escrita.',
  CHAVE_INVALIDA: 'A chave da OpenAI foi recusada. Confira OPENAI_API_KEY.',
  LIMITE: 'A OpenAI recusou por limite de uso ou de crédito. Tente de novo em alguns minutos.',
  INDISPONIVEL: 'A OpenAI não respondeu agora. Tente de novo em alguns minutos.',
  DEMOROU: 'O NEO demorou demais para responder. Tente de novo.',
  RESPOSTA_INVALIDA: 'O NEO respondeu fora do formato esperado. Tente de novo.',
};

export class NeoFalhou extends Error {
  readonly codigo: NeoErro;

  constructor(codigo: NeoErro) {
    super(codigo);
    this.name = 'NeoFalhou';
    this.codigo = codigo;
  }
}

function codigoDoStatus(status: number): NeoErro {
  if (status === 401 || status === 403) return 'CHAVE_INVALIDA';
  if (status === 429) return 'LIMITE';
  return 'INDISPONIVEL';
}

export function modeloDoNeo(): string {
  return process.env.OPENAI_MODEL?.trim() || NEO_MODELO_PADRAO;
}

export async function analisarComONeo(
  resumo: ResumoParaONeo,
  opcoes: { fetch?: typeof fetch } = {},
): Promise<AnaliseDoNeo> {
  const chave = process.env.OPENAI_API_KEY?.trim();
  if (!chave) throw new NeoFalhou('SEM_CONFIGURACAO');

  const chamar = opcoes.fetch ?? fetch;
  let resposta: Response;

  try {
    resposta = await chamar(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modeloDoNeo(),
        instructions: NEO_INSTRUCOES,
        input: [
          {
            role: 'user',
            content: `Dados do time, em JSON:\n\n${JSON.stringify(resumo)}`,
          },
        ],
        // Structured Outputs: a API so devolve JSON neste formato.
        text: {
          format: {
            type: 'json_schema',
            name: 'relatorio_do_time',
            strict: true,
            schema: NEO_SCHEMA,
          },
        },
        // O relatorio para a direcao e longo: carta, conclusoes, liderancas,
        // recomendacoes e fechamento.
        max_output_tokens: 12000,
        // Nada de guardar a conversa do lado de la: o resumo e do time.
        store: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const nome = (error as { name?: string })?.name;
    throw new NeoFalhou(nome === 'TimeoutError' || nome === 'AbortError' ? 'DEMOROU' : 'INDISPONIVEL');
  }

  if (!resposta.ok) {
    // So o codigo: o corpo do erro pode repetir parte do que foi enviado.
    console.warn('[cmd] NEO: a OpenAI respondeu %s', resposta.status);
    throw new NeoFalhou(codigoDoStatus(resposta.status));
  }

  const corpo = await resposta.json().catch(() => null);
  const analise = lerAnalise(textoDaResposta(corpo));
  if (!analise) {
    console.warn('[cmd] NEO: resposta fora do formato');
    throw new NeoFalhou('RESPOSTA_INVALIDA');
  }
  return analise;
}
