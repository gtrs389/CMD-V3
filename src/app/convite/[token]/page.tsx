import type { Metadata } from 'next';
import { PublicInviteView } from '@/components/public/PublicInviteView';

export const metadata: Metadata = {
  title: 'Cadastro de equipe',
  robots: { index: false, follow: false },
};

/**
 * Rota publica de cadastro.
 *
 * O token e opaco e nao carrega nenhum dado pessoal. A validacao acontece no
 * servidor: a tela chama a rota publica do convite, que confere o hash do
 * token no banco antes de devolver qualquer coisa.
 */
export default async function InvitePage({ params }: PageProps<'/convite/[token]'>) {
  const { token } = await params;
  return <PublicInviteView token={token} />;
}
