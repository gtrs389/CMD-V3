import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can } from '@/lib/permissions';
import { homePathFor } from '@/lib/auth/constants';
import { requirePageUser } from '@/lib/auth/server';
import { PaginaDaSala } from '@/components/confronto/PaginaDaSala';

export const metadata: Metadata = {
  title: 'Sala de Confronto',
};

/**
 * Sala de Confronto: as escolas que o time mandou para o duelo (do Raio-X de
 * cada escola, no mapa). Abre para quem ve o mapa (ADMIN e Administrador do
 * time); o Administrador do time ve so as escolas do proprio time.
 */
export default async function ConfrontoPage() {
  const user = await requirePageUser();
  if (!can(user, 'map.view')) redirect(homePathFor(user));

  return <PaginaDaSala />;
}
