import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';

/** Usado para restaurar visualmente a sessao ao abrir o painel. */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(
    { user },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
