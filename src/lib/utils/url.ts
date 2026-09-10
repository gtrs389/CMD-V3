import { appConfig } from '@/config/app.config';

/**
 * Caminho relativo do convite.
 *
 * Contem apenas o token opaco: nenhum dado pessoal vai para a URL.
 * A origem absoluta e obtida no navegador pelo hook `useOrigin`.
 */
export function invitePath(token: string): string {
  return `${appConfig.invitePath}/${token}`;
}
