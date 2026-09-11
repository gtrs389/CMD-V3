import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/auth/server';
import { ClientsView } from '@/components/clients/ClientsView';

export const metadata: Metadata = {
  title: 'Times',
};

/** Lista de todos os times: exclusiva do ADMIN. */
export default async function CandidatesPage() {
  await requireAdminPage();
  return <ClientsView />;
}
