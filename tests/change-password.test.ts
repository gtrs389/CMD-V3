import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  changePasswordSchema,
} from '@/lib/validation/auth.schema';

/**
 * As regras que a tela e a rota compartilham. Nenhuma mensagem revela
 * detalhe interno do sistema.
 */

const valido = {
  currentPassword: 'senha-atual-123',
  newPassword: 'senha-nova-456',
  confirmPassword: 'senha-nova-456',
};

/** Primeira mensagem registrada para um campo. */
function erroDe(input: Record<string, string>, campo: string): string | undefined {
  const parsed = changePasswordSchema.safeParse(input);
  if (parsed.success) return undefined;
  return parsed.error.issues.find((issue) => issue.path[0] === campo)?.message;
}

describe('troca de senha', () => {
  it('aceita um preenchimento correto', () => {
    expect(changePasswordSchema.safeParse(valido).success).toBe(true);
  });

  it('exige a senha atual', () => {
    expect(erroDe({ ...valido, currentPassword: '' }, 'currentPassword')).toBe(
      'Informe a senha atual.',
    );
  });

  it('usa o mesmo mínimo de caracteres do restante do projeto', () => {
    expect(PASSWORD_MIN).toBe(8);
    expect(PASSWORD_MAX).toBe(200);

    const curta = 'a'.repeat(PASSWORD_MIN - 1);
    expect(erroDe({ ...valido, newPassword: curta, confirmPassword: curta }, 'newPassword')).toContain(
      `pelo menos ${PASSWORD_MIN}`,
    );
  });

  it('recusa senha acima do limite', () => {
    const longa = 'a'.repeat(PASSWORD_MAX + 1);
    expect(erroDe({ ...valido, newPassword: longa, confirmPassword: longa }, 'newPassword')).toContain(
      `no máximo ${PASSWORD_MAX}`,
    );
  });

  it('recusa confirmação diferente', () => {
    expect(erroDe({ ...valido, confirmPassword: 'outra-coisa-789' }, 'confirmPassword')).toBe(
      'As senhas não conferem.',
    );
  });

  it('recusa nova senha igual à atual', () => {
    const igual = {
      currentPassword: 'senha-atual-123',
      newPassword: 'senha-atual-123',
      confirmPassword: 'senha-atual-123',
    };
    expect(erroDe(igual, 'newPassword')).toBe('A nova senha precisa ser diferente da atual.');
  });

  it('não devolve o valor digitado nas mensagens', () => {
    const parsed = changePasswordSchema.safeParse({
      currentPassword: 'segredo-do-usuario',
      newPassword: 'x',
      confirmPassword: 'y',
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const texto = parsed.error.issues.map((issue) => issue.message).join(' ');
      expect(texto).not.toContain('segredo-do-usuario');
    }
  });
});
