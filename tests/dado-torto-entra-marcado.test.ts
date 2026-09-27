import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  avisoDeConferencia,
  avisoDoCampo,
  dadosParaConferir,
  precisaConferir,
  problemaDoCpf,
  problemaDoTelefone,
  problemaDoTitulo,
} from '@/lib/domain/conferencia';
import {
  memberCreateSchema,
  publicSubmissionSchema,
  surveyMemberSchema,
} from '@/lib/validation/server.schema';
import { digitosDoTelefone } from '@/lib/utils/phone';

/**
 * Dado torto nao barra o cadastro — entra marcado.
 *
 * CPF que nao fecha, titulo com digito a menos, telefone pela metade ou com
 * digito a mais: a pessoa entra, seja Lider ou Equipe, e a ficha nasce com a
 * etiqueta "Conferir" dizendo exatamente o que. Estes testes prendem as duas
 * metades da regra: o servidor ACEITA, e a etiqueta DIZ.
 */

const CPF_VALIDO = '52998224725';
const CPF_QUE_NAO_FECHA = '52998224700';
const TITULO_VALIDO = '100000002720';

describe('o que precisa ser conferido', () => {
  it('CPF: incompleto, que não fecha, e o certo', () => {
    expect(problemaDoCpf('529982247')).toBe('CPF com 9 dígitos');
    expect(problemaDoCpf(CPF_QUE_NAO_FECHA)).toBe('CPF não confere');
    expect(problemaDoCpf('529.982.247-25')).toBeNull();
    // Vazio e FALTA, nao "conferir": e outra etiqueta.
    expect(problemaDoCpf('')).toBeNull();
    expect(problemaDoCpf(null)).toBeNull();
  });

  it('título: dígito a menos, que não fecha, e o certo', () => {
    expect(problemaDoTitulo('1000000027')).toBe('título com 10 dígitos');
    expect(problemaDoTitulo('100000002721')).toBe('título não confere');
    expect(problemaDoTitulo(TITULO_VALIDO)).toBeNull();
  });

  it('telefone: curto, longo, e o certo', () => {
    expect(problemaDoTelefone('829999')).toBe('telefone com 6 dígitos');
    expect(problemaDoTelefone('829999493112')).toBe('telefone com 12 dígitos');
    expect(problemaDoTelefone('(82) 99999-0001')).toBeNull();
    expect(problemaDoTelefone('1')).toBe('telefone com 1 dígito');
  });

  it('junta tudo o que a ficha tem para conferir, na ordem do cadastro', () => {
    const ficha = {
      phone: '8299',
      cpf: CPF_QUE_NAO_FECHA,
      voterId: '1000',
      zone: '10',
      section: '',
    };
    expect(dadosParaConferir(ficha)).toEqual([
      'telefone com 4 dígitos',
      'CPF não confere',
      'título com 4 dígitos',
      'zona sem seção',
    ]);
    expect(precisaConferir(ficha)).toBe(true);
    expect(avisoDeConferencia(ficha)).toBe(
      'Conferir: telefone com 4 dígitos, CPF não confere, título com 4 dígitos, zona sem seção.',
    );
  });

  it('telefone de outra pessoa do time também é para conferir', () => {
    expect(dadosParaConferir({ phone: '82999990001', access: 'DUPLICATE_PHONE' })).toEqual([
      'telefone repetido no time',
    ]);
  });

  it('ficha certa não tem etiqueta', () => {
    const certa = { phone: '82999990001', cpf: CPF_VALIDO, voterId: TITULO_VALIDO, zone: '10', section: '147' };
    expect(precisaConferir(certa)).toBe(false);
    expect(avisoDeConferencia(certa)).toBe('');
  });
});

describe('o aviso enquanto se preenche', () => {
  it('diz o que está errado e que pode enviar assim mesmo', () => {
    const aviso = avisoDoCampo('cpf', CPF_QUE_NAO_FECHA);
    expect(aviso).toContain('CPF não confere');
    expect(aviso).toContain('Pode enviar assim mesmo');
  });

  it('não diz nada do campo certo, vazio ou que não tem regra', () => {
    expect(avisoDoCampo('cpf', CPF_VALIDO)).toBeNull();
    expect(avisoDoCampo('cpf', '')).toBeNull();
    expect(avisoDoCampo('name', 'qualquer')).toBeNull();
  });
});

describe('o servidor aceita — em todo caminho de cadastro', () => {
  const tortos = {
    name: 'Ana Lima',
    phone: '8299',
    cpf: '529.982.247',
    voterId: '1000 0000 27',
    zone: '10',
    section: '147',
    district: 'Q',
  };

  it('cadastro pelo painel', () => {
    const resultado = memberCreateSchema.safeParse({
      ...tortos,
      clientId: '11111111-1111-4111-8111-111111111111',
    });
    expect(resultado.success).toBe(true);
    // Chega so com digitos, pronto para gravar como veio.
    expect(resultado.data?.cpf).toBe('529982247');
    expect(resultado.data?.voterId).toBe('1000000027');
  });

  it('link público', () => {
    expect(publicSubmissionSchema.safeParse({ ...tortos, cpf: CPF_QUE_NAO_FECHA }).success).toBe(true);
  });

  it('Formulário 2 e planilha', () => {
    expect(surveyMemberSchema.safeParse({ ...tortos, phone: '829999493112' }).success).toBe(true);
  });

  it('continua recusando o que não é dado nenhum', () => {
    // Sem nome ninguem sabe quem e a pessoa: o banco exige.
    expect(memberCreateSchema.safeParse({ ...tortos, name: '', clientId: '11111111-1111-4111-8111-111111111111' }).success).toBe(false);
    // Telefone so com letras nao e telefone.
    expect(publicSubmissionSchema.safeParse({ ...tortos, phone: 'sem número' }).success).toBe(false);
  });
});

describe('telefone guardado como veio', () => {
  it('dígito a mais fica — cortado, ligaria para outra pessoa', () => {
    expect(digitosDoTelefone('829999493112')).toBe('829999493112');
  });

  it('código do país não é dígito a mais', () => {
    expect(digitosDoTelefone('+55 82 99999-0001')).toBe('82999990001');
  });
});

describe('migration 047', () => {
  const sql = readFileSync('supabase/migrations/047_dado_torto_entra_marcado.sql', 'utf8');
  const codigo = sql
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('--'))
    .join('\n');

  it('roda em uma transação e não apaga dado', () => {
    expect(codigo).toMatch(/^begin;$/m);
    expect(codigo).toMatch(/^commit;$/m);
    expect(codigo).not.toMatch(/\b(drop table|drop column|delete from|truncate)\b/i);
  });

  it('aceita CPF e título de qualquer tamanho, só com dígitos', () => {
    expect(codigo).toContain("cpf ~ '^[0-9]{1,14}$'");
    expect(codigo).toContain("voter_id ~ '^[0-9]{1,14}$'");
  });

  it('o repetido entra: o índice comum nasce antes de o único sair', () => {
    const comum = codigo.indexOf('create index if not exists cmd_members_client_cpf_idx');
    const unico = codigo.indexOf('drop index if exists public.cmd_members_client_cpf_uniq');
    expect(comum).toBeGreaterThan(-1);
    expect(unico).toBeGreaterThan(comum);
  });
});
