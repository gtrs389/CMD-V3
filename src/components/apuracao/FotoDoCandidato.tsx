'use client';

import { useState } from 'react';
import type { SituacaoNaApuracao } from '@/lib/domain/apuracao';
import { cn } from '@/lib/utils/cn';

/**
 * Foto oficial do candidato (do TSE, pelo servidor), com o anel da
 * situacao: dourado para eleito, azul para 2o turno.
 *
 * Sem foto (ou se ela falhar), ficam as iniciais: o card nunca abre com um
 * buraco.
 */
const TAMANHOS = {
  xs: 'size-7 text-[0.625rem]',
  sm: 'size-9 text-xs',
  md: 'size-12 text-sm',
  lg: 'size-16 text-lg',
  xl: 'size-24 text-2xl',
} as const;

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-Z]/.test(p));
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
}

export function FotoDoCandidato({
  cargo,
  sqcand,
  nome,
  situacao,
  tamanho = 'md',
  src,
  className,
}: {
  cargo: number;
  sqcand: string | null;
  /** Endereco da foto pronto (pelo numero de urna), no lugar do sequencial. */
  src?: string;
  nome: string;
  situacao?: SituacaoNaApuracao;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  const [falhou, setFalhou] = useState(false);
  const anel =
    situacao === 'ELEITO'
      ? 'ring-[3px] ring-gold-500 ring-offset-2 ring-offset-surface'
      : situacao === 'SEGUNDO_TURNO'
        ? 'ring-[3px] ring-brand-600 ring-offset-2 ring-offset-surface'
        : 'ring-1 ring-line';

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-navy-700 to-brand-700 font-bold text-white',
        TAMANHOS[tamanho],
        anel,
        className,
      )}
    >
      <span aria-hidden="true">{iniciais(nome)}</span>
      {(src || sqcand) && !falhou ? (
        // A foto vem do TSE, pelo proprio servidor: next/image nao ajudaria aqui.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src ?? `/api/votacao/foto/${cargo}/${sqcand}`}
          alt={`Foto de ${nome}`}
          loading="lazy"
          onError={() => setFalhou(true)}
          className="absolute inset-0 size-full object-cover object-top"
        />
      ) : null}
    </span>
  );
}
