import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Informe o e-mail.')
    .pipe(z.email('E-mail inválido.')),
  password: z.string().min(1, 'Informe a senha.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Mesmos limites usados pelo comando `npm run gerar-hash`. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual.'),
    newPassword: z
      .string()
      .min(PASSWORD_MIN, `A nova senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`)
      .max(PASSWORD_MAX, `A nova senha precisa ter no máximo ${PASSWORD_MAX} caracteres.`),
    confirmPassword: z.string().min(1, 'Confirme a nova senha.'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem.',
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ['newPassword'],
    message: 'A nova senha precisa ser diferente da atual.',
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * Primeiro acesso: define a senha definitiva.
 *
 * Mesmas regras da troca comum, sem pedir a senha atual — quem chegou aqui
 * ja entrou com a senha temporaria e a sessao identifica o usuario.
 */
export const firstAccessSchema = z
  .object({
    newPassword: z
      .string()
      .min(PASSWORD_MIN, `A nova senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`)
      .max(PASSWORD_MAX, `A nova senha precisa ter no máximo ${PASSWORD_MAX} caracteres.`),
    confirmPassword: z.string().min(1, 'Confirme a nova senha.'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem.',
  });

export type FirstAccessInput = z.infer<typeof firstAccessSchema>;
