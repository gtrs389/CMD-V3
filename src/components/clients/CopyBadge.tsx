import { Copy } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Selo do time DUPLICADO (migration 049).
 *
 * A copia e um time de verdade em tudo — mesmas telas, mesmos servicos — e
 * tem os mesmos Lideres do oficial. Justamente por isso ela precisa se
 * anunciar: sem o selo, ninguem distingue, olhando a tela, a copia de ensaio
 * do time oficial.
 */
export function CopyBadge({
  className,
  sourceName,
}: { className?: string; sourceName?: string | null } = {}) {
  return (
    <span
      title={
        sourceName
          ? `Cópia de "${sourceName}". Fica fora da Visão geral e nada feito aqui altera o oficial.`
          : 'Time duplicado. Fica fora da Visão geral e nada feito aqui altera o oficial.'
      }
      className={cn(
        'inline-flex items-center gap-1 rounded-pill bg-accent-50 px-2 py-0.5 text-[0.6875rem] font-bold tracking-wide text-accent-600 uppercase',
        className,
      )}
    >
      <Copy aria-hidden="true" className="size-3" />
      Duplicado
    </span>
  );
}
