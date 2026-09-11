import 'server-only';
import { createHash } from 'node:crypto';
import { canonicalPrivacyText, type PrivacySource } from '@/lib/domain/consent';
import { TABLES, type ClientRow } from '@/lib/supabase/tables';
import { selectOne } from '@/lib/supabase/rest';
import { notFound } from './http';

/**
 * Evidencia do consentimento.
 *
 * O texto guardado junto ao integrante e montado aqui, no servidor, a partir
 * de `cmd_clients`. Nada do que o navegador envia entra nessa evidencia: o
 * visitante so informa que aceitou, e o servidor registra o que estava valendo
 * naquele momento.
 */

export interface ConsentEvidence {
  consent_at: string;
  consent_privacy_hash: string;
  consent_privacy_snapshot: string;
  consent_privacy_version: string;
}

type PrivacyColumns = PrivacySource & Pick<ClientRow, 'privacy_enabled'>;

const PRIVACY_SELECT =
  'privacy_enabled,privacy_title,privacy_text,privacy_require_consent,privacy_consent_label,form_updated_at';

export function privacyHash(snapshot: string): string {
  return createHash('sha256').update(snapshot, 'utf8').digest('hex');
}

/**
 * Monta a evidencia para gravar em cmd_members.
 *
 * A data do aceite e a do servidor: um horario enviado pelo navegador nao
 * serve como prova.
 */
export async function buildConsentEvidence(clientId: string): Promise<ConsentEvidence> {
  const row = await selectOne<PrivacyColumns>(TABLES.clients, {
    select: PRIVACY_SELECT,
    filters: { id: `eq.${clientId}` },
  });
  if (!row) throw notFound('Candidato não encontrado.');

  const snapshot = canonicalPrivacyText(row);

  return {
    consent_at: new Date().toISOString(),
    consent_privacy_hash: privacyHash(snapshot),
    consent_privacy_snapshot: snapshot,
    consent_privacy_version: row.form_updated_at,
  };
}

/** Colunas zeradas quando o integrante nao consentiu. */
export const EMPTY_CONSENT = {
  consent_at: null,
  consent_privacy_hash: null,
  consent_privacy_snapshot: null,
  consent_privacy_version: null,
} as const;
