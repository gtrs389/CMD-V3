import 'server-only';
import { TABLES, type ClientRow } from '@/lib/supabase/tables';
import { notInFilter, selectRows, SupabaseRequestError } from '@/lib/supabase/rest';

/**
 * O recorte que mantem os Times DEMO fora dos numeros reais.
 *
 * Modulo proprio, e nao um trecho dentro de `client.service`, por uma razao
 * simples: quem precisa deste recorte sao os servicos de integrante e de
 * mapa, e faze-los importar o servico de time criaria um ciclo entre os
 * tres. Aqui so entram o cliente do banco e os nomes das tabelas.
 *
 * Sem nenhum Time DEMO cadastrado, a lista volta vazia e nenhuma consulta do
 * sistema ganha uma clausula sequer — quem nunca criou um time de
 * demonstracao nao paga nada por esta funcionalidade existir.
 */
export async function demoClientIds(): Promise<string[]> {
  const rows = await selectRows<Pick<ClientRow, 'id'>>(TABLES.clients, {
    select: 'id',
    filters: { is_demo: 'is.true' },
  });
  return rows.map((row) => row.id);
}

/**
 * Este time e de demonstracao?
 *
 * Usado antes de CONCEDER ACESSO: em um Time DEMO, so os administradores
 * cadastrados a mao pelo ADMIN geral entram no painel. As pessoas ficticias
 * sao dados, e nao gente que faz login.
 */
export async function isDemoClient(clientId: string | null | undefined): Promise<boolean> {
  if (!clientId) return false;

  const rows = await selectRows<Pick<ClientRow, 'id'>>(TABLES.clients, {
    select: 'id',
    filters: { id: `eq.${clientId}`, is_demo: 'is.true' },
  });
  return rows.length > 0;
}

/**
 * Times fora dos numeros reais: os Times DEMO e os times DUPLICADOS
 * (migration 049).
 *
 * A copia de um time serve para ensaiar e mostrar — com os mesmos Lideres
 * do oficial. Somada a Visao geral, ela contaria cada Lider duas vezes.
 *
 * Banco ainda sem a migration 049: a coluna `is_copy` nao existe, e portanto
 * nenhuma copia existe. Vale a lista do DEMO, e nada quebra.
 */
export async function offBooksClientIds(): Promise<string[]> {
  try {
    const rows = await selectRows<Pick<ClientRow, 'id'>>(TABLES.clients, {
      select: 'id',
      filters: { or: '(is_demo.is.true,is_copy.is.true)' },
    });
    return rows.map((row) => row.id);
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.isMissingSchema) return demoClientIds();
    throw error;
  }
}

/**
 * Filtro pronto para uma consulta que tem `client_id`: tira os Times DEMO e
 * os times duplicados.
 *
 * Devolve `{}` quando nao ha nenhum dos dois: a consulta sai exatamente como
 * sempre foi.
 */
export async function withoutDemoClients(): Promise<Record<string, string>> {
  const fora = await offBooksClientIds();
  return fora.length > 0 ? { client_id: notInFilter(fora) } : {};
}
