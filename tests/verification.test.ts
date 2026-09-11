import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canRetryTse,
  compareGender,
  compareValues,
  overallStatus,
  parseCpfResult,
  parseTseResult,
  toBirthDate,
  tseInputFrom,
} from '@/lib/domain/verification';
import { canonicalConfirmationText, CONFIRMATION_VERSION } from '@/lib/domain/confirmation';
import { can, permissionsOf } from '@/lib/permissions';
import { decryptJson, encryptJson, hasEncryptionKey } from '@/lib/server/crypto';
import { consultCpf, consultTse, FonteDataError } from '@/lib/server/fontedata.service';

/**
 * Respostas simuladas das duas APIs da FonteData.
 * Nenhum teste acessa a internet nem consome saldo.
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
  // Tudo abaixo e excessivo para a finalidade e nao pode ser retido.
  emails: [{ email: 'maria@exemplo.com' }],
  telefones: [{ numero: '11999999999' }],
  enderecos: [{ logradouro: 'Rua A', numero: '10' }],
  parentescos: [{ nome: 'Ana de Souza', vinculo: 'MAE' }],
  rendaEstimada: 4200,
  classeSocial: 'B2',
  cbo: '2521-05',
  perfilDomiciliar: { pessoas: 3 },
};

const TITULO = {
  status: 'REGULAR',
  identificacao: { eleitor: 'MARIA DE SOUZA', inscricao: '123456789012' },
  biometriaColetada: true,
  domicilioEleitoral: {
    uf: 'SP',
    zona: '005',
    secao: '0123',
    local: 'ESCOLA MUNICIPAL',
    logradouro: 'RUA DAS FLORES',
    numero: '100',
    bairro: 'CENTRO',
    municipio: 'SAO PAULO',
    proximaEleicao: '2026',
  },
};

const CHAVE_API = 'chave-fontedata-simulada';
const CHAVE_CIFRA = Buffer.alloc(32, 7).toString('base64');

describe('dados retidos da consulta de CPF', () => {
  it('guarda somente os campos da finalidade', () => {
    const result = parseCpfResult(CADASTRO);

    expect(result).toEqual({
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
    });

    const serializado = JSON.stringify(result);
    for (const excessivo of ['maria@exemplo.com', '11999999999', 'Rua A', 'B2', '2521-05']) {
      expect(serializado).not.toContain(excessivo);
    }
    expect(serializado).not.toMatch(/renda|classe|perfilDomiciliar|parentesco/i);
  });

  it('campos ausentes ou nulos não quebram a leitura', () => {
    expect(parseCpfResult({ cpf: null, nome: '', idade: null })).toEqual({
      cpf: null,
      nome: null,
      sexo: null,
      idade: null,
      obito: null,
      dataNascimento: null,
      nomeMae: null,
      nomePai: null,
      situacaoCadastral: null,
      dataSituacaoCadastral: null,
    });
    expect(parseTseResult(null).status).toBeNull();
    expect(parseTseResult({ status: 'REGULAR', domicilioEleitoral: null }).zona).toBeNull();
  });
});

describe('consulta eleitoral', () => {
  it('guarda identificação, biometria e domicílio', () => {
    expect(parseTseResult(TITULO)).toEqual({
      status: 'REGULAR',
      eleitor: 'MARIA DE SOUZA',
      inscricao: '123456789012',
      biometriaColetada: true,
      uf: 'SP',
      zona: '005',
      secao: '0123',
      local: 'ESCOLA MUNICIPAL',
      logradouro: 'RUA DAS FLORES',
      numero: '100',
      bairro: 'CENTRO',
      municipio: 'SAO PAULO',
      proximaEleicao: '2026',
    });
  });

  it('normaliza a data de nascimento em todos os formatos aceitos', () => {
    expect(toBirthDate('10/12/2003')).toBe('10/12/2003');
    expect(toBirthDate('2003-12-10')).toBe('10/12/2003');
    expect(toBirthDate('2003-12-10T00:00:00.000Z')).toBe('10/12/2003');
    expect(toBirthDate('2003-12-10 00:00:00')).toBe('10/12/2003');
    expect(toBirthDate('  2003-12-10  ')).toBe('10/12/2003');

    // Formato brasileiro com horario, como a consulta de CPF costuma devolver.
    expect(toBirthDate('01/06/2003 00:00:00')).toBe('01/06/2003');
    expect(toBirthDate('01/06/2003 12:30')).toBe('01/06/2003');

    // Valor legado, cortado quando o campo ainda tinha 20 caracteres.
    expect(toBirthDate('2003-12-10T00:00:00.')).toBe('10/12/2003');

    expect(toBirthDate(null)).toBeNull();
    expect(toBirthDate('')).toBeNull();
    expect(toBirthDate('10-12-2003')).toBeNull();
    expect(toBirthDate('2003-13-10')).toBeNull();
    expect(toBirthDate('2003-02-30')).toBeNull();
    expect(toBirthDate('0000-00-00T00:00:00.')).toBeNull();

    // Texto solto depois da data continua recusado.
    expect(toBirthDate('01/06/2003 invalido')).toBeNull();
    expect(toBirthDate('01/06/2003xx')).toBeNull();
    expect(toBirthDate('31/02/2003 00:00:00')).toBeNull();
  });

  it('libera a consulta eleitoral de cadastro antigo com data truncada', () => {
    const legado = parseCpfResult({
      ...CADASTRO,
      nomeMae: 'Marta Ferreira',
      dataNascimento: '2003-12-10T00:00:00.',
    });

    expect(canRetryTse('SUCCESS', 'SKIPPED_MISSING_DATA', legado)).toBe(true);
    expect(tseInputFrom('12345678901', legado)).toEqual({
      cpf: '12345678901',
      nomeMae: 'Marta Ferreira',
      dataNascimento: '10/12/2003',
    });

    // Sem os requisitos, a acao continua indisponivel.
    expect(canRetryTse('SUCCESS', 'SKIPPED_MISSING_DATA', { ...legado, nomeMae: null })).toBe(false);
    expect(
      canRetryTse('SUCCESS', 'SKIPPED_MISSING_DATA', { ...legado, dataNascimento: 'sem data' }),
    ).toBe(false);
    expect(canRetryTse('FAILED', 'SKIPPED_MISSING_DATA', legado)).toBe(false);
    expect(canRetryTse('SUCCESS', 'SUCCESS', legado)).toBe(false);
    expect(canRetryTse('SUCCESS', 'SKIPPED_MISSING_DATA', null)).toBe(false);
  });

  it('usa nome da mãe e nascimento vindos da consulta de CPF', () => {
    // O formulario do membro nao participa: so o CPF digitado e reaproveitado.
    const doCpf = parseCpfResult({
      ...CADASTRO,
      nomeMae: '  Marta Ferreira  ',
      dataNascimento: '2003-12-10T00:00:00.000Z',
    });

    expect(tseInputFrom('123.456.789-01', doCpf)).toEqual({
      cpf: '12345678901',
      nomeMae: 'Marta Ferreira',
      dataNascimento: '10/12/2003',
    });
  });

  it('sem nome da mãe ou nascimento, não há consulta ao TSE', () => {
    const completo = parseCpfResult(CADASTRO);
    expect(tseInputFrom('12345678901', completo)).toEqual({
      cpf: '12345678901',
      nomeMae: 'Ana de Souza',
      dataNascimento: '12/04/1991',
    });

    expect(tseInputFrom('12345678901', { ...completo, nomeMae: null })).toBeNull();
    expect(tseInputFrom('12345678901', { ...completo, nomeMae: '   ' })).toBeNull();
    expect(tseInputFrom('12345678901', { ...completo, dataNascimento: null })).toBeNull();
    expect(tseInputFrom('12345678901', { ...completo, dataNascimento: '10-12-2003' })).toBeNull();
    expect(tseInputFrom(null, completo)).toBeNull();
  });

  it('etapa pulada deixa a verificação parcial, nunca completa', () => {
    expect(overallStatus('SUCCESS', 'SKIPPED_MISSING_DATA')).toBe('PARTIAL');
    expect(overallStatus('SUCCESS', 'SUCCESS')).toBe('COMPLETED');
    expect(overallStatus('FAILED', 'SKIPPED_MISSING_DATA')).toBe('FAILED');
    expect(overallStatus('SUCCESS', 'FAILED')).toBe('PARTIAL');
    expect(overallStatus('PENDING', 'PENDING')).toBe('RUNNING');
  });
});

describe('chamadas ao fornecedor', () => {
  beforeEach(() => vi.stubEnv('FONTEDATA_API_KEY', CHAVE_API));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function stub(handler: (url: string, init: RequestInit) => unknown) {
    const calls: [string, RequestInit][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push([url, init]);
        return handler(url, init);
      }),
    );
    return calls;
  }

  it('monta as duas URLs e envia a chave no cabeçalho', async () => {
    const calls = stub((url) => ({
      ok: true,
      json: async () => (url.includes('cadastro-pf-plus') ? CADASTRO : TITULO),
    }));

    await consultCpf('123.456.789-01');
    await consultTse({ cpf: '12345678901', nomeMae: 'Ana de Souza', dataNascimento: '12/04/1991' });
    await consultTse({ cpf: '12345678901', nomeMae: 'Marta Ferreira', dataNascimento: '10/12/2003' });

    expect(calls[0][0]).toBe(
      'https://app.fontedata.com/api/v1/consulta/cadastro-pf-plus?cpf=12345678901',
    );
    expect(calls[1][0]).toBe(
      'https://app.fontedata.com/api/v1/consulta/tse-titulo?cpf=12345678901&nome_mae=Ana+de+Souza&data_nascimento=12%2F04%2F1991',
    );

    // Codificacao exigida no contrato: espaco vira "+" e a barra vira %2F.
    expect(calls[2][0]).toContain('nome_mae=Marta+Ferreira');
    expect(calls[2][0]).toContain('data_nascimento=10%2F12%2F2003');

    for (const [, init] of calls) {
      expect(init.headers).toMatchObject({ 'X-API-Key': CHAVE_API, Accept: 'application/json' });
      expect(init.cache).toBe('no-store');
    }
  });

  it('traduz os códigos HTTP em erros seguros', async () => {
    const esperado: [number, string][] = [
      [400, 'BAD_REQUEST'],
      [401, 'INVALID_KEY'],
      [403, 'NO_ACCESS'],
      [404, 'NOT_FOUND'],
      [408, 'TIMEOUT'],
      [500, 'PROVIDER_UNAVAILABLE'],
      [503, 'PROVIDER_UNAVAILABLE'],
    ];

    for (const [status, code] of esperado) {
      stub(() => ({ ok: false, status, json: async () => ({ detalhe: 'interno' }) }));
      const erro = await consultCpf('12345678901').catch((cause: FonteDataError) => cause);

      expect(erro).toBeInstanceOf(FonteDataError);
      expect((erro as FonteDataError).code).toBe(code);
      // O corpo do fornecedor nunca sai daqui.
      expect(String(erro)).not.toContain('interno');
      expect(String(erro)).not.toContain(CHAVE_API);
    }
  });

  it('sem a variável, nenhuma consulta é feita', async () => {
    const calls = stub(() => ({ ok: true, json: async () => CADASTRO }));
    vi.stubEnv('FONTEDATA_API_KEY', '');

    const erro = await consultCpf('12345678901').catch((cause: FonteDataError) => cause);

    expect((erro as FonteDataError).code).toBe('MISSING_CONFIG');
    expect(calls).toHaveLength(0);
  });
});

describe('criptografia dos resultados', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('guarda cifrado e lê de volta com a chave correta', () => {
    vi.stubEnv('MEMBER_VERIFICATION_ENCRYPTION_KEY', CHAVE_CIFRA);
    const result = parseCpfResult(CADASTRO);

    const cifrado = encryptJson(result);

    expect(cifrado).not.toContain('Maria');
    expect(cifrado).not.toContain('12345678901');
    expect(decryptJson(cifrado)).toEqual(result);
    // Cada cifra usa um vetor novo: o mesmo dado nunca gera o mesmo texto.
    expect(encryptJson(result)).not.toBe(cifrado);
  });

  it('chave trocada ou conteúdo adulterado não devolvem dado nenhum', () => {
    vi.stubEnv('MEMBER_VERIFICATION_ENCRYPTION_KEY', CHAVE_CIFRA);
    const cifrado = encryptJson({ nome: 'Maria' });

    vi.stubEnv('MEMBER_VERIFICATION_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'));
    expect(decryptJson(cifrado)).toBeNull();
    expect(decryptJson(`${cifrado.slice(0, -4)}AAAA`)).toBeNull();
  });

  it('sem a chave, falha segura: nada é cifrado nem lido', () => {
    vi.stubEnv('MEMBER_VERIFICATION_ENCRYPTION_KEY', '');
    expect(hasEncryptionKey()).toBe(false);
    expect(() => encryptJson({ nome: 'Maria' })).toThrow();
    expect(decryptJson('qualquer-coisa')).toBeNull();

    // Chave com tamanho errado tambem e recusada.
    vi.stubEnv('MEMBER_VERIFICATION_ENCRYPTION_KEY', Buffer.alloc(16, 1).toString('base64'));
    expect(hasEncryptionKey()).toBe(false);
  });
});

describe('acesso aos resultados', () => {
  it('somente o ADMIN lê ou repete a verificação', () => {
    expect(can({ role: 'ADMIN' }, 'verification.view')).toBe(true);
    expect(can({ role: 'ADMIN' }, 'verification.retry')).toBe(true);

    expect(can({ role: 'EQUIPE' }, 'verification.view')).toBe(false);
    expect(can({ role: 'EQUIPE' }, 'verification.retry')).toBe(false);

    // Visitante do link publico tambem nao alcanca nada disso.
    expect(can(null, 'verification.view')).toBe(false);
    // A EQUIPE entra no painel, mas nunca alcanca verificacao cadastral.
    expect(permissionsOf('EQUIPE')).not.toContain('verification.view');
    expect(permissionsOf('EQUIPE')).not.toContain('verification.retry');
  });

  it('a rota pública devolve apenas a confirmação do envio', async () => {
    const rota = await import('@/app/api/public/convite/[token]/membros/route');
    const fonte = (rota.POST as { toString(): string }).toString();

    // Nenhuma leitura de verificacao acontece na rota publica.
    expect(fonte).not.toMatch(/getVerification|cpf_payload|tse_payload|cadastro-pf-plus/);
  });
});

describe('confirmação final', () => {
  it('o texto registrado carrega a versão e o aviso mostrado', () => {
    const texto = canonicalConfirmationText();

    expect(texto).toContain(CONFIRMATION_VERSION);
    expect(texto).toContain(
      'Confira atentamente seus dados. Após a confirmação, você não poderá alterá-los por este link.',
    );
  });
});

describe('comparação entre declarado e consultado', () => {
  it('ignora acento e caixa, e nunca altera o declarado', () => {
    expect(compareValues('João da Silva', 'JOAO DA SILVA')).toBe('MATCH');
    expect(compareValues('João da Silva', 'Maria Silva')).toBe('DIFFERENT');
    expect(compareValues('João da Silva', null)).toBe('UNKNOWN');
    expect(compareGender('HOMEM', 'M')).toBe('MATCH');
    expect(compareGender('MULHER', 'M')).toBe('DIFFERENT');
    expect(compareGender('NAO_INFORMAR', 'F')).toBe('UNKNOWN');
  });
});
