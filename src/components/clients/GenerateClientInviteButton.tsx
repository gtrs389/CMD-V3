'use client';

import type { Client } from '@/lib/types';
import { clientRepository } from '@/lib/repositories';
import { GenerateLinkButton } from './GenerateLinkButton';

interface GenerateClientInviteButtonProps {
  client: Client;
}

/**
 * Botao "Gerar Link" do link do TIME inteiro (ADMIN).
 *
 * Gera um novo token e revoga o anterior na hora, igual ao botao pessoal —
 * so muda a origem do token. Ligar/desligar o recrutamento e ver o
 * historico continuam em "Configurações do link", porque não são geração.
 */
export function GenerateClientInviteButton({ client }: GenerateClientInviteButtonProps) {
  return (
    <GenerateLinkButton
      generate={async () => {
        const updated = await clientRepository.regenerateInviteToken(client.id);
        return updated.invite.token;
      }}
    />
  );
}
