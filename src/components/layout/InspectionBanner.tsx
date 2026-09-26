'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Eye } from 'lucide-react';
import { DEFAULT_AUTHENTICATED_PATH } from '@/lib/auth/constants';
import { api } from '@/lib/repositories/http/api';
import { Button } from '@/components/ui/Button';
import { useSession } from './SessionProvider';

/**
 * Faixa fixa da inspecao: de quem e este painel.
 *
 * Aparece somente quando a sessao foi aberta pelo painel do ADMIN geral
 * (migration 045) — em qualquer outra, o componente nao desenha nada.
 *
 * Ela nao sai da tela ao rolar, e isso e o ponto: o que for feito aqui fica
 * gravado no nome da pessoa, e quem esta agindo precisa ver isso o tempo
 * todo. Uma faixa que rola para fora seria um aviso que so aparece quando
 * ja nao importa.
 */
export function InspectionBanner() {
  const router = useRouter();
  const { user } = useSession();
  const [saindo, setSaindo] = useState(false);

  if (!user?.impersonatedBy) return null;

  async function sair() {
    setSaindo(true);

    // Onde um endereco serve tudo, a sessao do ADMIN volta e ele cai no
    // painel dele. Onde os enderecos sao separados, a sessao dele nunca saiu
    // da outra aba: aqui fica so a saida.
    //
    // O destino e decidido mesmo se a resposta falhar: a rota troca o cookie
    // antes de qualquer erro de tela, e sair nao pode prender ninguem.
    const restored = await api<{ ok: true; restored: boolean }>('/api/inspecionar/sair', {
      method: 'POST',
    })
      .then((resposta) => resposta.restored)
      .catch(() => false);

    router.replace(restored ? DEFAULT_AUTHENTICATED_PATH : '/');
    // A sessao mudou: o que o servidor ja tinha desenhado nao vale mais.
    router.refresh();
  }

  return (
    <>
      {/* Espaco reservado no fluxo: a faixa nunca cobre o fim da pagina. */}
      <div aria-hidden="true" className="h-16" />

      <div className="safe-bottom safe-x fixed inset-x-0 bottom-0 z-50 border-t border-line-strong bg-warning-50/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[76rem] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
          <Eye aria-hidden="true" className="size-4 shrink-0 text-warning-600" />

          <p className="min-w-0 flex-1 text-sm text-warning-600">
            <span className="font-semibold">Você está no painel de {user.name}.</span>{' '}
            <span className="text-ink-700">
              Tudo o que for feito aqui fica registrado no nome dela.
            </span>
          </p>

          <Button variant="secondary" onClick={sair} disabled={saindo} className="shrink-0">
            {saindo ? 'Saindo…' : 'Sair da inspeção'}
          </Button>
        </div>
      </div>
    </>
  );
}
