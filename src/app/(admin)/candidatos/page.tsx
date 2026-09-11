import type { Metadata } from 'next';
import { ClientsView } from '@/components/clients/ClientsView';

export const metadata: Metadata = {
  title: 'Candidatos',
};

export default function CandidatesPage() {
  return <ClientsView />;
}
