import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCpfResult, parseTseResult, type ErrorCode } from '@/lib/domain/verification';
import { encryptJson } from '@/lib/server/crypto';
import type { MemberVerificationRow } from '@/lib/supabase/tables';

/**
 * Execucao da verificacao com banco e fornecedor simulados.
 *
 * Nenhuma chamada real e feita: o objetivo aqui e provar que cada consulta
 * acontece uma unica vez (cada uma e cobrada) e que a etapa eleitoral e
 * pulada quando faltam dados.
 */

const CADASTRO = {
  cpf: '12345678901',
  nome: 'Maria de Souza',
  sexo: 'F',
  idade: 34,
  obito: false,
  dataNascimento: '1991-04-12',
  nomeMae: 'Ana de Souza',
  nomePai: 'José de Souza',
  situacaoCadastral: 'REGULAR',
  dataSituacaoCadastral: '2020-01-15',
};

const TITULO = {
  status: 'REGULAR',
  identificacao: { eleitor: 'MARIA DE SOUZA', inscricao: '123456789012' },
  biometriaColetada: true,
  domicilioEleitoral: { uf: 'SP', zona: '005', secao: '0123' },
};

/** Estado do banco simulado, recriado a cada teste. */
const db: {
  member: Record<string, unknown>;
  verification: MemberVerificationRow | null;
  inserts: { table: string; value: Record<string, unknown> }[];
} = { member: {}, verification: null, inserts: [] };

vi.mock('@/lib/supabase/rest', () => ({
  selectOne: async (table: string) => {
    if (table === 'cmd_members') return db.member;
    if (table === 'cmd_member_verifications') return db.verification;
    return null;
  },
  insertOne: async (table: string, value: Record<string, unknown>) => {
    db.inserts.push({ table, value });
    if (table === 'cmd_member_verifications') {
      db.verification = { ...(base() as MemberVerificationRow), ...value } as MemberVerificationRow;
    }
    return { id: 'novo' };
  },
  updateRows: async (
    _table: string,
    filters: Record<string, string>,
    values: Record<string, unknown>,
  ) => {
    if (!db.verification) return [];

    // Bloqueio atomico: o filtro `or` so passa com o bloqueio livre.
    if (filters.or?.includes('lock_token.is.null') && db.verification.lock_token) return [];
    if (filters.status === 'eq.PENDING' && db.verification.status !== 'PENDING') return [];

    db.verification = { ...db.verification, ...values } as MemberVerificationRow;
    return [db.verification];
  },
  selectRows: async () => [],
  deleteRows: async () => [],
  inFilter: (values: string[]) => `in.(${values.join(',')})`,
}));

const consultCpf = vi.fn();
const consultTse = vi.fn();

vi.mock('@/lib/server/fontedata.service', () => {
  class FonteDataError extends Error {
    readonly code: ErrorCode;
    constructor(code: ErrorCode) {
      super(code);
      this.name = 'FonteDataError';
      this.code = code;
    }
  }
  return {
    FonteDataError,
    consultCpf: (...args: unknown[]) => consultCpf(...args),
    consultTse: (...args: unknown[]) => consultTse(...args),
  };
});

function base(): Partial<MemberVerificationRow> {
  return {
    id: 'ver-1',
    client_id: 'cli-1',
    member_id: 'mem-1',
    status: 'PENDING',
    cpf_status: 'PENDING',
    tse_status: 'PENDING',
    cpf_requested_at: null,
    cpf_completed_at: null,
    tse_requested_at: null,
    tse_completed_at: null,
    cpf_attempts: 0,
    tse_attempts: 0,
    cpf_error_code: null,
    tse_error_code: null,
    cpf_payload: null,
    tse_payload: null,
    locked_at: null,
    lock_token: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  };
}

const { runVerification, retryVerificationStep, getVerification } = await import(
  '@/lib/server/verification.service'
);

beforeEach(() => {
  vi.stubEnv('MEMBER_VERIFICATION_ENCRYPTION_KEY', Buffer.alloc(32, 3).toString('base64'));
  // O servico recebe do fornecedor ja no formato retido.
  consultCpf.mockReset().mockResolvedValue(parseCpfResult(CADASTRO));
  consultTse.mockReset().mockResolvedValue(parseTseResult(TITULO));
  db.member = { id: 'mem-1', client_id: 'cli-1', name: 'Maria', cpf: '12345678901' };
  db.verification = base() as MemberVerificationRow;
  db.inserts = [];
});

describe('execução da verificação', () => {
  it('consulta as duas etapas uma única vez e guarda cifrado', async () => {
    await runVerification('mem-1');

    expect(consultCpf).toHaveBeenCalledTimes(1);
    expect(consultTse).toHaveBeenCalledTimes(1);
    expect(db.verification?.status).toBe('COMPLETED');
    expect(db.verification?.cpf_status).toBe('SUCCESS');
    expect(db.verification?.tse_status).toBe('SUCCESS');

    // O conteudo guardado nunca aparece em claro.
    expect(db.verification?.cpf_payload).toBeTruthy();
    expect(db.verification?.cpf_payload).not.toContain('Maria');
    expect(db.verification?.tse_payload).not.toContain('REGULAR');

    // O bloqueio e devolvido no fim.
    expect(db.verification?.lock_token).toBeNull();
  });

  it('não repete sozinha: segunda execução não gera cobrança', async () => {
    await runVerification('mem-1');
    await runVerification('mem-1');
    await runVerification('mem-1');

    expect(consultCpf).toHaveBeenCalledTimes(1);
    expect(consultTse).toHaveBeenCalledTimes(1);
  });

  it('com o bloqueio em uso, nenhuma consulta acontece', async () => {
    db.verification = {
      ...(base() as MemberVerificationRow),
      lock_token: 'a'.repeat(32),
      locked_at: new Date().toISOString(),
    };

    await runVerification('mem-1');

    expect(consultCpf).not.toHaveBeenCalled();
    expect(consultTse).not.toHaveBeenCalled();
  });

  it('sem nome da mãe, a etapa eleitoral é pulada sem consulta', async () => {
    consultCpf.mockResolvedValue({ ...parseCpfResult(CADASTRO), nomeMae: null });

    await runVerification('mem-1');

    expect(consultCpf).toHaveBeenCalledTimes(1);
    expect(consultTse).not.toHaveBeenCalled();
    expect(db.verification?.tse_status).toBe('SKIPPED_MISSING_DATA');
    expect(db.verification?.status).toBe('PARTIAL');
  });

  it('sem CPF no cadastro, nenhuma das duas consultas acontece', async () => {
    db.member = { id: 'mem-1', client_id: 'cli-1', name: 'Maria', cpf: null };

    await runVerification('mem-1');

    expect(consultCpf).not.toHaveBeenCalled();
    expect(consultTse).not.toHaveBeenCalled();
    expect(db.verification?.cpf_status).toBe('SKIPPED_MISSING_DATA');
  });

  it('falha do fornecedor guarda apenas o código seguro', async () => {
    const { FonteDataError } = await import('@/lib/server/fontedata.service');
    consultCpf.mockRejectedValue(new FonteDataError('INVALID_KEY'));

    await runVerification('mem-1');

    expect(db.verification?.status).toBe('FAILED');
    expect(db.verification?.cpf_error_code).toBe('INVALID_KEY');
    expect(db.verification?.cpf_payload).toBeNull();
  });

  it('sem a chave de criptografia, nada é consultado', async () => {
    vi.stubEnv('MEMBER_VERIFICATION_ENCRYPTION_KEY', '');

    await runVerification('mem-1');

    expect(consultCpf).not.toHaveBeenCalled();
    expect(db.verification?.status).toBe('FAILED');
    expect(db.verification?.cpf_error_code).toBe('MISSING_CONFIG');
  });
});

describe('nova tentativa manual', () => {
  it('repete somente a etapa que falhou', async () => {
    const { FonteDataError } = await import('@/lib/server/fontedata.service');
    consultTse.mockRejectedValueOnce(new FonteDataError('PROVIDER_UNAVAILABLE'));

    await runVerification('mem-1');
    expect(db.verification?.tse_status).toBe('FAILED');
    expect(consultCpf).toHaveBeenCalledTimes(1);

    const view = await retryVerificationStep('mem-1', 'tse');

    // A etapa de CPF ja tinha sucesso: nao e consultada de novo (nao cobra).
    expect(consultCpf).toHaveBeenCalledTimes(1);
    expect(consultTse).toHaveBeenCalledTimes(2);
    expect(view.steps.tse.status).toBe('SUCCESS');
    expect(view.status).toBe('COMPLETED');
  });

  it('cadastro pulado: consulta só o TSE, reusando o CPF já guardado', async () => {
    // Primeira execucao ficou sem nome da mae: etapa eleitoral pulada.
    consultCpf.mockResolvedValueOnce({ ...parseCpfResult(CADASTRO), nomeMae: null });
    await runVerification('mem-1');

    expect(db.verification?.tse_status).toBe('SKIPPED_MISSING_DATA');
    expect(consultTse).not.toHaveBeenCalled();

    // O ADMIN pede a consulta eleitoral: o CPF guardado e decifrado e
    // reaproveitado, entao `cadastro-pf-plus` nao e chamado de novo.
    db.verification = {
      ...(db.verification as MemberVerificationRow),
      cpf_payload: encryptJson(parseCpfResult(CADASTRO)),
    };

    const view = await retryVerificationStep('mem-1', 'tse');

    expect(consultCpf).toHaveBeenCalledTimes(1);
    expect(consultTse).toHaveBeenCalledTimes(1);
    expect(consultTse).toHaveBeenCalledWith({
      cpf: '12345678901',
      nomeMae: 'Ana de Souza',
      dataNascimento: '12/04/1991',
    });

    expect(view.steps.tse.status).toBe('SUCCESS');
    expect(view.status).toBe('COMPLETED');
    expect(db.verification?.tse_completed_at).toBeTruthy();
    expect(db.verification?.tse_payload).toBeTruthy();
    expect(db.verification?.tse_payload).not.toContain('REGULAR');
  });

  it('etapa com sucesso não é repetida', async () => {
    await runVerification('mem-1');
    await retryVerificationStep('mem-1', 'cpf');

    expect(consultCpf).toHaveBeenCalledTimes(1);
  });
});

describe('leitura pelo ADMIN', () => {
  it('devolve os dados decifrados e registra a auditoria sem o conteúdo', async () => {
    await runVerification('mem-1');
    db.inserts = [];

    const view = await getVerification('mem-1', 'user-1');

    expect(view?.cadastro?.nome).toBe('Maria de Souza');
    expect(view?.eleitoral?.inscricao).toBe('123456789012');

    const auditoria = db.inserts.find(
      (entry) => entry.table === 'cmd_member_verification_views',
    );
    expect(auditoria?.value).toEqual({
      client_id: 'cli-1',
      member_id: 'mem-1',
      user_id: 'user-1',
    });
    expect(JSON.stringify(auditoria?.value)).not.toContain('Maria');
  });
});
