import 'server-only';
import { tseInputFrom, type CpfResult, type TseResult } from '@/lib/domain/verification';
import { normalizeCpf } from '@/lib/utils/documents';
import { consultCpf, consultTse, FonteDataError } from './fontedata.service';
import { decryptJson, encryptJson, hasEncryptionKey } from './crypto';

/**
 * Confirmacao de CPF e titulo de eleitor, em tempo real, durante o
 * preenchimento do link publico.
 *
 * A pessoa nunca ve que uma consulta aconteceu: falha aqui nunca aparece na
 * tela, so deixa de corrigir o nome ou de preencher zona/secao sozinha. O
 * cadastro nunca depende do fornecedor.
 *
 * O resultado de cada consulta sai cifrado, num token opaco que o navegador
 * apenas guarda e devolve — primeiro para a proxima etapa (titulo precisa do
 * nome da mae e da data de nascimento que a consulta de CPF devolveu), depois
 * no envio final, para a verificacao cadastral aproveitar sem consultar de
 * novo (cada consulta e cobrada).
 */

interface CpfToken {
  cpf: string;
  result: CpfResult;
}

interface TseToken {
  cpf: string;
  result: TseResult;
}

export interface CpfLookupOutcome {
  /** Nome como o fornecedor devolveu. Nulo quando a consulta nao deu certo. */
  nome: string | null;
  /** Token cifrado, para devolver na confirmacao do titulo e no envio final. */
  token: string | null;
}

/** Consulta o CPF confirmado. Nunca lanca: falha vira resultado vazio. */
export async function lookupCpfForInvite(rawCpf: string): Promise<CpfLookupOutcome> {
  if (!hasEncryptionKey()) {
    // So no log do servidor: a pessoa nunca ve isso, mas sem isto nao ha como
    // descobrir por que o formulario nao corrigiu nada sozinho.
    console.error('[cmd] Consulta de CPF pulada: MEMBER_VERIFICATION_ENCRYPTION_KEY ausente.');
    return { nome: null, token: null };
  }

  // Normalizado aqui: precisa bater, digito a digito, com o CPF que o
  // integrante vai gravar no final, para o envio poder aproveitar o token.
  const cpf = normalizeCpf(rawCpf);

  try {
    const result = await consultCpf(cpf);
    const token: CpfToken = { cpf, result };
    return { nome: result.nome, token: encryptJson(token) };
  } catch (error) {
    const code = error instanceof FonteDataError ? error.code : 'UNEXPECTED';
    console.error('[cmd] Falha na consulta de CPF do formulário público:', code);
    return { nome: null, token: null };
  }
}

export interface TseLookupOutcome {
  zona: string | null;
  secao: string | null;
  /** Token cifrado, para o envio final aproveitar sem consultar de novo. */
  token: string | null;
}

/**
 * Consulta a situacao eleitoral, a partir do token de CPF ja confirmado.
 *
 * Sem token, sem nome da mae ou sem data de nascimento no resultado do CPF,
 * a etapa e pulada sem nenhuma cobranca: os campos ficam para a pessoa
 * preencher a mao.
 */
export async function lookupTseForInvite(cpfToken: string | null): Promise<TseLookupOutcome> {
  const empty: TseLookupOutcome = { zona: null, secao: null, token: null };

  if (!cpfToken) {
    console.error('[cmd] Consulta eleitoral pulada: CPF não foi confirmado com sucesso antes.');
    return empty;
  }
  if (!hasEncryptionKey()) {
    console.error('[cmd] Consulta eleitoral pulada: MEMBER_VERIFICATION_ENCRYPTION_KEY ausente.');
    return empty;
  }

  const decoded = decryptJson<CpfToken>(cpfToken);
  if (!decoded) {
    console.error('[cmd] Consulta eleitoral pulada: token de CPF inválido ou expirado.');
    return empty;
  }

  const input = tseInputFrom(decoded.cpf, decoded.result);
  if (!input) {
    // Esperado: nem todo CPF devolve nome da mae e data de nascimento.
    console.error('[cmd] Consulta eleitoral pulada: CPF sem nome da mãe/nascimento para o TSE.');
    return empty;
  }

  try {
    const result = await consultTse(input);
    const token: TseToken = { cpf: decoded.cpf, result };
    return { zona: result.zona, secao: result.secao, token: encryptJson(token) };
  } catch (error) {
    const code = error instanceof FonteDataError ? error.code : 'UNEXPECTED';
    console.error('[cmd] Falha na consulta eleitoral do formulário público:', code);
    return empty;
  }
}
