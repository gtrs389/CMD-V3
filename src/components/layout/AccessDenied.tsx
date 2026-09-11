import Link from 'next/link';
import { ShieldOff } from 'lucide-react';

/**
 * Tela de acesso negado.
 *
 * Aparece quando a sessao existe, mas o registro pedido nao pertence a ela.
 * Nenhum dado do registro e carregado: as rotas de API respondem 403 para a
 * mesma tentativa.
 */
export function AccessDenied() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-card border border-line bg-surface px-5 py-12 text-center shadow-card">
      <span
        aria-hidden="true"
        className="mb-4 flex size-12 items-center justify-center rounded-full bg-danger-50 text-danger-600"
      >
        <ShieldOff className="size-6" />
      </span>

      <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-500 uppercase">
        Erro 403
      </p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink-900">Acesso negado</h1>
      <p className="mt-1 max-w-sm text-sm text-balance text-ink-500">
        Esta página pertence a outro time. Você só tem acesso ao seu próprio cadastro.
      </p>

      <Link
        href="/"
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-control bg-brand-700 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-800"
      >
        Voltar ao início
      </Link>
    </div>
  );
}
