import { NextResponse } from 'next/server';

/**
 * Respostas comuns das rotas de localidade.
 *
 * Em caso de falha devolve uma mensagem curta: nenhum detalhe da API externa
 * ou do servidor chega ao navegador, e nada e registrado em log.
 */
export async function locationResponse<T>(
  load: () => Promise<T[]>,
  maxAge: number,
): Promise<NextResponse> {
  try {
    const items = await load();
    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=86400` } },
    );
  } catch {
    return locationFailure(502, 'Não foi possível carregar as localidades.');
  }
}

export function locationFailure(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
