import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can } from '@/lib/permissions';
import { homePathFor } from '@/lib/auth/constants';
import { requirePageUser } from '@/lib/auth/server';
import { TeamRecruitView } from '@/components/team/TeamRecruitView';

export const metadata: Metadata = {
  title: 'Recrutar',
};

/** Link pessoal do integrante. Exclusiva do perfil EQUIPE. */
export default async function TeamRecruitPage() {
  const user = await requirePageUser();
  if (!can(user, 'team.access')) redirect(homePathFor(user));

  return <TeamRecruitView />;
}
