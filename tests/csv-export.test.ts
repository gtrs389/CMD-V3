import { describe, expect, it } from 'vitest';
import type { Member, Recruiter } from '@/lib/types';
import {
  COLUNAS_EXPORTACAO,
  celula,
  linhaDoIntegrante,
  montarCsvDaEquipe,
  nomeDoArquivo,
} from '@/lib/domain/csv-export';
import { UNKNOWN_RECRUITER } from '@/lib/domain/recruitment';

/**
 * Exportacao da equipe do time em planilha.
 *
 * O que estes testes protegem: as TRES colunas pedidas, o texto de
 * "Cadastrado por" igual ao da tela, e um arquivo que o Excel abre em
 * colunas sem executar nada do que veio de um cadastro publico.
 */

function integrante(partes: Partial<Member> = {}): Member {
  return {
    id: 'm1',
    clientId: 'c1',
    name: 'Maria da Silva',
    phone: '82999990001',
    email: null,
    photo: null,
    gender: null,
    cpf: null,
    voterId: null,
    zone: null,
    section: null,
    state: null,
    city: null,
    district: null,
    street: null,
    relationshipOptionId: null,
    relationshipLabel: null,
    responses: [],
    consentAt: null,
    source: 'invite',
    recruitedBy: null,
    recruiterChange: null,
    access: 'ACTIVE',
    userId: null,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...partes,
  };
}

const recrutador = (partes: Partial<Recruiter> = {}): Recruiter => ({
  userId: 'u1',
  name: 'José Pereira',
  role: 'EQUIPE',
  photo: null,
  ...partes,
});

describe('planilha exportada da equipe', () => {
  it('tem exatamente as três colunas pedidas, nesta ordem', () => {
    expect([...COLUNAS_EXPORTACAO]).toEqual(['Nome', 'Telefone', 'Cadastrado por']);

    const [cabecalho] = montarCsvDaEquipe([integrante()]).split('\r\n');
    expect(cabecalho).toBe('"Nome";"Telefone";"Cadastrado por"');
  });

  it('uma linha por pessoa, na ordem em que a lista chega', () => {
    const csv = montarCsvDaEquipe([
      integrante({ id: 'm1', name: 'Maria da Silva' }),
      integrante({ id: 'm2', name: 'Ana Lima', phone: '82988887777' }),
    ]);

    const linhas = csv.split('\r\n');
    expect(linhas).toHaveLength(3);
    expect(linhas[1]).toContain('"Maria da Silva"');
    expect(linhas[2]).toContain('"Ana Lima"');
  });

  it('o telefone sai com máscara, como na tela', () => {
    expect(linhaDoIntegrante(integrante())[1]).toBe('(82) 99999-0001');
  });

  it('sem telefone, a célula fica vazia — e não com um tracinho', () => {
    expect(linhaDoIntegrante(integrante({ phone: '' }))[1]).toBe('');
  });

  it('"Cadastrado por" repete o texto da tela: nome e perfil', () => {
    expect(linhaDoIntegrante(integrante({ recruitedBy: recrutador() }))[2]).toBe(
      'José Pereira · Equipe',
    );

    expect(
      linhaDoIntegrante(
        integrante({ recruitedBy: recrutador({ name: 'Ana Costa', role: 'CANDIDATE' }) }),
      )[2],
    ).toBe('Ana Costa · Administração do time');
  });

  it('usuário excluído continua nomeado, com o aviso do acesso removido', () => {
    expect(linhaDoIntegrante(integrante({ recruitedBy: recrutador({ userId: null }) }))[2]).toBe(
      'José Pereira · Equipe (acesso removido)',
    );
  });

  it('cadastro sem origem conhecida não é atribuído a ninguém', () => {
    expect(linhaDoIntegrante(integrante({ recruitedBy: null }))[2]).toBe(UNKNOWN_RECRUITER);
  });

  it('aspas e ponto e vírgula dentro do nome não quebram a coluna', () => {
    expect(celula('Maria "Mara"; a costureira')).toBe('"Maria ""Mara""; a costureira"');
  });

  it('quebra de linha dentro do campo vira espaço: uma pessoa, uma linha', () => {
    const csv = montarCsvDaEquipe([integrante({ name: 'Maria\nda Silva' })]);
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('"Maria da Silva"');
  });

  it('nome que começa como fórmula chega à planilha como texto', () => {
    // Nome vindo do link público não passa por ninguém: "=CHAMAR(...)" não
    // pode virar fórmula na planilha de quem abrir o arquivo.
    expect(celula('=1+1')).toBe('"\'=1+1"');
    expect(celula('+55 nome')).toBe('"\'+55 nome"');
    expect(celula('@fulano')).toBe('"\'@fulano"');
    // Nome comum continua intocado.
    expect(celula('Maria da Silva')).toBe('"Maria da Silva"');
  });

  it('o arquivo leva o time e a data no nome', () => {
    expect(nomeDoArquivo('Maria Prefeita', new Date(2026, 8, 20))).toBe(
      'integrantes-maria-prefeita-2026-09-20.csv',
    );
    // Time sem nome utilizável não deixa o arquivo sem nome.
    expect(nomeDoArquivo('   ', new Date(2026, 8, 20))).toBe('integrantes-2026-09-20.csv');
  });

  it('lista vazia gera só o cabeçalho', () => {
    expect(montarCsvDaEquipe([])).toBe('"Nome";"Telefone";"Cadastrado por"');
  });
});
