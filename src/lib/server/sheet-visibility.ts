import 'server-only';
import { TABLES, type ClientRow } from '@/lib/supabase/tables';
import { selectOne, SupabaseRequestError } from '@/lib/supabase/rest';

/**
 * Quem do BANCO aparece no time duplicado, conforme a planilha do Google
 * Sheets (migration 052).
 *
 *   LIGADA     a Equipe vem da planilha, lida ao vivo (`sheet-live.service`).
 *              Do banco aparecem so os Lideres; a Equipe que estava no banco
 *              da copia fica escondida.
 *   DESLIGADA  nada muda: a copia mostra o que tem no banco.
 *
 * Esconder, e nao apagar: ligar e desligar quantas vezes quiser nunca perde
 * nada.
 *
 * Time que nao e copia devolve `{}`: a consulta sai exatamente como sempre
 * foi, sem uma clausula a mais — o time oficial nao sabe que isto existe.
 */
export async function sheetVisibilityFilter(clientId: string): Promise<Record<string, string>> {
  return (await sheetEnabled(clientId))
    ? { or: '(recruited_by_role.is.null,recruited_by_role.neq.EQUIPE)' }
    : {};
}

/** A planilha esta ligada neste time? So pode estar em copia. */
export async function sheetEnabled(clientId: string): Promise<boolean> {
  let row: Pick<ClientRow, 'is_copy' | 'sheet_sync_enabled'> | null;
  try {
    row = await selectOne<Pick<ClientRow, 'is_copy' | 'sheet_sync_enabled'>>(TABLES.clients, {
      select: 'is_copy,sheet_sync_enabled',
      filters: { id: `eq.${clientId}` },
    });
  } catch (error) {
    // Banco sem a migration 052 (ou sem a 049): nao ha planilha.
    if (error instanceof SupabaseRequestError && error.isMissingSchema) return false;
    throw error;
  }
  return row?.is_copy === true && row.sheet_sync_enabled === true;
}
