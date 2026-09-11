'use client';

import { Clock, Link2Off, WifiOff } from 'lucide-react';
import { usePublicInvite } from '@/hooks/use-clients';
import { visibleFields } from '@/lib/validation/dynamic-form';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { InviteStateShell } from './InviteChrome';
import { PublicFormView } from './PublicFormView';

interface PublicInviteViewProps {
  token: string;
}

/** Mesmo texto para todos os casos de link encerrado. */
const GONE_TEXT = 'Este link não está mais disponível. Solicite um novo link à pessoa que o enviou.';

/**
 * Porta de entrada do convite.
 *
 * Link expirado, ja usado, revogado ou reservado por outro navegador mostra
 * sempre a MESMA tela, sem revelar o motivo, sem data tecnica e sem nenhum
 * campo do formulario. Convite inexistente ou com o recrutamento desligado
 * mostra o aviso neutro de indisponibilidade. Carregamento e falha de rede
 * usam a mesma moldura da pagina, entao nenhum estado quebra o desenho.
 */
export function PublicInviteView({ token }: PublicInviteViewProps) {
  const { data, loading, error, reload } = usePublicInvite(token);

  if (loading) {
    return (
      <InviteStateShell>
        <span className="mx-auto flex flex-col items-center gap-3 text-ink-500">
          <Spinner className="size-6 text-brand-700" />
          <p className="text-sm">Carregando formulário...</p>
        </span>
      </InviteStateShell>
    );
  }

  // Falha de rede nao pode ser confundida com convite encerrado.
  if (error) {
    return (
      <InviteStateShell>
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-danger-50 text-danger-600"
        >
          <WifiOff className="size-6" />
        </span>
        <h1 className="text-lg font-semibold text-ink-900">Não foi possível carregar</h1>
        <p className="mt-2 text-sm text-balance text-ink-500">{error}</p>
        <Button variant="secondary" fullWidth className="mt-6" onClick={reload}>
          Tentar novamente
        </Button>
      </InviteStateShell>
    );
  }

  if (!data || data.kind === 'gone') {
    return <InviteExpired reason={data?.reason ?? 'expired'} />;
  }

  if (data.kind === 'unavailable' || !data.invite.client.invite.active) {
    return (
      <InviteUnavailable description="Este link não está ativo no momento. Peça um novo link ao responsável pelo cadastro." />
    );
  }

  // Formulario sem nenhum campo ativo nao tem o que preencher: melhor um
  // aviso claro do que um cartao vazio.
  if (visibleFields(data.invite.client.form).length === 0) {
    return (
      <InviteUnavailable description="O formulário deste convite ainda não tem campos disponíveis. Fale com o responsável pelo cadastro." />
    );
  }

  return (
    <PublicFormView client={data.invite.client} owner={data.invite.owner} token={token} />
  );
}

/**
 * Link encerrado: nenhum campo do formulario e desenhado.
 *
 * Dois titulos, o mesmo texto: "Link não disponível" quando outra pessoa já
 * reservou, "Link expirado" quando venceu ou ja foi usado. Nada do estado
 * interno, da reserva, do aparelho ou de horario tecnico aparece.
 */
export function InviteExpired({ reason = 'expired' }: { reason?: 'taken' | 'expired' }) {
  return (
    <InviteStateShell>
      <span
        aria-hidden="true"
        className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-ink-100 text-ink-500"
      >
        <Clock className="size-6" />
      </span>
      <h1 className="text-lg font-semibold text-ink-900">
        {reason === 'taken' ? 'Link não disponível' : 'Link expirado'}
      </h1>
      <p className="mt-2 text-sm text-balance text-ink-500">{GONE_TEXT}</p>
    </InviteStateShell>
  );
}

function InviteUnavailable({ description }: { description: string }) {
  return (
    <InviteStateShell>
      <span
        aria-hidden="true"
        className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-ink-100 text-ink-500"
      >
        <Link2Off className="size-6" />
      </span>
      <h1 className="text-lg font-semibold text-ink-900">Convite indisponível</h1>
      <p className="mt-2 text-sm text-balance text-ink-500">{description}</p>
    </InviteStateShell>
  );
}
