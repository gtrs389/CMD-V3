import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can } from '@/lib/permissions';
import { homePathFor } from '@/lib/auth/constants';
import { requirePageUser } from '@/lib/auth/server';
import { SalaDeApuracao } from '@/components/apuracao/SalaDeApuracao';

export const metadata: Metadata = {
  title: 'Sala de Apuração',
};

/**
 * Sala de Apuracao: o resultado do TSE ao vivo, cargo por cargo.
 *
 * Abre para quem ve o mapa (ADMIN e Administrador do time). O "Ver no mapa"
 * de cada candidato leva a pagina inicial da pessoa, onde o mapa esta.
 */
export default async function ApuracaoPage() {
  const user = await requirePageUser();
  if (!can(user, 'map.view')) redirect(homePathFor(user));

  return <SalaDeApuracao mapaHref={homePathFor(user)} />;
}
