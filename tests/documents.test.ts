import { describe, expect, it } from 'vitest';
import {
  GENDER_OPTIONS,
  UF_OPTIONS,
  formatCpf,
  formatVoterId,
  genderLabel,
  isGenderValue,
  isValidCpf,
  isValidState,
  isValidVoterId,
  maskCpf,
  maskVoterId,
  normalizeCpf,
  normalizePlace,
  normalizeState,
  normalizeVoterId,
} from '@/lib/utils/documents';
import {
  canDeleteField,
  canDisableField,
  canDuplicateField,
  createSystemFields,
  hasFixedOptions,
  isLockedRequired,
} from '@/lib/domain/form-config';

/**
 * A validação é local e confere apenas formato e dígitos verificadores.
 * Nenhum destes números pertence a uma pessoa real: são combinações válidas
 * apenas do ponto de vista aritmético.
 */

const CPF_VALIDOS = ['52998224725', '11144477735', '01234567890'];
const TITULOS_VALIDOS = ['100000000124', '100000000221', '100000000329', '100000002623'];

describe('CPF', () => {
  it('aceita números com dígitos verificadores corretos', () => {
    for (const cpf of CPF_VALIDOS) {
      expect(isValidCpf(cpf)).toBe(true);
    }
  });

  it('aceita o mesmo número com máscara', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(isValidCpf('52998224726')).toBe(false);
    expect(isValidCpf('11144477730')).toBe(false);
  });

  it('recusa sequências repetidas', () => {
    for (const digito of '0123456789') {
      expect(isValidCpf(digito.repeat(11))).toBe(false);
    }
  });

  it('recusa tamanho diferente de 11', () => {
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('')).toBe(false);
  });

  it('guarda somente números e exibe com máscara', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
    expect(normalizeCpf('529982247259999')).toBe('52998224725');
    expect(maskCpf('52998224725')).toBe('529.982.247-25');
    expect(maskCpf('529982')).toBe('529.982');
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
  });
});

describe('título de eleitor', () => {
  it('aceita números com dígitos verificadores corretos', () => {
    for (const titulo of TITULOS_VALIDOS) {
      expect(isValidVoterId(titulo)).toBe(true);
    }
  });

  it('aceita o mesmo número com máscara', () => {
    expect(isValidVoterId('1000 0000 0124')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(isValidVoterId('100000000125')).toBe(false);
  });

  it('recusa código de UF fora da faixa', () => {
    expect(isValidVoterId('100000009924')).toBe(false);
    expect(isValidVoterId('100000000024')).toBe(false);
  });

  it('recusa tamanho diferente de 12 e sequências repetidas', () => {
    expect(isValidVoterId('10000000012')).toBe(false);
    expect(isValidVoterId('111111111111')).toBe(false);
    expect(isValidVoterId('')).toBe(false);
  });

  it('guarda 12 números e exibe com máscara', () => {
    expect(normalizeVoterId('1000 0000 0124')).toBe('100000000124');
    expect(maskVoterId('100000000124')).toBe('1000 0000 0124');
    expect(formatVoterId('100000000124')).toBe('1000 0000 0124');
  });
});

describe('estado', () => {
  it('tem as 27 unidades da federação', () => {
    expect(UF_OPTIONS).toHaveLength(27);
    expect(new Set(UF_OPTIONS.map((uf) => uf.id)).size).toBe(27);
  });

  it('salva a sigla em maiúsculas', () => {
    expect(normalizeState('sp')).toBe('SP');
    expect(normalizeState(' rj ')).toBe('RJ');
    expect(isValidState('mg')).toBe(true);
  });

  it('recusa sigla inexistente', () => {
    expect(normalizeState('XX')).toBe('');
    expect(isValidState('BRASIL')).toBe(false);
  });
});

describe('município e bairro', () => {
  it('normaliza espaços e apara as bordas', () => {
    expect(normalizePlace('  São   José  dos Campos ')).toBe('São José dos Campos');
    expect(normalizePlace('\tCentro\n')).toBe('Centro');
  });

  it('respeita o limite de tamanho', () => {
    expect(normalizePlace('a'.repeat(200))).toHaveLength(120);
  });
});

describe('gênero', () => {
  it('oferece as quatro opções previstas', () => {
    expect(GENDER_OPTIONS.map((opcao) => opcao.label)).toEqual([
      'Homem',
      'Mulher',
      'Outro',
      'Prefiro não informar',
    ]);
  });

  it('reconhece apenas os códigos válidos', () => {
    expect(isGenderValue('HOMEM')).toBe(true);
    expect(isGenderValue('QUALQUER')).toBe(false);
  });

  it('traduz o código para exibição', () => {
    expect(genderLabel('NAO_INFORMAR')).toBe('Prefiro não informar');
    expect(genderLabel(null)).toBeNull();
  });
});

describe('campos padrão do formulário', () => {
  it('cria os doze campos padrão, todos visíveis', () => {
    const fields = createSystemFields();

    expect(fields.map((field) => field.systemKey)).toEqual([
      'photo',
      'name',
      'email',
      'phone',
      'gender',
      'cpf',
      'voter_id',
      'state',
      'city',
      'district',
      'street',
      'relationship',
    ]);
    expect(fields.every((field) => field.enabled)).toBe(true);
  });

  it('deixa os oito campos novos opcionais por padrão', () => {
    const novos = createSystemFields().filter(
      (field) => !['photo', 'name', 'email', 'phone'].includes(field.systemKey ?? ''),
    );

    expect(novos).toHaveLength(8);
    expect(novos.every((field) => field.required === false)).toBe(true);
  });

  it('mantém o e-mail ativo e obrigatório: é o que cria o acesso', () => {
    const email = createSystemFields().find((field) => field.systemKey === 'email');

    expect(email).toBeDefined();
    expect(email?.type).toBe('email');
    expect(email?.required).toBe(true);
    expect(email?.enabled).toBe(true);
    // Nao pode ser excluido, desativado nem virar opcional.
    expect(canDeleteField(email!)).toBe(false);
    expect(canDisableField(email!)).toBe(false);
    expect(isLockedRequired(email!)).toBe(true);
  });

  it('impede excluir e duplicar campo padrão, mas permite desativar', () => {
    for (const field of createSystemFields()) {
      expect(canDeleteField(field)).toBe(false);
      expect(canDuplicateField(field)).toBe(false);
    }

    const novos = createSystemFields().filter((field) =>
      ['gender', 'cpf', 'voter_id', 'state', 'city', 'district', 'street'].includes(
        field.systemKey ?? '',
      ),
    );
    expect(novos.every((field) => canDisableField(field))).toBe(true);
    expect(novos.every((field) => !isLockedRequired(field))).toBe(true);
  });

  it('marca gênero e estado como lista fixa do sistema', () => {
    const porChave = new Map(createSystemFields().map((field) => [field.systemKey, field]));

    expect(hasFixedOptions(porChave.get('gender')!)).toBe(true);
    expect(hasFixedOptions(porChave.get('state')!)).toBe(true);
    expect(hasFixedOptions(porChave.get('city')!)).toBe(false);
  });
});
