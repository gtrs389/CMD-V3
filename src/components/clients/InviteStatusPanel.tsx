'use client';

import { Link2 } from 'lucide-react';
import type { Client } from '@/lib/types';
import { formatDateTime } from '@/lib/utils/date';
import { invitePath } from '@/lib/utils/url';
import { useOrigin } from '@/hooks/use-origin';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { CopyField } from '@/components/common/CopyField';

/**
 * Situacao do link em modo leitura, com a copia do proprio endereco.
 *
 * Usado pelo candidato e pelo integrante da equipe: cada um copia e
 * compartilha somente o link que o servidor devolveu para ele. Ativar,
 * desativar, renovar e editar o formulario continuam sendo da administracao,
 * e as rotas correspondentes recusam estes perfis.
 *
 * O endereco vem do banco a cada carregamento, entao continua o mesmo depois
 * de sair, entrar de novo, trocar de aparelho ou recarregar. Abrir esta tela
 * nao gera, renova nem invalida token.
 */
export function InviteStatusPanel({ client }: { client: Client }) {
  const origin = useOrigin();

  const path = client.invite.token ? invitePath(client.invite.token) : null;
  // A origem so existe no navegador; ate hidratar, mostramos o caminho relativo.
  const url = path ? (origin ? `${origin}${path}` : path) : '';

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Meu link de cadastro</CardTitle>
          <CardDescription>
            Envie este endereço para quem você quer cadastrar. Ele contém apenas um identificador
            aleatório, sem nenhum dado pessoal, e continua o mesmo depois de sair, entrar de novo,
            trocar de aparelho ou recarregar a página.
          </CardDescription>
        </div>
        <Badge tone={client.invite.active ? 'success' : 'neutral'}>
          {client.invite.active ? 'Link ativo' : 'Link desativado'}
        </Badge>
      </CardHeader>

      <CardBody className="space-y-3">
        {path ? (
          <CopyField value={url} label="Meu link de cadastro" actionLabel="Copiar link" />
        ) : (
          <p className="rounded-control border border-line bg-ink-50 p-3 text-xs text-ink-500">
            Link ainda não disponível. Peça à administração do CMD para gerá-lo.
          </p>
        )}

        <p className="flex items-start gap-2 rounded-control border border-line bg-ink-50 p-3 text-sm text-ink-700">
          <Link2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-700" />
          <span className="min-w-0">
            {client.invite.active
              ? 'Quem se cadastrar por este link entra na sua equipe e recebe o próprio acesso ao sistema.'
              : 'O recrutamento está desativado pela administração: nenhum link aceita cadastros no momento.'}
          </span>
        </p>

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
  );
}
