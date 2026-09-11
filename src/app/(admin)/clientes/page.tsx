import { redirect } from 'next/navigation';
import { queryString } from '@/lib/utils/url';

/** Rota antiga. Mantida apenas para encaminhar links ja compartilhados. */
export default async function ClientesRedirect({ searchParams }: PageProps<'/clientes'>) {
  redirect(`/candidatos${queryString(await searchParams)}`);
}
