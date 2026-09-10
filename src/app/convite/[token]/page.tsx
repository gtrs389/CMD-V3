import type { Metadata } from 'next';
import { PublicInviteView } from '@/components/public/PublicInviteView';

export const metadata: Metadata = {
  title: 'Cadastro de equipe',
  robots: { index: false, follow: false },
};

/**
 * Rota publica de cadastro.
 *
 * O token e opaco e nao carrega nenhum dado pessoal. A validacao acontece
 * no navegador porque, nesta etapa, os dados vivem no localStorage.
 */
export default async function InvitePage({ params }: PageProps<'/convite/[token]'>) {
  const { token } = await params;
  return <PublicInviteView token={token} />;
}
