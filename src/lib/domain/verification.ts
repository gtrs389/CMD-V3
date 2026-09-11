/**
 * Verificacao cadastral: formato dos dados e regras de decisao.
 *
 * Modulo puro, sem rede e sem banco. Ele decide o que e retido de cada
 * resposta (somente o necessario para validar o cadastro), quando a consulta
 * eleitoral pode acontecer e qual e o estado geral da verificacao.
 */

export const VERIFICATION_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const STEP_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'SKIPPED_MISSING_DATA'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export type VerificationStep = 'cpf' | 'tse';

/** Codigos de erro seguros. Nunca carregam o corpo da resposta do fornecedor. */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'INVALID_KEY',
  'NO_ACCESS',
  'NOT_FOUND',
  'TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'UNEXPECTED',
  'MISSING_CONFIG',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Mensagem curta mostrada apenas ao ADMIN. */
export const ERROR_LABELS: Record<ErrorCode, string> = {
  BAD_REQUEST: 'Consulta recusada pelo fornecedor.',
  INVALID_KEY: 'Chave de acesso inválida.',
  NO_ACCESS: 'Acesso ou saldo indisponível.',
  NOT_FOUND: 'Dados não encontrados para este CPF.',
  TIMEOUT: 'O fornecedor não respondeu a tempo.',
  PROVIDER_UNAVAILABLE: 'Falha temporária do fornecedor.',
  UNEXPECTED: 'Resposta inesperada do fornecedor.',
  MISSING_CONFIG: 'Serviço de verificação não configurado.',
};

/**
 * Dados cadastrais retidos.
 *
 * O restante da resposta (e-mails, telefones, enderecos, parentescos, renda,
 * classe social, CBO e perfil domiciliar) e descartado: e excessivo para a
 * finalidade de validar o cadastro.
 */
export interface CpfResult {
  cpf: string | null;
  nome: string | null;
  sexo: string | null;
  idade: number | null;
  obito: boolean | null;
  dataNascimento: string | null;
  nomeMae: string | null;
  nomePai: string | null;
  situacaoCadastral: string | null;
  dataSituacaoCadastral: string | null;
}

export interface TseResult {
  status: string | null;
  eleitor: string | null;
  inscricao: string | null;
  biometriaColetada: boolean | null;
  uf: string | null;
  zona: string | null;
  secao: string | null;
  local: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  proximaEleicao: string | null;
}

/* -------------------------------------------------------------------------
   Leitura tolerante das respostas
   ------------------------------------------------------------------------- */

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A resposta pode vir direta ou dentro de `data`/`result`/`retorno`. */
function body(payload: unknown): Record<string, unknown> {
  const root = record(payload);
  if (!root) return {};
  for (const key of ['data', 'result', 'resultado', 'retorno']) {
    const inner = record(root[key]);
    if (inner) return inner;
  }
  return root;
}

function pick(source: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function text(value: unknown, max = 200): string | null {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function digits(value: unknown, max = 11): string | null {
  const raw = text(value, 40);
  if (!raw) return null;
  const only = raw.replace(/\D/g, '').slice(0, max);
  return only || null;
}

function integer(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;

  const raw = text(value, 10);
  if (!raw) return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function boolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const raw = text(value, 10)?.toLowerCase();
  if (!raw) return null;
  if (['true', 'sim', 's', '1'].includes(raw)) return true;
  if (['false', 'nao', 'não', 'n', '0'].includes(raw)) return false;
  return null;
}

export function parseCpfResult(payload: unknown): CpfResult {
  const data = body(payload);
  return {
    cpf: digits(pick(data, 'cpf', 'numeroCpf')),
    nome: text(pick(data, 'nome', 'nomeCompleto')),
    sexo: text(pick(data, 'sexo', 'genero'), 20),
    idade: integer(pick(data, 'idade')),
    obito: boolean(pick(data, 'obito', 'obitoIndicador')),
    // Cabe a data com hora e fuso: a normalizacao acontece em `toBirthDate`.
    dataNascimento: text(pick(data, 'dataNascimento', 'nascimento'), 40),
    nomeMae: text(pick(data, 'nomeMae', 'mae')),
    nomePai: text(pick(data, 'nomePai', 'pai')),
    situacaoCadastral: text(pick(data, 'situacaoCadastral', 'situacao'), 60),
    dataSituacaoCadastral: text(pick(data, 'dataSituacaoCadastral'), 40),
  };
}

export function parseTseResult(payload: unknown): TseResult {
  const data = body(payload);
  const identificacao = record(data.identificacao) ?? {};
  const domicilio = record(data.domicilioEleitoral) ?? {};

  return {
    status: text(pick(data, 'status'), 60),
    eleitor: text(pick(identificacao, 'eleitor', 'nome')),
    inscricao: text(pick(identificacao, 'inscricao'), 40),
    biometriaColetada: boolean(pick(data, 'biometriaColetada')),
    uf: text(pick(domicilio, 'uf'), 2),
    zona: text(pick(domicilio, 'zona'), 10),
    secao: text(pick(domicilio, 'secao'), 10),
    local: text(pick(domicilio, 'local'), 200),
    logradouro: text(pick(domicilio, 'logradouro')),
    numero: text(pick(domicilio, 'numero'), 20),
    bairro: text(pick(domicilio, 'bairro')),
    municipio: text(pick(domicilio, 'municipio')),
    proximaEleicao: text(pick(domicilio, 'proximaEleicao'), 60),
  };
}

/* -------------------------------------------------------------------------
   Regras do encadeamento
   ------------------------------------------------------------------------- */

/**
 * Normaliza a data de nascimento devolvida pela consulta de CPF para
 * DD/MM/AAAA.
 *
 * Aceita `DD/MM/AAAA` e qualquer valor que comece por `AAAA-MM-DD`: a data ISO
 * completa, com `T` e fuso, com espaco e hora, e tambem o texto legado cortado
 * no meio (`2003-12-10T00:00:00.`), gravado antes da correcao do tamanho do
 * campo. Sao os dez primeiros caracteres que valem; o resto e descartado.
 * O que nao comeca por uma data valida continua sendo tratado como ausente.
 */
export function toBirthDate(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return validDate(iso[3], iso[2], iso[1]);

  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  return br ? validDate(br[1], br[2], br[3]) : null;
}

/** Confere dia, mes e ano antes de montar o texto final. */
function validDate(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);

  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900) return null;

  // O dia precisa existir no mes informado.
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;

  return `${day}/${month}/${year}`;
}

export interface TseInput {
  cpf: string;
  nomeMae: string;
  dataNascimento: string;
}

/**
 * Monta a consulta eleitoral.
 *
 * O CPF e o digitado pelo membro, so com numeros. O nome da mae e a data de
 * nascimento vem exclusivamente do resultado da consulta de CPF: nada aqui
 * olha para os campos preenchidos no formulario. Sem um deles, depois da
 * normalizacao, a etapa vira SKIPPED_MISSING_DATA.
 */
export function tseInputFrom(cpf: string | null, result: CpfResult): TseInput | null {
  const documento = (cpf ?? '').replace(/\D/g, '');
  const nomeMae = (result.nomeMae ?? '').trim();
  const dataNascimento = toBirthDate(result.dataNascimento);

  if (documento.length !== 11 || !nomeMae || !dataNascimento) return null;
  return { cpf: documento, nomeMae, dataNascimento };
}

/** Estado geral a partir das duas etapas. */
export function overallStatus(cpf: StepStatus, tse: StepStatus): VerificationStatus {
  if (cpf === 'PENDING' || tse === 'PENDING') return 'RUNNING';
  if (cpf === 'FAILED' && tse !== 'SUCCESS') return 'FAILED';
  if (cpf === 'FAILED' || tse === 'FAILED') return 'PARTIAL';
  if (tse === 'SKIPPED_MISSING_DATA') return 'PARTIAL';
  return 'COMPLETED';
}

/* -------------------------------------------------------------------------
   Comparacao entre declarado e consultado
   ------------------------------------------------------------------------- */

function comparable(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export type MatchState = 'MATCH' | 'DIFFERENT' | 'UNKNOWN';

/** Nunca altera o declarado: apenas informa ao ADMIN se bate ou nao. */
export function compareValues(
  declared: string | null | undefined,
  found: string | null | undefined,
): MatchState {
  const a = comparable(declared);
  const b = comparable(found);
  if (!a || !b) return 'UNKNOWN';
  return a === b ? 'MATCH' : 'DIFFERENT';
}

/** Genero declarado (HOMEM/MULHER) contra o sexo devolvido (M/F). */
export function compareGender(
  declared: string | null | undefined,
  found: string | null | undefined,
): MatchState {
  const map: Record<string, string> = {
    homem: 'm',
    masculino: 'm',
    m: 'm',
    mulher: 'f',
    feminino: 'f',
    f: 'f',
  };
  const a = map[comparable(declared)];
  const b = map[comparable(found)];
  if (!a || !b) return 'UNKNOWN';
  return a === b ? 'MATCH' : 'DIFFERENT';
}

/* -------------------------------------------------------------------------
   Formato entregue a ficha do ADMIN
   ------------------------------------------------------------------------- */

export interface StepView {
  status: StepStatus;
  requestedAt: string | null;
  completedAt: string | null;
  attempts: number;
  /** Mensagem curta, segura de exibir. O corpo do fornecedor nunca sai daqui. */
  error: string | null;
  errorCode: ErrorCode | null;
}

/** Nunca chega a nenhuma rota publica: so a ficha do integrante, para o ADMIN. */
export interface VerificationView {
  status: VerificationStatus;
  updatedAt: string;
  steps: { cpf: StepView; tse: StepView };
  cadastro: CpfResult | null;
  eleitoral: TseResult | null;
  /**
   * Verdadeiro quando a etapa eleitoral ficou pulada mas ja existe tudo o que
   * ela precisa. Quem decide e o servidor: a tela apenas obedece.
   */
  canRetryTse: boolean;
}

/**
 * Decide se o ADMIN pode pedir a consulta eleitoral de um cadastro antigo.
 *
 * Exige consulta de CPF com sucesso, etapa eleitoral pulada e, no resultado
 * ja guardado, nome da mae e uma data de nascimento que sobreviva a
 * normalizacao (inclusive a legada, cortada).
 */
export function canRetryTse(
  cpfStatus: StepStatus,
  tseStatus: StepStatus,
  cadastro: CpfResult | null,
): boolean {
  if (cpfStatus !== 'SUCCESS' || tseStatus !== 'SKIPPED_MISSING_DATA') return false;
  if (!cadastro) return false;

  return Boolean((cadastro.nomeMae ?? '').trim()) && toBirthDate(cadastro.dataNascimento) !== null;
}
