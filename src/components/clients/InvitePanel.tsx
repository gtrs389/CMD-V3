'use client';

import { useState } from 'react';
import { ExternalLink, KeyRound, Link2, ShieldOff } from 'lucide-react';
import type { Client } from '@/lib/types';
import { clientRepository } from '@/lib/repositories';
import { invitePath } from '@/lib/utils/url';
import { formatDateTime } from '@/lib/utils/date';
import { useOrigin } from '@/hooks/use-origin';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { CopyField } from '@/components/common/CopyField';

interface InvitePanelProps {
  client: Client;
}

/** Link individual de cadastro: copiar, prever, ativar/desativar e gerar novo token. */
export function InvitePanel({ client }: InvitePanelProps) {
  const toast = useToast();
  const [rotating, setRotating] = useState(false);
  const origin = useOrigin();

  const path = invitePath(client.invite.token);
  // A origem so existe no navegador; ate hidratar, mostramos o caminho relativo.
  const url = origin ? `${origin}${path}` : path;

  async function toggleActive(active: boolean) {
    try {
      await clientRepository.setInviteActive(client.id, active);
      toast.success(active ? 'Convite ativado.' : 'Convite desativado.');
    } catch {
      toast.error('Nao foi possivel alterar o convite.');
    }
  }

  async function regenerate() {
    try {
      await clientRepository.regenerateInviteToken(client.id);
      toast.success('Novo link gerado. O link anterior deixou de funcionar.');
    } catch {
      toast.error('Nao foi possivel gerar um novo link.');
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Link de convite</CardTitle>
            <CardDescription>
              Envie este endereco para a equipe preencher o cadastro. O link contem apenas um
              token aleatorio, sem nenhum dado pessoal.
            </CardDescription>
          </div>
        </CardHeader>

        <CardBody className="space-y-4">
          <CopyField value={url} label="Link de convite" actionLabel="Copiar link" />

          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              href={path}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-4 text-sm font-medium text-ink-900 shadow-card transition-colors hover:bg-ink-50"
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              Abrir previa em nova aba
            </a>
          </div>

          <dl className="grid gap-3 rounded-control bg-ink-50 p-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs text-ink-500">Criado em</dt>
              <dd className="font-medium text-ink-900">{formatDateTime(client.invite.createdAt)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-ink-500">Ultima renovacao</dt>
              <dd className="font-medium text-ink-900">
                {client.invite.rotatedAt ? formatDateTime(client.invite.rotatedAt) : 'Nunca'}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Controle do convite</CardTitle>
            <CardDescription>Interrompa ou renove o acesso ao formulario publico.</CardDescription>
          </div>
        </CardHeader>

        <CardBody className="space-y-5">
          <Switch
            label="Convite ativo"
            description={
              client.invite.active
                ? 'O formulario publico esta aceitando novos cadastros.'
                : 'Quem acessar o link vera um aviso de convite indisponivel.'
            }
            checked={client.invite.active}
            onChange={toggleActive}
          />

          <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-900">Gerar novo link</p>
              <p className="text-xs text-ink-500">
                O endereco atual para de funcionar imediatamente.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setRotating(true)} className="shrink-0">
              <KeyRound aria-hidden="true" className="size-4" />
              Gerar novo token
            </Button>
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={rotating}
        title="Gerar novo link de convite"
        description="Um novo token sera criado para este cliente."
        confirmLabel="Gerar novo link"
        tone="brand"
        onCancel={() => setRotating(false)}
        onConfirm={regenerate}
        details={
          <ul className="space-y-2 rounded-control bg-warning-50 p-3 text-sm text-warning-600">
            <li className="flex gap-2">
              <ShieldOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>Qualquer link ja compartilhado deixara de funcionar.</span>
            </li>
            <li className="flex gap-2">
              <Link2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>Os integrantes ja cadastrados sao preservados.</span>
            </li>
          </ul>
        }
      />
    </div>
  );
}
