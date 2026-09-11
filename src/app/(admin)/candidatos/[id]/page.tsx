import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can, canReachClient } from '@/lib/permissions';
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
  const param = typeof aba === 'string' ? aba : '';
  const tab = isTabId(param) ? param : undefined;
  // O convite deixou de ser aba: o atalho de "Recrutar" e os enderecos ja
  // compartilhados abrem o link de cadastro em dialogo.
  const abrirLink = param === 'convite';

  // A area interna do formulario e exclusiva do ADMIN: `?aba=formulario` na
  // mao volta para a visao geral, sem o parametro na URL. A configuracao dos
  // campos tambem nao vem na resposta da API para este perfil.
  if (tab === 'formulario' && !can(user, 'form.view')) redirect(`/candidatos/${id}`);

  return <ClientDetailView clientId={id} initialTab={tab} initialInvite={abrirLink} />;
}
