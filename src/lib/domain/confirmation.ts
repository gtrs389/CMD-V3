/**
 * Aviso da confirmacao final do cadastro.
 *
 * O texto e a versao vivem aqui, fora da tela e fora do servidor, para que a
 * prova gravada no banco e o que a pessoa leu tenham a mesma fonte. Mudar o
 * texto exige mudar a versao: os registros antigos continuam valendo com a
 * versao em que foram feitos.
 */

export const CONFIRMATION_VERSION = '2026-09-1';

export const CONFIRMATION_TITLE = 'Confirme seus dados';

export const CONFIRMATION_NOTICE =
  'Confira atentamente seus dados. Após a confirmação, você não poderá alterá-los por este link.';

/** Texto integral registrado como prova, em formato estavel. */
export function canonicalConfirmationText(): string {
  return [`versão: ${CONFIRMATION_VERSION}`, `título: ${CONFIRMATION_TITLE}`, `aviso: ${CONFIRMATION_NOTICE}`].join(
    '\n',
  );
}
