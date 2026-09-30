import 'server-only';
import { TABLES, type ClientRow } from '@/lib/supabase/tables';
import { selectOne, SupabaseRequestError } from '@/lib/supabase/rest';

/**
 * Quem aparece no time duplicado, conforme a planilha do Google Sheets
 * (migration 052).
 *
 *   LIGADA     a Equipe vem da planilha: aparecem os Lideres (os da copia e
 *              os que a planilha criou) e a Equipe que veio dela. A Equipe
 *              que estava no banco da copia fica escondida.
 *   DESLIGADA  o que veio da planilha fica escondido, e a copia volta a ser
 *              exatamente o que era.
 *
 * Esconder, e nao apagar: ligar e desligar quantas vezes quiser nunca perde
 * nada.
 *
 * Time que nao e copia devolve `{}`: a consulta sai exatamente como sempre
 * foi, sem uma clausula a mais — o time oficial nao sabe que isto existe.
 */
export async function sheetVisibilityFilter(clientId: string): Promise<Record<string, string>> {
  let row: Pick<ClientRow, 'is_copy' | 'sheet_sync_enabled'> | null;
  try {
    row = await selectOne<Pick<ClientRow, 'is_copy' | 'sheet_sync_enabled'>>(TABLES.clients, {
      select: 'is_copy,sheet_sync_enabled',
      filters: { id: `eq.${clientId}` },
    });
  } catch (error) {
    // Banco sem a migration 052 (ou sem a 049): nao ha planilha nem linha
    // vinda dela. Nada a esconder.
    if (error instanceof SupabaseRequestError && error.isMissingSchema) return {};
    throw error;
  }

  if (!row?.is_copy) return {};
  if (row.sheet_sync_enabled) {
    return { or: '(from_sheet.is.true,recruited_by_role.is.null,recruited_by_role.neq.EQUIPE)' };
  }
  return { from_sheet: 'is.false' };
}
