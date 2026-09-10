/**
 * Formato canonico do aviso de privacidade aceito.
 *
 * Fica fora da camada de servidor de proposito: e regra de negocio pura, sem
 * banco e sem rede, para poder ser testada e para que o formato do texto tenha
 * um unico dono. Mudar a montagem abaixo muda o hash dos aceites futuros.
 */

/** Colunas do aviso, como ficam em `cmd_clients`. */
export interface PrivacySource {
  privacy_title: string;
  privacy_text: string;
  privacy_require_consent: boolean;
  privacy_consent_label: string;
  form_updated_at: string;
}

/** Teto do snapshot, alinhado ao check da coluna em cmd_members. */
export const MAX_CONSENT_SNAPSHOT = 8000;

/** Texto exatamente como foi apresentado a pessoa, em formato estavel. */
export function canonicalPrivacyText(row: PrivacySource): string {
  const parts = [
    `título: ${row.privacy_title}`,
    `aviso: ${row.privacy_text}`,
    `consentimento: ${row.privacy_consent_label}`,
    `exige_aceite: ${row.privacy_require_consent ? 'sim' : 'não'}`,
    `versão: ${row.form_updated_at}`,
  ];
  return parts.join('\n').slice(0, MAX_CONSENT_SNAPSHOT);
}
