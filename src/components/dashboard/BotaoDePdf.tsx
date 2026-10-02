'use client';

import { useState } from 'react';

/**
 * Botao de PDF dentro do balao: carrega so no clique, mostra o andamento, e
 * baixa o ARQUIVO (nao abre a janela de impressao).
 */
export function BotaoDePdf({
  onClick,
  rotulo,
  titulo,
  variante = 'contorno',
  disabled = false,
}: {
  onClick: () => Promise<void>;
  rotulo: string;
  titulo?: string;
  variante?: 'contorno' | 'cheio';
  disabled?: boolean;
}) {
  const [estado, setEstado] = useState<'parado' | 'montando' | 'pronto' | 'erro'>('parado');

  async function baixar() {
    if (estado === 'montando') return;
    setEstado('montando');
    try {
      await onClick();
      setEstado('pronto');
      window.setTimeout(() => setEstado('parado'), 1800);
    } catch {
      setEstado('erro');
      window.setTimeout(() => setEstado('parado'), 2500);
    }
  }

  return (
    <button
      type="button"
      title={titulo}
      disabled={disabled || estado === 'montando'}
      onClick={baixar}
      className={
        'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-control px-2.5 text-xs font-semibold whitespace-nowrap transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ' +
        (variante === 'cheio'
          ? 'bg-brand-700 text-white hover:bg-brand-800'
          : 'border border-brand-200 bg-surface text-brand-800 hover:border-brand-400 hover:bg-brand-50') +
        (estado === 'pronto' ? ' !border-success-600/40 !bg-success-50 !text-success-700' : '') +
        (estado === 'erro' ? ' !border-danger-200 !bg-danger-50 !text-danger-700' : '')
      }
    >
      {estado === 'montando' ? (
        <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {estado === 'pronto' ? <path d="M5 12l5 5L20 7" /> : <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />}
        </svg>
      )}
      {estado === 'montando' ? 'Montando...' : estado === 'pronto' ? 'Baixado' : estado === 'erro' ? 'Tente de novo' : rotulo}
    </button>
  );
}
