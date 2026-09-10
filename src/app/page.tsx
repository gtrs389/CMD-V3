import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { DEFAULT_AUTHENTICATED_PATH, LOGIN_PATH } from '@/lib/auth/constants';

/** Porta de entrada: leva ao painel quando ha sessao, ou ao login. */
export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? DEFAULT_AUTHENTICATED_PATH : LOGIN_PATH);
}
