import type { Metadata } from 'next';
import { canReachClient } from '@/lib/permissions';
import { requirePageUser } from '@/lib/auth/server';
import { AccessDenied } from '@/components/layout/AccessDenied';
import { ClientDetailView, isTabId } from '@/components/clients/ClientDetailView';

export const metadata: Metadata = {
  title: 'Candidato',
};

export default async function CandidateDetailPage({ params, searchParams }: PageProps<'/candidatos/[id]'>) {
  const { id } = await params;
  const user = await requirePageUser();

  // Candidato so abre o proprio registro. A mesma regra vale nas rotas de API.
  if (!canReachClient(user, id)) return <AccessDenied />;

  const { aba } = await searchParams;
  const tab = typeof aba === 'string' && isTabId(aba) ? aba : undefined;

  return <ClientDetailView clientId={id} initialTab={tab} />;
}
