import type { Metadata } from 'next';
import { ClientsView } from '@/components/clients/ClientsView';

export const metadata: Metadata = {
  title: 'Clientes',
};

export default function ClientsPage() {
  return <ClientsView />;
}
