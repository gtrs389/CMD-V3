import { getCurrentUser } from '@/lib/auth/server';
import { jsonOk } from '@/lib/server/http';

/** Usado para reconferir a sessao ao voltar para a aba do painel. */
export async function GET() {
  return jsonOk({ user: await getCurrentUser() });
}
