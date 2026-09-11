import type { Metadata } from 'next';
import { ClientDetailView, isTabId } from '@/components/clients/ClientDetailView';

export const metadata: Metadata = {
  title: 'Candidato',
};

export default async function CandidateDetailPage({ params, searchParams }: PageProps<'/candidatos/[id]'>) {
  const { id } = await params;
  const { aba } = await searchParams;

  // A aba inicial vem da URL: e assim que "Gerenciar recrutamento" abre o convite.
  const tab = typeof aba === 'string' && isTabId(aba) ? aba : undefined;

  return <ClientDetailView clientId={id} initialTab={tab} />;
}
