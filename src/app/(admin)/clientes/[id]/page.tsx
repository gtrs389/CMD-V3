import type { Metadata } from 'next';
import { ClientDetailView } from '@/components/clients/ClientDetailView';

export const metadata: Metadata = {
  title: 'Cliente',
};

export default async function ClientDetailPage({ params }: PageProps<'/clientes/[id]'>) {
  const { id } = await params;
  return <ClientDetailView clientId={id} />;
}
