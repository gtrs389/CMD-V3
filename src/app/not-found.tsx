import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { appConfig } from '@/config/app.config';

export default function NotFound() {
  return (
    <main className="safe-x flex min-h-dvh items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-ink-100 text-ink-500"
        >
          <FileQuestion className="size-6" />
        </span>
        <h1 className="text-lg font-semibold text-ink-900">Pagina nao encontrada</h1>
        <p className="mt-2 text-sm text-ink-500">
          O endereco acessado nao existe ou foi alterado.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-control bg-brand-700 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-800"
        >
          Voltar para {appConfig.name}
        </Link>
      </div>
    </main>
  );
}
