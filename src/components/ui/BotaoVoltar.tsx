'use client';

import { ArrowLeft } from 'lucide-react';

/**
 * O voltar das telas inteiras (votacao, raio-x, painel do Lider): vermelho,
 * para nao se perder no meio da tela — a seta num circulo branco, o destino
 * escrito ao lado ("Voltar · Mapa") e o atalho do teclado. No celular fica
 * so a seta.
 */
export function BotaoVoltar({ onClick, rotulo, disabled }: { onClick: () => void; rotulo: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Voltar: ${rotulo}`}
      className="group inline-flex min-h-11 shrink-0 items-center gap-2.5 rounded-pill bg-gradient-to-r from-danger-600 to-[#dc2626] py-1 pr-1 pl-1 text-left text-white shadow-[0_10px_24px_-10px_rgba(220,38,38,0.9)] ring-1 ring-white/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-10px_rgba(220,38,38,1)] focus-visible:ring-4 focus-visible:ring-danger-200 focus-visible:outline-none disabled:opacity-50 sm:pr-3.5"
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-white text-danger-600 shadow-card transition-transform duration-200 group-hover:-translate-x-0.5">
        <ArrowLeft aria-hidden="true" className="size-4.5" strokeWidth={2.75} />
      </span>
      <span className="hidden leading-tight sm:block">
        <span className="block text-[0.625rem] font-semibold tracking-[0.14em] text-white/75 uppercase">Voltar</span>
        <span className="block text-sm font-bold">{rotulo}</span>
      </span>
      <kbd className="ml-1 hidden rounded border border-white/30 bg-white/10 px-1.5 py-0.5 font-sans text-[0.625rem] font-semibold text-white/80 lg:inline">
        Esc
      </kbd>
    </button>
  );
}
