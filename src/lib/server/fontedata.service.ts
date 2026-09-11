import 'server-only';
import {
  parseCpfResult,
  parseTseResult,
  type CpfResult,
  type ErrorCode,
  type TseInput,
  type TseResult,
} from '@/lib/domain/verification';

/**
 * Consultas cadastrais na FonteData.
 *
 * Somente o servidor fala com o fornecedor. A chave vive em
 * `FONTEDATA_API_KEY` (sem `NEXT_PUBLIC_`) e segue no cabecalho `X-API-Key`.
 *
 * Nada e registrado em log: nem a chave, nem o CPF, nem a URL com a consulta,
 * nem o corpo da resposta. O que sai daqui em caso de falha e apenas um codigo
 * curto, seguro de mostrar ao ADMIN.
 *
 * Cada chamada e cobrada: este modulo nunca repete sozinho.
 */

const BASE_URL = 'https://app.fontedata.com/api/v1/consulta';
const TIMEOUT_MS = 10_000;

/** Falha prevista, com codigo seguro. Nunca carrega o corpo do fornecedor. */
export class FonteDataError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(code);
    this.name = 'FonteDataError';
    this.code = code;
  }
}

function apiKey(): string {
  const key = process.env.FONTEDATA_API_KEY?.trim();
  if (!key) throw new FonteDataError('MISSING_CONFIG');
  return key;
}

/** Traduz o codigo HTTP do fornecedor para um codigo interno seguro. */
function codeFor(status: number): ErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'INVALID_KEY';
    case 403:
      return 'NO_ACCESS';
    case 404:
      return 'NOT_FOUND';
    case 408:
      return 'TIMEOUT';
    case 500:
    case 503:
      return 'PROVIDER_UNAVAILABLE';
    default:
      return status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'UNEXPECTED';
  }
}

async function query(path: string, params: URLSearchParams): Promise<unknown> {
  // Calculada antes da chamada: sem chave, nenhuma consulta e feita.
  const credential = apiKey();
  let response: Response;

  try {
    response = await fetch(`${BASE_URL}/${path}?${params.toString()}`, {
      method: 'GET',
      headers: { 'X-API-Key': credential, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // A causa fica fora do log e fora da resposta.
    throw new FonteDataError(
      error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE',
    );
  }

  if (!response.ok) throw new FonteDataError(codeFor(response.status));

  const payload = await response.json().catch(() => null);
  if (payload === null) throw new FonteDataError('UNEXPECTED');
  return payload;
}

/**
 * Dados cadastrais da pessoa fisica.
 * O CPF vai somente com numeros, montado por `URLSearchParams`.
 */
export async function consultCpf(cpf: string): Promise<CpfResult> {
  const documento = (cpf ?? '').replace(/\D/g, '');
  if (documento.length !== 11) throw new FonteDataError('BAD_REQUEST');

  const params = new URLSearchParams({ cpf: documento });
  return parseCpfResult(await query('cadastro-pf-plus', params));
}

/**
 * Situacao eleitoral.
 * So deve ser chamada depois de a consulta de CPF devolver nome da mae e
 * data de nascimento; quem decide isso e `tseInputFrom`.
 */
export async function consultTse(input: TseInput): Promise<TseResult> {
  const params = new URLSearchParams({
    cpf: input.cpf,
    nome_mae: input.nomeMae,
    data_nascimento: input.dataNascimento,
  });
  return parseTseResult(await query('tse-titulo', params));
}
