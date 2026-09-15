import 'server-only';
import { TABLES, type ClientRow } from '@/lib/supabase/tables';
import { notInFilter, selectRows } from '@/lib/supabase/rest';

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
 * Filtro pronto para uma consulta que tem `client_id`.
 *
 * Devolve `{}` quando nao ha Time DEMO: a consulta sai exatamente como
 * sempre foi.
 */
export async function withoutDemoClients(): Promise<Record<string, string>> {
  const demo = await demoClientIds();
  return demo.length > 0 ? { client_id: notInFilter(demo) } : {};
}
