import 'server-only';
import { cookies } from 'next/headers';
import type { SessionUser } from '@/lib/types';
import { SESSION_COOKIE } from './constants';
import { readSessionToken, toSessionUser } from './session';

/** Le a sessao atual em Server Components e Route Handlers. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const payload = await readSessionToken(store.get(SESSION_COOKIE)?.value);
  return payload ? toSessionUser(payload) : null;
}
