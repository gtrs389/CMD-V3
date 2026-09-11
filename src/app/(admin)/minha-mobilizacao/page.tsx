import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can } from '@/lib/permissions';
import { homePathFor } from '@/lib/auth/constants';
import { requirePageUser } from '@/lib/auth/server';
import { TeamDetailView } from '@/components/team/TeamDetailView';

export const metadata: Metadata = {
  title: 'Minha mobilização',
};

/**
 * Area do integrante da equipe.
 *
 * Exclusiva do perfil EQUIPE. Outro perfil que abrir pela URL volta para a
 * propria pagina inicial; a rota de dados confere a sessao por conta propria.
 */
export default async function MyMobilizationPage() {
  const user = await requirePageUser();
  if (!can(user, 'team.access')) redirect(homePathFor(user));

  return <TeamDetailView />;
}
