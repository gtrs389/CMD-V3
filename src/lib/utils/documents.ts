/**
 * Documentos e localidades brasileiras.
 *
 * Tudo aqui e calculo local: nenhuma consulta a servico externo. A validacao
 * confere apenas o formato e os digitos verificadores, o que nao confirma que
 * o documento exista de fato.
 */

/** Codigos de genero. O rotulo exibido vem de `GENDER_OPTIONS`. */
export const GENDER_VALUES = ['HOMEM', 'MULHER', 'OUTRO', 'NAO_INFORMAR'] as const;
export type GenderValue = (typeof GENDER_VALUES)[number];

export const GENDER_OPTIONS: ReadonlyArray<{ id: GenderValue; label: string }> = [
  { id: 'HOMEM', label: 'Homem' },
  { id: 'MULHER', label: 'Mulher' },
  { id: 'OUTRO', label: 'Outro' },
  { id: 'NAO_INFORMAR', label: 'Prefiro não informar' },
];

export function isGenderValue(value: string): value is GenderValue {
  return (GENDER_VALUES as readonly string[]).includes(value);
}

export function genderLabel(value: string | null): string | null {
  if (!value) return null;
  return GENDER_OPTIONS.find((option) => option.id === value)?.label ?? value;
}

/** As 27 unidades da federacao. */
export const UF_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'AC', label: 'AC - Acre' },
  { id: 'AL', label: 'AL - Alagoas' },
  { id: 'AP', label: 'AP - Amapá' },
  { id: 'AM', label: 'AM - Amazonas' },
  { id: 'BA', label: 'BA - Bahia' },
  { id: 'CE', label: 'CE - Ceará' },
  { id: 'DF', label: 'DF - Distrito Federal' },
  { id: 'ES', label: 'ES - Espírito Santo' },
  { id: 'GO', label: 'GO - Goiás' },
  { id: 'MA', label: 'MA - Maranhão' },
  { id: 'MT', label: 'MT - Mato Grosso' },
  { id: 'MS', label: 'MS - Mato Grosso do Sul' },
  { id: 'MG', label: 'MG - Minas Gerais' },
  { id: 'PA', label: 'PA - Pará' },
  { id: 'PB', label: 'PB - Paraíba' },
  { id: 'PR', label: 'PR - Paraná' },
  { id: 'PE', label: 'PE - Pernambuco' },
  { id: 'PI', label: 'PI - Piauí' },
  { id: 'RJ', label: 'RJ - Rio de Janeiro' },
  { id: 'RN', label: 'RN - Rio Grande do Norte' },
  { id: 'RS', label: 'RS - Rio Grande do Sul' },
  { id: 'RO', label: 'RO - Rondônia' },
  { id: 'RR', label: 'RR - Roraima' },
  { id: 'SC', label: 'SC - Santa Catarina' },
  { id: 'SP', label: 'SP - São Paulo' },
  { id: 'SE', label: 'SE - Sergipe' },
  { id: 'TO', label: 'TO - Tocantins' },
];

const UF_CODES = new Set(UF_OPTIONS.map((option) => option.id));

/** Devolve a sigla em maiusculas, ou vazio quando nao for uma UF valida. */
export function normalizeState(input: string): string {
  const code = (input ?? '').trim().toUpperCase();
  return UF_CODES.has(code) ? code : '';
}

export function isValidState(input: string): boolean {
  return normalizeState(input) !== '';
}

/** Espacos colapsados e bordas aparadas. Usado em municipio e bairro. */
export function normalizePlace(input: string, maxLength = 120): string {
  return (input ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function onlyDigits(input: string, max: number): string {
  return (input ?? '').replace(/\D/g, '').slice(0, max);
}

/** Todos os digitos iguais: 00000000000, 11111111111 e afins. */
function allSameDigit(digits: string): boolean {
  return digits.length > 0 && /^(\d)\1*$/.test(digits);
}

// ---------------------------------------------------------------------------
// CPF
// ---------------------------------------------------------------------------

export const CPF_LENGTH = 11;

/** Somente digitos, no maximo 11. E o formato guardado no banco. */
export function normalizeCpf(input: string): string {
  return onlyDigits(input, CPF_LENGTH);
}

/** Mascara 000.000.000-00 aplicada progressivamente durante a digitacao. */
export function maskCpf(input: string): string {
  const digits = normalizeCpf(input);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function cpfCheckDigit(digits: string, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    sum += Number(digits[i]) * (length + 1 - i);
  }
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** Confere os dois digitos verificadores e recusa sequencias repetidas. */
export function isValidCpf(input: string): boolean {
  const digits = normalizeCpf(input);
  if (digits.length !== CPF_LENGTH || allSameDigit(digits)) return false;

  return (
    cpfCheckDigit(digits, 9) === Number(digits[9]) &&
    cpfCheckDigit(digits, 10) === Number(digits[10])
  );
}

export function formatCpf(input: string): string {
  const digits = normalizeCpf(input);
  return digits.length === CPF_LENGTH ? maskCpf(digits) : (input ?? '');
}

// ---------------------------------------------------------------------------
// Titulo de eleitor
// ---------------------------------------------------------------------------

export const VOTER_ID_LENGTH = 12;

/** Somente digitos, no maximo 12. E o formato guardado no banco. */
export function normalizeVoterId(input: string): string {
  return onlyDigits(input, VOTER_ID_LENGTH);
}

/** Mascara 0000 0000 0000 aplicada progressivamente. */
export function maskVoterId(input: string): string {
  const digits = normalizeVoterId(input);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

/**
 * Digito verificador do titulo.
 *
 * Nos estados de codigo 01 (SP) e 02 (MG) o resto zero vira 1, e nao 0.
 */
function voterCheckDigit(sequence: string, weights: number[], ufCode: number): number {
  let sum = 0;
  for (let i = 0; i < sequence.length; i += 1) {
    sum += Number(sequence[i]) * weights[i];
  }
  const rest = sum % 11;
  if (rest === 10) return 0;
  if (rest === 0 && (ufCode === 1 || ufCode === 2)) return 1;
  return rest;
}

/**
 * Confere formato, codigo de UF e digitos verificadores.
 * Nao consulta o TSE: um titulo bem formado pode nao existir.
 */
export function isValidVoterId(input: string): boolean {
  const digits = normalizeVoterId(input);
  if (digits.length !== VOTER_ID_LENGTH || allSameDigit(digits)) return false;

  const ufCode = Number(digits.slice(8, 10));
  if (ufCode < 1 || ufCode > 28) return false;

  const first = voterCheckDigit(digits.slice(0, 8), [2, 3, 4, 5, 6, 7, 8, 9], ufCode);
  if (first !== Number(digits[10])) return false;

  const second = voterCheckDigit(digits.slice(8, 10) + String(first), [7, 8, 9], ufCode);
  return second === Number(digits[11]);
}

export function formatVoterId(input: string): string {
  const digits = normalizeVoterId(input);
  return digits.length === VOTER_ID_LENGTH ? maskVoterId(digits) : (input ?? '');
}
