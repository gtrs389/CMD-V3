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

/**
 * Caminho do link de acesso dos administradores do time.
 *
 * Tambem carrega apenas um identificador opaco: nome, telefone e qualquer
 * dado do time ficam no servidor. Este link nao e o de recrutamento.
 */
export function teamAccessPath(token: string): string {
  return `/acesso/time/${token}`;
}

/**
 * Reconstroi a query de uma rota antiga ao encaminhar para a nova.
 *
 * Preserva chaves repetidas e devolve string vazia quando nao ha parametro,
 * para o endereco final nao terminar com "?".
 */
export function queryString(
  params: Record<string, string | string[] | undefined> | undefined,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else if (typeof value === 'string') search.append(key, value);
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}
