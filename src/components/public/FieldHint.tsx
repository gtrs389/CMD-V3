import { ArrowLeft, Check, Lock, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Aviso curto ao lado do rotulo, campo a campo.
 *
 * O formulario publico e preenchido na ordem, um campo por vez. Sem um aviso
 * em cada campo, quem preenche so descobre isso ao tentar clicar em algo que
 * nao responde — e conclui que a pagina esta quebrada.
 *
 * Entao cada campo diz, ali mesmo, o que se espera dele:
 *
 *   agora      e a vez deste campo. E o unico pedido ativo na tela;
 *   aguarde    ainda esta fechado, porque falta terminar o anterior;
 *   pronto     ja foi preenchido;
 *   opcional   esta aberto, mas ninguem precisa preencher;
 *   conferido  veio da consulta do titulo e nao se edita.
 *
 * O aviso e lido por tecnologia assistiva junto do rotulo: nao e so cor.
 */

export type FieldHintKind = 'agora' | 'aguarde' | 'pronto' | 'opcional' | 'conferido';

const HINTS: Record<
  FieldHintKind,
  { label: string; icon: typeof Check | null; className: string }
> = {
  agora: {
    label: 'Preencha este campo',
    icon: ArrowLeft,
    className: 'border-accent-200 bg-accent-50 text-accent-700',
  },
  aguarde: {
    label: 'Aguarde',
    icon: Lock,
    className: 'border-line bg-ink-50 text-ink-400',
  },
  pronto: {
    label: 'Pronto',
    icon: Check,
    className: 'border-success-200 bg-success-50 text-success-600',
  },
  // Sem icone: "opcional" e uma informacao, nao um pedido nem um estado
  // alcancado, e um simbolo ao lado daria peso que ela nao tem.
  opcional: {
    label: 'Opcional',
    icon: null,
    className: 'border-line bg-surface text-ink-400',
  },
  conferido: {
    label: 'Conferido',
    icon: ShieldCheck,
    className: 'border-line bg-ink-50 text-ink-500',
  },
};

export function FieldHint({ kind }: { kind: FieldHintKind }) {
  const { label, icon: Icon, className } = HINTS[kind];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap',
        className,
      )}
    >
      {/* A seta aponta para o campo — o pedido e deste aqui, e nao do
          proximo. Os demais estados usam o icone do proprio estado. */}
      {Icon ? <Icon aria-hidden="true" className="size-3" /> : null}
      {label}
    </span>
  );
}
