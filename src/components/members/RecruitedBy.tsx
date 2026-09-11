'use client';

import type { Recruiter } from '@/lib/types';
import { RECRUITED_BY_LABEL, recruiterText } from '@/lib/domain/recruitment';
import { initials } from '@/lib/utils/text';
import { cn } from '@/lib/utils/cn';

interface RecruitedByProps {
  recruiter: Recruiter | null;
  /** Mostra o rotulo "Cadastrado por" acima do nome. */
  withLabel?: boolean;
  className?: string;
}

/**
 * Origem do cadastro: foto, nome e perfil de quem cadastrou.
 *
 * O texto vem do snapshot gravado no cadastro, entao continua correto mesmo
 * depois que o usuario responsavel e excluido. Sem evidencia nenhuma, mostra
 * "Cadastro anterior ao rastreamento" em vez de atribuir a alguem.
 *
 * O bloco inteiro encolhe com `truncate`: no celular a informacao continua
 * visivel sem rolagem horizontal.
 */
export function RecruitedBy({ recruiter, withLabel = false, className }: RecruitedByProps) {
  const texto = recruiterText(recruiter);

  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      {recruiter ? (
        recruiter.photo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={recruiter.photo} alt="" className="size-5 shrink-0 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-[0.5rem] font-semibold text-ink-500"
          >
            {initials(recruiter.name)}
          </span>
        )
      ) : null}

      <span className="min-w-0">
        {withLabel ? (
          <span className="block text-[0.6875rem] text-ink-400">{RECRUITED_BY_LABEL}</span>
        ) : null}
        <span className="block truncate text-xs text-ink-500" title={texto}>
          {texto}
        </span>
      </span>
    </span>
  );
}
