import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { homePathFor, LOGIN_PATH } from '@/lib/auth/constants';

/** Porta de entrada: leva ao painel quando ha sessao, ou ao login. */
/** Depende do cookie de sessao: nunca e pre-renderizada. */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? homePathFor(user) : LOGIN_PATH);
}
