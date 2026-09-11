import 'server-only';
import { randomBytes } from 'node:crypto';
import {
  canRetryTse,
  ERROR_LABELS,
  overallStatus,
  tseInputFrom,
  type CpfResult,
  type ErrorCode,
  type StepStatus,
  type StepView,
  type TseResult,
  type VerificationStep,
  type VerificationView,
} from '@/lib/domain/verification';
import { canonicalConfirmationText, CONFIRMATION_VERSION } from '@/lib/domain/confirmation';
import { TABLES, type MemberRow, type MemberVerificationRow } from '@/lib/supabase/tables';
import { insertOne, selectOne, updateRows } from '@/lib/supabase/rest';
import { privacyHash } from './consent';
import { decryptJson, encryptJson, hasEncryptionKey } from './crypto';
import { consultCpf, consultTse, FonteDataError } from './fontedata.service';
import { createPendingLocation, invalidateLocation, resolveLocation } from './map-location.service';
import { notFound } from './http';

/**
 * Verificacao cadastral do integrante.
 *
 * Regras que valem em todo este arquivo:
 *   - o cadastro do integrante nunca depende do fornecedor;
 *   - cada consulta e cobrada, entao nada repete sozinho;
 *   - uma linha por integrante e um bloqueio atomico impedem consultas
 *     simultaneas ou duplicadas;
 *   - resultado nenhum sai daqui sem cifra, e nada disso vai para log.
 */

type StepColumns = {
  status: 'cpf_status' | 'tse_status';
  requested: 'cpf_requested_at' | 'tse_requested_at';
  completed: 'cpf_completed_at' | 'tse_completed_at';
  attempts: 'cpf_attempts' | 'tse_attempts';
  error: 'cpf_error_code' | 'tse_error_code';
  payload: 'cpf_payload' | 'tse_payload';
};

const COLUMNS: Record<VerificationStep, StepColumns> = {
  cpf: {
    status: 'cpf_status',
    requested: 'cpf_requested_at',
    completed: 'cpf_completed_at',
    attempts: 'cpf_attempts',
    error: 'cpf_error_code',
    payload: 'cpf_payload',
  },
  tse: {
    status: 'tse_status',
    requested: 'tse_requested_at',
    completed: 'tse_completed_at',
    attempts: 'tse_attempts',
    error: 'tse_error_code',
    payload: 'tse_payload',
  },
};

function stepView(row: MemberVerificationRow, step: VerificationStep): StepView {
  const columns = COLUMNS[step];
  const code = row[columns.error] as ErrorCode | null;

  return {
    status: row[columns.status],
    requestedAt: row[columns.requested],
    completedAt: row[columns.completed],
    attempts: row[columns.attempts],
    error: code ? (ERROR_LABELS[code] ?? ERROR_LABELS.UNEXPECTED) : null,
    errorCode: code,
  };
}

function toView(row: MemberVerificationRow): VerificationView {
  const cadastro = decryptJson<CpfResult>(row.cpf_payload);

  return {
    status: row.status,
    updatedAt: row.updated_at,
    steps: { cpf: stepView(row, 'cpf'), tse: stepView(row, 'tse') },
    cadastro,
    eleitoral: decryptJson<TseResult>(row.tse_payload),
    // Calculado aqui, sobre o resultado ja decifrado: o navegador nao
    // reinterpreta nada para decidir se a acao aparece.
    canRetryTse: canRetryTse(row.cpf_status, row.tse_status, cadastro),
  };
}

async function findRow(memberId: string): Promise<MemberVerificationRow | null> {
  return selectOne<MemberVerificationRow>(TABLES.memberVerifications, {
    select: '*',
    filters: { member_id: `eq.${memberId}` },
  });
}

async function requireMember(memberId: string): Promise<MemberRow> {
  const row = await selectOne<MemberRow>(TABLES.members, {
    select: 'id,client_id,name,cpf,gender,state,city,district',
    filters: { id: `eq.${memberId}` },
  });
  if (!row) throw notFound('Integrante não encontrado.');
  return row;
}

/* -------------------------------------------------------------------------
   Confirmacao final
   ------------------------------------------------------------------------- */

/**
 * Grava a prova da confirmacao: versao, texto integral e data/hora do
 * servidor. Um horario vindo do navegador nao serve como prova.
 */
export async function recordConfirmation(clientId: string, memberId: string): Promise<void> {
  const text = canonicalConfirmationText();

  await insertOne(
    TABLES.memberConfirmations,
    {
      client_id: clientId,
      member_id: memberId,
      notice_version: CONFIRMATION_VERSION,
      notice_text: text,
      notice_hash: privacyHash(text),
      confirmed_at: new Date().toISOString(),
    },
    'id',
  ).catch(() => undefined); // Reenvio do mesmo integrante nao duplica a prova.
}

/* -------------------------------------------------------------------------
   Ciclo de vida da verificacao
   ------------------------------------------------------------------------- */

/** Cria a verificacao como PENDING. Idempotente: um integrante, uma linha. */
export async function createPendingVerification(
  clientId: string,
  memberId: string,
): Promise<void> {
  const existing = await findRow(memberId);
  if (existing) return;

  await insertOne(
    TABLES.memberVerifications,
    { client_id: clientId, member_id: memberId, status: 'PENDING' },
    'id',
  ).catch(() => undefined); // Corrida entre duas chamadas: a unicidade decide.
}

/**
 * Bloqueio atomico.
 *
 * A condicao `lock_token is null` viaja no proprio UPDATE: duas execucoes
 * simultaneas nunca passam as duas, e nenhuma consulta e cobrada em dobro.
 * Um bloqueio antigo (execucao interrompida) e liberado depois de 5 minutos.
 */
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

async function acquireLock(memberId: string): Promise<MemberVerificationRow | null> {
  const token = randomBytes(16).toString('hex');
  const now = new Date();
  const stale = new Date(now.getTime() - LOCK_TIMEOUT_MS).toISOString();

  const [locked] = await updateRows<MemberVerificationRow>(
    TABLES.memberVerifications,
    { member_id: `eq.${memberId}`, or: `(lock_token.is.null,locked_at.lt.${stale})` },
    { lock_token: token, locked_at: now.toISOString(), status: 'RUNNING' },
  );

  return locked ?? null;
}

async function releaseLock(
  memberId: string,
  patch: Record<string, string | number | null>,
): Promise<void> {
  await updateRows(
    TABLES.memberVerifications,
    { member_id: `eq.${memberId}` },
    { ...patch, lock_token: null, locked_at: null },
    'id',
  );
}

function errorCodeOf(error: unknown): ErrorCode {
  return error instanceof FonteDataError ? error.code : 'UNEXPECTED';
}

interface StepOutcome {
  status: StepStatus;
  patch: Record<string, string | number | null>;
}

/** Executa uma etapa e devolve o que deve ser gravado. Nunca lanca. */
async function runStep<T>(
  step: VerificationStep,
  attempts: number,
  consult: () => Promise<T>,
): Promise<StepOutcome> {
  const columns = COLUMNS[step];
  const startedAt = new Date().toISOString();

  try {
    const result = await consult();
    return {
      status: 'SUCCESS',
      patch: {
        [columns.status]: 'SUCCESS',
        [columns.requested]: startedAt,
        [columns.completed]: new Date().toISOString(),
        [columns.attempts]: attempts + 1,
        [columns.error]: null,
        [columns.payload]: encryptJson(result),
      },
    };
  } catch (error) {
    return {
      status: 'FAILED',
      patch: {
        [columns.status]: 'FAILED',
        [columns.requested]: startedAt,
        [columns.completed]: new Date().toISOString(),
        [columns.attempts]: attempts + 1,
        [columns.error]: errorCodeOf(error),
        [columns.payload]: null,
      },
    };
  }
}

function skipped(step: VerificationStep, attempts: number): StepOutcome {
  const columns = COLUMNS[step];
  return {
    status: 'SKIPPED_MISSING_DATA',
    patch: {
      [columns.status]: 'SKIPPED_MISSING_DATA',
      [columns.completed]: new Date().toISOString(),
      [columns.attempts]: attempts,
      [columns.error]: null,
      [columns.payload]: null,
    },
  };
}

/**
 * Executa a verificacao pendente de um integrante.
 *
 * Chamada pelo servidor depois da confirmacao, com `after()`. Sai calada
 * quando ja houve execucao (idempotencia) ou quando outra esta em curso.
 */
export async function runVerification(memberId: string): Promise<void> {
  if (!hasEncryptionKey()) {
    // Sem chave nada e consultado: guardar resultado em claro nao e opcao.
    await updateRows(
      TABLES.memberVerifications,
      { member_id: `eq.${memberId}`, status: `eq.PENDING` },
      { status: 'FAILED', cpf_status: 'FAILED', cpf_error_code: 'MISSING_CONFIG' },
      'id',
    );
    return;
  }

  const current = await findRow(memberId);
  if (!current || current.status === 'COMPLETED' || current.status === 'RUNNING') return;
  if (current.cpf_status !== 'PENDING' && current.tse_status !== 'PENDING') return;

  const locked = await acquireLock(memberId);
  if (!locked) return;

  await execute(memberId, locked, { cpf: true, tse: true });
}

/**
 * Repeticao manual de uma etapa, pedida pelo ADMIN.
 *
 * Nunca acontece sozinha: cada tentativa pode gerar cobranca. Pedir a etapa
 * eleitoral reusa a consulta de CPF ja guardada (decifrada aqui) e chama
 * somente `tse-titulo`: `cadastro-pf-plus` nao e consultado nem cobrado de novo.
 */
export async function retryVerificationStep(
  memberId: string,
  step: VerificationStep,
): Promise<VerificationView> {
  const current = await findRow(memberId);
  if (!current) throw notFound('Verificação não encontrada.');

  const columns = COLUMNS[step];
  if (current[columns.status] === 'SUCCESS') return toView(current);

  const locked = await acquireLock(memberId);
  if (!locked) return toView(current);

  await execute(memberId, locked, { cpf: step === 'cpf', tse: true });

  const updated = await findRow(memberId);
  return updated ? toView(updated) : toView(current);
}

/**
 * Corpo da execucao, ja com o bloqueio em maos.
 *
 * A consulta eleitoral so acontece depois de o CPF devolver nome da mae e
 * data de nascimento; sem isso a etapa fica `SKIPPED_MISSING_DATA` e nenhuma
 * chamada e feita (nenhuma cobranca).
 */
async function execute(
  memberId: string,
  row: MemberVerificationRow,
  run: { cpf: boolean; tse: boolean },
): Promise<void> {
  const member = await requireMember(memberId);
  const patch: Record<string, string | number | null> = {};

  let cpfStatus: StepStatus = row.cpf_status;
  let cadastro = decryptJson<CpfResult>(row.cpf_payload);

  if (run.cpf) {
    if (!member.cpf) {
      const outcome = skipped('cpf', row.cpf_attempts);
      Object.assign(patch, outcome.patch);
      cpfStatus = outcome.status;
      cadastro = null;
    } else {
      const outcome = await runStep('cpf', row.cpf_attempts, async () => {
        const result = await consultCpf(member.cpf as string);
        cadastro = result;
        return result;
      });
      Object.assign(patch, outcome.patch);
      cpfStatus = outcome.status;
      if (outcome.status === 'FAILED') cadastro = null;
    }
  }

  let tseStatus: StepStatus = row.tse_status;

  if (run.tse) {
    const input = cadastro ? tseInputFrom(member.cpf, cadastro) : null;

    if (!input) {
      const outcome = skipped('tse', row.tse_attempts);
      Object.assign(patch, outcome.patch);
      tseStatus = outcome.status;
    } else {
      const outcome = await runStep('tse', row.tse_attempts, () => consultTse(input));
      Object.assign(patch, outcome.patch);
      tseStatus = outcome.status;
    }
  }

  patch.status = overallStatus(cpfStatus, tseStatus);
  await releaseLock(memberId, patch);

  // Local de votacao: o vinculo nasce aqui e e resolvido em seguida. Uma nova
  // consulta eleitoral invalida so este tipo; a moradia segue como estava.
  if (tseStatus === 'SUCCESS') {
    await createPendingLocation(member.client_id, memberId, 'POLLING_PLACE').catch(() => undefined);
    await invalidateLocation(member.client_id, memberId, 'POLLING_PLACE').catch(() => undefined);
    await resolveLocation(memberId, 'POLLING_PLACE').catch(() => undefined);
  }
}

/* -------------------------------------------------------------------------
   Verificacao ja resolvida no formulario publico
   ------------------------------------------------------------------------- */

interface CpfToken {
  cpf: string;
  result: CpfResult;
}

interface TseToken {
  cpf: string;
  result: TseResult;
}

export interface SeedOutcome {
  /** Verdadeiro quando a linha foi gravada a partir dos tokens do formulario. */
  seeded: boolean;
  /** Verdadeiro quando a etapa eleitoral tambem veio resolvida. */
  tseSucceeded: boolean;
}

const EMPTY_SEED: SeedOutcome = { seeded: false, tseSucceeded: false };

/**
 * Grava a verificacao a partir do que ja foi confirmado durante o
 * preenchimento do link publico, sem consultar o fornecedor de novo: a
 * consulta ja aconteceu (e ja foi cobrada) no proprio formulario, antes do
 * envio.
 *
 * O token do CPF so vale se o CPF que ele carrega for exatamente o CPF
 * gravado no integrante: qualquer token de outro CPF, ou qualquer coisa que
 * nao decifre, e tratado como ausente. Sem um token de CPF valido, nada e
 * gravado aqui e a verificacao cai no fluxo de sempre — PENDING seguido de
 * `runVerification` depois do cadastro.
 */
export async function seedVerificationFromForm(
  clientId: string,
  memberId: string,
  memberCpf: string | null,
  tokens: { cpfToken?: string | null; tseToken?: string | null },
): Promise<SeedOutcome> {
  if (!hasEncryptionKey()) return EMPTY_SEED;

  const cpfData = tokens.cpfToken ? decryptJson<CpfToken>(tokens.cpfToken) : null;
  if (!cpfData || cpfData.cpf !== (memberCpf ?? '')) return EMPTY_SEED;

  const tseData = tokens.tseToken ? decryptJson<TseToken>(tokens.tseToken) : null;
  const tse = tseData && tseData.cpf === cpfData.cpf ? tseData : null;

  const now = new Date().toISOString();
  const patch: Record<string, string | number | null> = {
    cpf_status: 'SUCCESS',
    cpf_requested_at: now,
    cpf_completed_at: now,
    cpf_attempts: 1,
    cpf_error_code: null,
    cpf_payload: encryptJson(cpfData.result),
  };

  if (tse) {
    patch.tse_status = 'SUCCESS';
    patch.tse_requested_at = now;
    patch.tse_completed_at = now;
    patch.tse_attempts = 1;
    patch.tse_error_code = null;
    patch.tse_payload = encryptJson(tse.result);
  } else {
    // Titulo nao confirmado no formulario: fica pulada, mas retentavel pelo
    // ADMIN (mesma regra de `canRetryTse`), nunca reconsultada sozinha.
    patch.tse_status = 'SKIPPED_MISSING_DATA';
    patch.tse_completed_at = now;
    patch.tse_attempts = 0;
  }

  patch.status = overallStatus(patch.cpf_status as StepStatus, patch.tse_status as StepStatus);

  await insertOne(
    TABLES.memberVerifications,
    { client_id: clientId, member_id: memberId, ...patch },
    'id',
  ).catch(() => undefined);

  return { seeded: true, tseSucceeded: Boolean(tse) };
}

/* -------------------------------------------------------------------------
   Leitura pelo ADMIN
   ------------------------------------------------------------------------- */

/** Resultado para a ficha do integrante. Registra a consulta em auditoria. */
export async function getVerification(
  memberId: string,
  viewerId: string,
): Promise<VerificationView | null> {
  const row = await findRow(memberId);
  if (!row) return null;

  // Auditoria: quem abriu e quando. O conteudo visto nunca e registrado.
  await insertOne(
    TABLES.memberVerificationViews,
    { client_id: row.client_id, member_id: memberId, user_id: viewerId },
    'id',
  ).catch(() => undefined);

  return toView(row);
}
