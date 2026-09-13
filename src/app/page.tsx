import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { homePathFor, LOGIN_PATH } from '@/lib/auth/constants';
import { isPanelHost, PUBLIC_EXIT_PATH } from '@/lib/domain/hosts';
import { publicScreenFrom } from '@/lib/server/public-context';
import { PublicInviteView, InviteExpired, InviteUnavailable } from '@/components/public/PublicInviteView';
import {
  PublicSurveyView,
  SurveyClosed,
  SurveyUnavailable,
} from '@/components/public/PublicSurveyView';
import { TeamAccessScreen } from '@/components/public/TeamAccessScreen';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Depende de cookies: nunca e pre-renderizada. */
export const dynamic = 'force-dynamic';

/**
 * Porta de entrada do sistema.
 *
 * As telas publicas moram aqui, e nao nas rotas com token: quem abre um link
 * de convite ou de acesso passa pela rota de entrada, que valida o codigo,
 * guarda o contexto em cookie `HttpOnly` e redireciona para ca. Por isso a
 * barra de endereco fica so com o dominio — sem token, slug, query ou
 * fragmento — e continua assim ao atualizar a pagina.
 *
 * A ordem e fixa:
 *
 *   1. contexto de cadastro     -> formulario publico;
 *   2. contexto de questionario -> pesquisa publica (nao vira integrante);
 *   3. contexto de acesso       -> tela do telefone;
 *   4. estado publico de erro   -> a mensagem correspondente, sem token;
 *   5. sessao autenticada       -> painel do perfil;
 *   6. nada disso               -> login.
 *
 * Os dois contextos nunca convivem: a rota de entrada apaga o anterior antes
 * de gravar o novo.
 */
export default async function HomePage() {
  const store = await cookies();
  const publico = publicScreenFrom(store);

  if (publico.kind === 'invite') return <PublicInviteView />;
  if (publico.kind === 'survey') return <PublicSurveyView />;
  if (publico.kind === 'team-access') return <TeamAccessScreen />;

  if (publico.kind === 'state') {
    switch (publico.state) {
      case 'convite-expirado':
        return <InviteExpired reason="expired" />;
      case 'convite-reservado':
        return <InviteExpired reason="taken" />;
      case 'acesso-indisponivel':
        return <TeamAccessScreen available={false} />;
      case 'questionario-encerrado':
        return <SurveyClosed />;
      case 'questionario-indisponivel':
        return <SurveyUnavailable />;
      default:
        return (
          <InviteUnavailable description="Este link não está ativo no momento. Peça um novo link ao responsável pelo cadastro." />
        );
    }
  }

  // Dominio publico sem contexto nenhum: nao ha o que desenhar aqui, e a
  // tela de login nao mora neste endereco. Quem chegou assim vai para a
  // saida que o ADMIN configurou.
  if (!isPanelHost((await headers()).get('host'))) redirect(PUBLIC_EXIT_PATH);

  const user = await getCurrentUser();
  redirect(user ? homePathFor(user) : LOGIN_PATH);
}
