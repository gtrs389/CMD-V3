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

/**
 * Link do candidato: copiar, prever, ativar/desativar e renovar.
 *
 * O endereco continua disponivel depois de sair, entrar de novo, trocar de
 * aparelho ou recarregar: ele e lido do banco a cada carregamento. Abrir a
 * pagina nao gera, renova nem invalida nada; a renovacao acontece somente no
 * botao "Gerar novo token".
 *
 * Desativar aqui desliga o recrutamento da operacao inteira: os links
 * pessoais de todos os integrantes tambem param de aceitar cadastros.
 */
export function InvitePanel({ client }: InvitePanelProps) {
  const toast = useToast();
  const [rotating, setRotating] = useState(false);
  const [working, setWorking] = useState(false);
  // Token recebido agora, nesta sessao da tela. Nunca vem do banco.
  const [token, setToken] = useState<string | null>(client.invite.token);

  const origin = useOrigin();
  const path = token ? invitePath(token) : null;
  // A origem so existe no navegador; ate hidratar, mostramos o caminho relativo.
  const url = path ? (origin ? `${origin}${path}` : path) : '';

  async function toggleActive(active: boolean) {
    try {
      await clientRepository.setInviteActive(client.id, active);
      toast.success(active ? 'Convite ativado.' : 'Convite desativado.');
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível alterar o convite.',
      );
    }
  }

  async function regenerate() {
    setWorking(true);
    try {
      const updated = await clientRepository.regenerateInviteToken(client.id);
      setToken(updated.invite.token);
      toast.success('Novo link gerado. O link anterior deixou de funcionar.');
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível gerar um novo link.',
      );
    } finally {
      setWorking(false);
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
              Envie este endereço para a equipe preencher o cadastro. O link contém apenas um
              identificador aleatório, sem nenhum dado pessoal, e continua o mesmo depois de sair,
              entrar de novo, trocar de aparelho ou recarregar a página. Cada integrante
              cadastrado recebe também um link pessoal.
            </CardDescription>
          </div>
        </CardHeader>

        <CardBody className="space-y-4">
          {path ? (
            <>
              <CopyField value={url} label="Link de convite" actionLabel="Copiar link" />

              <div className="flex flex-col gap-2 sm:flex-row">
                <a
                  href={path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-4 text-sm font-medium text-ink-900 shadow-card transition-colors hover:bg-ink-50"
                >
                  <ExternalLink aria-hidden="true" className="size-4" />
                  Abrir prévia em nova aba
                </a>
              </div>
            </>
          ) : (
            <div className="rounded-control border border-line bg-ink-50 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
                <Link2 aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
                Link não visível
              </p>
              <p className="mt-1 text-xs text-ink-500">
                Este convite foi criado antes do link pessoal e guarda apenas o hash do token. Os
                links já enviados continuam funcionando. Para ter um endereço visível, gere um
                novo link abaixo.
              </p>
            </div>
          )}

          <dl className="grid gap-3 rounded-control bg-ink-50 p-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs text-ink-500">Criado em</dt>
              <dd className="font-medium text-ink-900">{formatDateTime(client.invite.createdAt)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-ink-500">Última renovação</dt>
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
            <CardDescription>Interrompa ou renove o acesso ao formulário público.</CardDescription>
          </div>
        </CardHeader>

        <CardBody className="space-y-5">
          <Switch
            label="Recrutamento ativo"
            description={
              client.invite.active
                ? 'Todos os links desta candidatura aceitam novos cadastros.'
                : 'Nenhum link desta candidatura aceita cadastros: nem o do candidato, nem os da equipe.'
            }
            checked={client.invite.active}
            onChange={toggleActive}
          />

          <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink-900">Gerar novo link</p>
              <p className="text-xs text-ink-500">
                O endereço atual do candidato para de funcionar imediatamente. Os links pessoais
                dos integrantes continuam valendo.
              </p>
            </div>
            <Button
              variant="secondary"
              loading={working}
              onClick={() => setRotating(true)}
              className="shrink-0"
            >
              {!working ? <KeyRound aria-hidden="true" className="size-4" /> : null}
              Gerar novo token
            </Button>
          </div>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={rotating}
        title="Gerar novo link de convite"
        description="Um novo token será criado para este candidato."
        confirmLabel="Gerar novo link"
        tone="brand"
        onCancel={() => setRotating(false)}
        onConfirm={regenerate}
        details={
          <ul className="space-y-2 rounded-control bg-warning-50 p-3 text-sm text-warning-600">
            <li className="flex gap-2">
              <ShieldOff aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>Qualquer link já compartilhado deixará de funcionar.</span>
            </li>
            <li className="flex gap-2">
              <Link2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>Os integrantes já cadastrados são preservados.</span>
            </li>
          </ul>
        }
      />
    </div>
  );
}
