import type { CSSProperties } from 'react';
import { Users } from 'lucide-react';
import { FotoDoCandidato } from '@/components/apuracao/FotoDoCandidato';
import { cn } from '@/lib/utils/cn';

/**
 * O rosto de cada barra: a foto oficial do candidato, com o anel na cor
 * dele, no comeco da barra dos votos dele — e o icone do time na barra da
 * estimativa. Bate o olho e sabe de quem e cada barra, sem ler a legenda.
 */
export function MarcaDaBarra({
  candidato,
  className,
}: {
  /** Ausente: a barra da estimativa (o time). */
  candidato?: { nome: string; cor: string; cargo?: number; foto?: string };
  className?: string;
}) {
  if (!candidato) {
    return (
      <span
        title="Estimativa do time"
        className={cn('flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-900 text-gold-400 ring-2 ring-navy-900/15', className)}
      >
        <Users aria-hidden="true" className="size-3.5" />
      </span>
    );
  }
  return (
    <span
      title={candidato.nome}
      className={cn('shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-surface', className)}
      style={{ '--tw-ring-color': candidato.cor } as CSSProperties}
    >
      <FotoDoCandidato cargo={candidato.cargo ?? 0} sqcand={null} src={candidato.foto} nome={candidato.nome} tamanho="xs" className="ring-0" />
    </span>
  );
}
