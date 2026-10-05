'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { BotaoDePdf } from '../BotaoDePdf';

export interface OpcaoDoPdf {
  rotulo: string;
  /** Linha de baixo: o que vem no arquivo. */
  detalhe?: string;
  onClick: () => Promise<void>;
}

/**
 * O PDF do relatorio: com um candidato, um botao so; com varios, um menu —
 * cada candidato sozinho, ou todos juntos no mesmo arquivo.
 */
export function MenuDoPdf({ opcoes, rotulo, titulo }: { opcoes: OpcaoDoPdf[]; rotulo: string; titulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  if (opcoes.length === 1) return <BotaoDePdf onClick={opcoes[0].onClick} rotulo={rotulo} titulo={titulo} variante="cheio" />;

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        title={titulo}
        onClick={() => setAberto((a) => !a)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-control bg-brand-700 px-2.5 text-xs font-semibold whitespace-nowrap text-white transition-colors hover:bg-brand-800"
      >
        <FileDown aria-hidden="true" className="size-3.5" />
        {rotulo}
        <ChevronDown aria-hidden="true" className={cn('size-3.5 transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto ? (
        <div
          role="menu"
          className="absolute right-0 z-[1200] mt-1.5 w-80 max-w-[calc(100vw-2rem)] animate-scale-in space-y-1 rounded-card border border-line bg-surface p-2 shadow-overlay"
        >
          {opcoes.map((o) => (
            <div key={o.rotulo} role="menuitem" className="flex items-center justify-between gap-3 rounded-control px-2 py-1.5 hover:bg-ink-50">
              <span className="min-w-0">
                <span className="block wrap-break-word text-sm font-semibold text-ink-900">{o.rotulo}</span>
                {o.detalhe ? <span className="block text-[0.6875rem] text-ink-500">{o.detalhe}</span> : null}
              </span>
              <BotaoDePdf onClick={o.onClick} rotulo="Baixar" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
