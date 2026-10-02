import { describe, expect, it } from 'vitest';
import type { Member, Recruiter } from '@/lib/types';
import { registroParaPdf } from '@/lib/domain/repetidos-pdf';
import {
  cadastrosIncompletos,
  cadastrosRepetidos,
  chaveDoNome,
  diagnosticar,
  doResponsavel,
  municipioDaOperacao,
  problemasDasFichas,
  telefonesCompartilhados,
} from '@/lib/domain/inconsistencias';

/**
 * Quadro de inconsistencias do time.
 *
 * O que estes testes protegem: a mesma pessoa e achada mesmo escrita de
 * outro jeito; homonimo aparece como POSSIVEL, e nao como erro; telefone de
 * familia nao vira cadastro repetido; e a nota de saude so conta o que e
 * erro de verdade.
 */

const JOAO: Recruiter = { userId: 'u-joao', name: 'João Silva', role: 'EQUIPE', tier: 'LIDER', photo: null };
const BRUNA: Recruiter = { userId: 'u-bruna', name: 'Bruna Costa', role: 'EQUIPE', tier: 'LIDER', photo: null };
const MARINA: Recruiter = { userId: 'u-marina', name: 'Marina Alves', role: 'CANDIDATE', photo: null };

let sequencia = 0;

/** Ficha completa e valida, de Palmeira dos Indios. */
function pessoa(partes: Partial<Member> = {}): Member {
  sequencia += 1;
  return {
    id: `m-${sequencia}`,
    clientId: 'time-1',
    name: `Pessoa Número ${sequencia}`,
    phone: `829999${String(sequencia).padStart(5, '0')}`,
    email: null,
    photo: null,
    gender: null,
    cpf: null,
    voterId: null,
    zone: '10',
    section: String(100 + sequencia),
    state: 'AL',
    city: 'Palmeira dos Índios',
    district: 'Centro',
    street: 'Rua A',
    relationshipOptionId: null,
    relationshipLabel: null,
    responses: [],
    consentAt: null,
    source: 'invite',
    recruitedBy: JOAO,
    tier: 'EQUIPE',
    tag: null,
    recruiterChange: null,
    access: 'NO_PHONE',
    userId: null,
    createdAt: `2026-09-${String(10 + (sequencia % 15)).padStart(2, '0')}T12:00:00.000Z`,
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...partes,
  };
}

const PALMEIRA = municipioDaOperacao({});

describe('nome comparável', () => {
  it('ignora acento, caixa, pontuação e conectivo', () => {
    expect(chaveDoNome('José  da Silva')).toBe(chaveDoNome('JOSE SILVA'));
    expect(chaveDoNome('Maria das Dores')).toBe('maria dores');
  });

  it('um nome só não é evidência de nada', () => {
    expect(chaveDoNome('Maria')).toBe('');
    expect(chaveDoNome('')).toBe('');
  });
});

describe('cadastros repetidos', () => {
  it('mesmo título é a mesma pessoa, com certeza — mesmo com nome diferente', () => {
    const a = pessoa({ name: 'Ana Lima', voterId: '100000002720' });
    const b = pessoa({ name: 'Ana Beatriz Lima', voterId: '1000 0000 2720', recruitedBy: BRUNA });

    const [grupo] = cadastrosRepetidos([a, b]);
    expect(grupo.certeza).toBe('certa');
    expect(grupo.evidencias).toContain('titulo');
    // Dois Lideres contam a mesma pessoa no ranking.
    expect(grupo.responsaveis).toHaveLength(2);
  });

  it('mesmo nome e telefone, escrito de outro jeito, é repetido', () => {
    const a = pessoa({ name: 'José da Silva', phone: '82999990001' });
    const b = pessoa({ name: 'JOSE SILVA', phone: '(82) 99999-0001' });

    const grupos = cadastrosRepetidos([a, b]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].evidencias[0]).toBe('nome-telefone');
  });

  it('o registro mais antigo é marcado como o primeiro', () => {
    const novo = pessoa({ name: 'Carla Souza', createdAt: '2026-09-20T10:00:00.000Z', phone: '82911112222' });
    const antigo = pessoa({ name: 'Carla Souza', createdAt: '2026-09-02T10:00:00.000Z', phone: '82911112222' });

    const [grupo] = cadastrosRepetidos([novo, antigo]);
    expect(grupo.registros[0].member.id).toBe(antigo.id);
    expect(grupo.registros[0].primeiro).toBe(true);
    expect(grupo.registros[1].primeiro).toBe(false);
  });

  it('homônimo sem mais nada em comum é só possível', () => {
    const a = pessoa({ name: 'Maria Silva' });
    const b = pessoa({ name: 'Maria Silva' });

    const [grupo] = cadastrosRepetidos([a, b]);
    expect(grupo.certeza).toBe('possivel');
    expect(grupo.evidencias).toEqual(['nome']);
  });

  it('a união é transitiva: A↔B pelo título e B↔C pelo nome e telefone', () => {
    const a = pessoa({ name: 'Rita Alves', voterId: '100000002720' });
    const b = pessoa({ name: 'Rita de Alves', voterId: '100000002720', phone: '82933334444' });
    const c = pessoa({ name: 'RITA ALVES', phone: '82933334444' });

    const grupos = cadastrosRepetidos([a, b, c]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].registros).toHaveLength(3);
  });

  it('aponta onde os registros discordam — só entre campos preenchidos', () => {
    const a = pessoa({ name: 'Paulo Reis', voterId: '100000002720', district: 'Centro', phone: '' });
    const b = pessoa({ name: 'Paulo Reis', voterId: '100000002720', district: 'Xucurus' });

    const [grupo] = cadastrosRepetidos([a, b]);
    expect(grupo.divergencias).toContain('bairro');
    // Um lado sem telefone nao "discorda": so esta incompleto.
    expect(grupo.divergencias).not.toContain('telefone');
  });

  it('3 com o mesmo título e 1 só com o mesmo nome: grupo certo de 3, e o quarto à parte como possível', () => {
    const titulo = '012345678901';
    const mila = pessoa({ name: 'MARIA APARECIDA DA SILVA', voterId: titulo, zone: '10', section: '127', createdAt: '2026-09-30T14:18:01.000Z' });
    const adalberto = pessoa({ name: 'MARIA APARECIDA DA SILVA', voterId: titulo, zone: '10', section: '127', phone: '', createdAt: '2026-09-30T14:18:02.000Z' });
    const carlos = pessoa({ name: 'MARIA APARECIDA DA SILVA', voterId: '098765432109', zone: '10', section: '138', phone: '', createdAt: '2026-09-30T14:18:03.000Z' });
    const guruba = pessoa({ name: 'MARIA APARECIDA DA SILVA', voterId: titulo, zone: '10', section: '127', phone: '', createdAt: '2026-09-30T14:18:04.000Z' });

    const grupos = cadastrosRepetidos([mila, adalberto, carlos, guruba]);
    expect(grupos).toHaveLength(2);

    const [certo, possivel] = grupos;
    expect(certo.certeza).toBe('certa');
    expect(certo.registros.map((r) => r.member.id)).toEqual([mila.id, adalberto.id, guruba.id]);
    // O homonimo nao suja o grupo certo: nada de "discordam em titulo".
    expect(certo.divergencias).not.toContain('título');

    expect(possivel.certeza).toBe('possivel');
    expect(possivel.evidencias).toEqual(['nome']);
    // Ao lado do ORIGINAL do grupo certo, para comparar — e so ele.
    expect(possivel.registros.map((r) => r.member.id)).toEqual([mila.id, carlos.id]);

    // Nas contas, sobram 2 copias (as do titulo); o homonimo nao e copia.
    const d = diagnosticar([mila, adalberto, carlos, guruba], PALMEIRA);
    expect(d.excedentes).toBe(2);
  });

  it('mesmo nome e seção entre cadastros sem título em comum: provável, separado do grupo certo', () => {
    const a = pessoa({ name: 'Joana Lima', voterId: '100000002720', zone: '10', section: '50' });
    const b = pessoa({ name: 'Joana Lima', voterId: '100000002720', zone: '10', section: '50' });
    const c = pessoa({ name: 'Joana Lima', voterId: null, zone: '10', section: '50' });

    const grupos = cadastrosRepetidos([a, b, c]);
    expect(grupos.map((g) => [g.certeza, g.registros.length])).toEqual([
      ['certa', 2],
      ['provavel', 2],
    ]);
  });

  it('gente diferente não vira grupo', () => {
    expect(cadastrosRepetidos([pessoa(), pessoa(), pessoa()])).toEqual([]);
  });

  it('aguenta uma equipe grande sem comparar cada um com cada um', () => {
    const muitos = Array.from({ length: 5000 }, () => pessoa());
    const inicio = performance.now();
    cadastrosRepetidos(muitos);
    expect(performance.now() - inicio).toBeLessThan(1000);
  });
});

describe('telefone compartilhado', () => {
  it('pessoas diferentes com o mesmo número aparecem, como aviso', () => {
    const marido = pessoa({ name: 'Carlos Dias', phone: '82955556666' });
    const esposa = pessoa({ name: 'Joana Dias', phone: '82955556666' });

    const [compartilhado] = telefonesCompartilhados([marido, esposa]);
    expect(compartilhado.membros).toHaveLength(2);
  });

  it('a mesma pessoa repetida não conta como telefone compartilhado', () => {
    const a = pessoa({ name: 'Carlos Dias', phone: '82955556666' });
    const b = pessoa({ name: 'Carlos Dias', phone: '82955556666' });

    const repetidos = cadastrosRepetidos([a, b]);
    expect(telefonesCompartilhados([a, b], repetidos)).toEqual([]);
  });
});

describe('problemas de cada ficha', () => {
  it('título e telefone que não fecham', () => {
    const ficha = pessoa({ voterId: '123456789012', phone: '829999' });
    const [problema] = problemasDasFichas([ficha], PALMEIRA).filter((p) => p.tipo === 'invalido');
    expect(problema.detalhe).toContain('título não confere');
    expect(problema.detalhe).toContain('telefone com 6 dígitos');
  });

  it('endereço fora de Palmeira dos Índios', () => {
    const ficha = pessoa({ city: 'Maceió' });
    const problemas = problemasDasFichas([ficha], PALMEIRA).filter((p) => p.tipo === 'fora-do-municipio');
    expect(problemas[0].detalhe).toBe('Maceió/AL');
  });

  it('o município do time manda, quando ele tem um', () => {
    const arapiraca = municipioDaOperacao({ stateUf: 'AL', cities: ['Arapiraca'] });
    const ficha = pessoa({ city: 'Arapiraca' });
    expect(problemasDasFichas([ficha], arapiraca).some((p) => p.tipo === 'fora-do-municipio')).toBe(false);
  });

  it('Líder sem acesso ao painel', () => {
    const lider = pessoa({ tier: 'LIDER', recruitedBy: MARINA, access: 'DUPLICATE_PHONE' });
    const [problema] = problemasDasFichas([lider], PALMEIRA).filter((p) => p.tipo === 'lider-sem-acesso');
    expect(problema.detalhe).toBe('telefone repetido no time');
  });

  it('a Equipe não precisa de acesso, e o Time DEMO não dá acesso a ninguém', () => {
    const equipe = pessoa({ tier: 'EQUIPE', access: 'NO_PHONE' });
    const demo = pessoa({ tier: 'LIDER', recruitedBy: MARINA, access: 'DEMO_NO_ACCESS' });
    expect(problemasDasFichas([equipe, demo], PALMEIRA).some((p) => p.tipo === 'lider-sem-acesso')).toBe(false);
  });

  it('no PDF dos repetidos, o Líder desativado sai com a etiqueta — e só o Líder', () => {
    expect(registroParaPdf(pessoa({ tier: 'LIDER', access: 'DISABLED' }), true).nivel).toBe('Líder desativado');
    expect(registroParaPdf(pessoa({ tier: 'LIDER', access: 'ACTIVE' }), true).nivel).toBe('Líder');
    expect(registroParaPdf(pessoa({ tier: 'EQUIPE', access: 'DISABLED' }), false).nivel).toBe('Equipe');
  });

  it('Líder desativado pelo ADMIN é decisão, e não inconsistência', () => {
    const desativado = pessoa({ tier: 'LIDER', recruitedBy: MARINA, access: 'DISABLED' });
    expect(problemasDasFichas([desativado], PALMEIRA).some((p) => p.tipo === 'lider-sem-acesso')).toBe(false);
  });

  it('origem: terceiro nível, responsável removido e sem origem', () => {
    const terceiro = pessoa({ recruitedBy: { ...JOAO, tier: 'EQUIPE' } });
    const orfao = pessoa({ recruitedBy: { ...JOAO, userId: null } });
    const antigo = pessoa({ recruitedBy: null });

    const tipos = problemasDasFichas([terceiro, orfao, antigo], PALMEIRA).map((p) => p.tipo);
    expect(tipos).toContain('terceiro-nivel');
    expect(tipos).toContain('responsavel-removido');
    expect(tipos).toContain('sem-origem');
  });
});

describe('cadastros incompletos', () => {
  it('conta o que mais falta e quem mais deixa faltar', () => {
    const incompletos = cadastrosIncompletos([
      pessoa({ voterId: null }),
      pessoa({ voterId: null, street: '' }),
      pessoa({ voterId: '100000002720', recruitedBy: BRUNA }),
    ]);

    expect(incompletos.porCampo[0]).toEqual({ campo: 'título de eleitor', quantidade: 2 });
    expect(incompletos.porResponsavel[0]).toMatchObject({
      responsavel: 'João Silva · Líder',
      incompletos: 2,
      percentual: 100,
    });
    // Quem nao deixou nada faltando nao aparece na lista de responsaveis.
    expect(incompletos.porResponsavel.some((l) => l.responsavel.startsWith('Bruna'))).toBe(false);
  });
});

describe('diagnóstico e saúde', () => {
  it('equipe sem problema tem saúde 100', () => {
    const limpos = [pessoa({ voterId: '100000002720' }), pessoa({ voterId: '100000012720' })];
    // Titulos precisam ser validos para nao contarem como invalidos.
    const validos = limpos.filter((m) => problemasDasFichas([m], PALMEIRA).length === 0);
    const d = diagnosticar(validos, PALMEIRA);
    expect(d.saude).toBe(100);
    expect(d.pessoasComProblema).toBe(0);
  });

  it('o original de um repetido não conta como problema; a cópia sim', () => {
    const a = pessoa({ name: 'Ana Lima', phone: '82911110000', voterId: null, createdAt: '2026-09-01T00:00:00.000Z' });
    const b = pessoa({ name: 'Ana Lima', phone: '82911110000', voterId: null, createdAt: '2026-09-05T00:00:00.000Z' });

    const d = diagnosticar([a, b], PALMEIRA);
    expect(d.excedentes).toBe(1);
  });

  it('homônimo possível não derruba a nota', () => {
    const a = pessoa({ name: 'Maria Silva', voterId: null });
    const b = pessoa({ name: 'Maria Silva', voterId: null });
    const semRepeticao = diagnosticar([pessoa({ voterId: null }), pessoa({ voterId: null })], PALMEIRA);
    const comHomonimo = diagnosticar([a, b], PALMEIRA);
    expect(comHomonimo.saude).toBe(semRepeticao.saude);
    expect(comHomonimo.excedentes).toBe(0);
  });

  it('o filtro por responsável olha cada cadastro', () => {
    const a = pessoa({ recruitedBy: JOAO });
    expect(doResponsavel(a, null)).toBe(true);
    expect(doResponsavel(a, 'u-joao')).toBe(true);
    expect(doResponsavel(a, 'u-bruna')).toBe(false);
  });
});

describe('verificações desligadas no time', () => {
  it('telefone incompleto desligado: some do quadro e da nota; o resto continua', () => {
    const curto = pessoa({ phone: '8299' });
    const semBairro = pessoa({ district: null });
    const tudoCerto = pessoa();

    // A ficha de teste nao tem titulo: "sem título" fica desligado nos dois.
    const ligado = diagnosticar([curto, semBairro, tudoCerto], PALMEIRA, ['sem-titulo']);
    expect(ligado.problemas.some((p) => p.member.id === curto.id)).toBe(true);

    const desligado = diagnosticar([curto, semBairro, tudoCerto], PALMEIRA, ['sem-titulo', 'telefone-incompleto']);
    expect(desligado.problemas.some((p) => p.member.id === curto.id)).toBe(false);
    // Sem bairro continua sendo apontado.
    expect(desligado.incompletos.membros.map((i) => i.member.id)).toEqual([semBairro.id]);
    expect(desligado.pessoasComProblema).toBe(1);
  });

  it('desligar uma falta tira só aquele campo; quem tem outra falta continua', () => {
    const duas = pessoa({ phone: '', district: null });
    const d = diagnosticar([duas], PALMEIRA, ['sem-telefone', 'sem-titulo']);
    expect(d.incompletos.membros[0].faltas).toEqual(['bairro']);
  });

  it('telefone que não confere continua quando só o incompleto é desligado', () => {
    const sobrando = pessoa({ phone: '829999999999' });
    const d = diagnosticar([sobrando], PALMEIRA, ['telefone-incompleto']);
    expect(d.problemas.some((p) => p.tipo === 'invalido')).toBe(true);
  });

  it('repetidos e possíveis desligam separados', () => {
    const a = pessoa({ name: 'Rita Alves', voterId: '100000002720' });
    const b = pessoa({ name: 'Rita Alves', voterId: '100000002720' });
    const c = pessoa({ name: 'Rita Alves', section: '999' });
    expect(diagnosticar([a, b, c], PALMEIRA, ['possivel-repetido']).repetidos.map((g) => g.certeza)).toEqual(['certa']);
    expect(diagnosticar([a, b, c], PALMEIRA, ['repetido']).repetidos.map((g) => g.certeza)).toEqual(['possivel']);
  });
});

