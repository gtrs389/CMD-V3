import { redirect } from 'next/navigation';
import { queryString } from '@/lib/utils/url';

/** Rota antiga. Preserva o identificador e os parametros ao encaminhar. */
export default async function ClienteRedirect({ params, searchParams }: PageProps<'/clientes/[id]'>) {
  const { id } = await params;
  redirect(`/candidatos/${encodeURIComponent(id)}${queryString(await searchParams)}`);
}
