'use client';

import { useOwnInviteRenewal } from '@/hooks/use-own-invite';
import { GenerateLinkButton } from './GenerateLinkButton';

/**
 * Botao "Gerar Link" do PROPRIO link de recrutamento (time e equipe).
 * A geracao e a copia ficam por conta do `GenerateLinkButton`.
 */
export function GenerateInviteButton({ label }: { label?: string } = {}) {
  const { renew } = useOwnInviteRenewal();

  return (
    <GenerateLinkButton
      label={label}
      generate={async () => {
        const issued = await renew();
        return issued ? { token: issued.token, url: issued.url } : null;
      }}
    />
  );
}
