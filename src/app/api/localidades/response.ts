import { NextResponse } from 'next/server';
import { LocationConfigError } from '@/lib/server/location.service';

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
      {
        // O cache fica na borda, nao no navegador: assim uma mudanca de
        // formato nunca continua sendo servida de dentro da maquina de quem usa.
        headers: {
          'Cache-Control': `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=86400`,
        },
      },
    );
  } catch (error) {
    // Configuracao ausente e falha da API externa devolvem apenas o essencial:
    // nem a chave nem o detalhe interno chegam ao navegador.
    if (error instanceof LocationConfigError) {
      return locationFailure(503, 'Serviço de localidades indisponível.');
    }
    return locationFailure(502, 'Não foi possível carregar as localidades.');
  }
}

export function locationFailure(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
}
