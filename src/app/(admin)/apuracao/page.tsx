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
 * Sala de Apuracao: o resultado do TSE ao vivo, cargo por cargo, e o mapa do
 * time logo abaixo — onde os candidatos marcados aparecem secao por secao.
 *
 * Abre para quem ve o mapa (ADMIN e Administrador do time). O ADMIN escolhe
 * o time; o Administrador do time ja entra no seu.
 */
export default async function ApuracaoPage() {
  const user = await requirePageUser();
  if (!can(user, 'map.view')) redirect(homePathFor(user));

  return <SalaDeApuracao />;
}
