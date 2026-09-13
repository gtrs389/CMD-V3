import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DoorOpen } from 'lucide-react';
import { getPublicEntry } from '@/lib/server/settings.service';
import { InviteStateShell } from '@/components/public/InviteChrome';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Depende da configuracao gravada: nunca e pre-renderizada. */
export const dynamic = 'force-dynamic';

/**
 * Saida do dominio publico.
 *
 * Quem chega ao endereco publico tentando abrir o painel — a tela de login,
 * o painel, as configuracoes — para aqui. O dominio publico existe para os
 * links enviados: formulario de cadastro, questionario e acesso do time. A
 * porta de entrada do sistema nao fica exposta nele.
 *
 * O destino e o que o ADMIN gravou em Configuracoes. Sem destino
 * configurado, a pessoa ve apenas um aviso neutro: nenhum login, nenhum
 * nome de time, nenhum indicio de qual sistema e este.
 */
export default async function PublicExitPage() {
  const { redirectUrl } = await getPublicEntry().catch(() => ({ redirectUrl: '' }));

  // `redirect` so recebe o que o banco aceitou: a coluna exige um endereco
  // absoluto http(s), e o servico confere de novo antes de gravar.
  if (redirectUrl) redirect(redirectUrl);

  return (
    <InviteStateShell>
      <span
        aria-hidden="true"
        className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-ink-100 text-ink-500"
      >
        <DoorOpen className="size-6" />
      </span>
      <h1 className="text-lg font-semibold text-ink-900">Página não disponível</h1>
      <p className="mt-2 text-sm text-balance text-ink-500">
        Este endereço atende apenas aos links enviados. Se você recebeu um convite, abra o link
        que lhe mandaram.
      </p>
    </InviteStateShell>
  );
}
