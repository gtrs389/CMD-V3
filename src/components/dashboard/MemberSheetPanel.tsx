'use client';

import { useCallback } from 'react';
import { UserRound, X } from 'lucide-react';
import type { Client, Member } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { MemberSheetBody } from '@/components/members/MemberDetailModal';

/**
 * Ficha completa NO LUGAR DO RANKING, na coluna lateral do mapa.
 *
 * Antes ela abria como dialogo por cima do mapa — e um dialogo sobre o mapa
 * cobre justamente o que a pessoa estava olhando: o pino que ela acabou de
 * clicar, os vizinhos dele, a escola aberta. A coluna lateral ja existe e ja
 * e o lugar da leitura auxiliar ("Onde você tem mais votos"); a ficha entra
 * ali, e fechar devolve o ranking. O mapa nao se mexe em momento nenhum.
 *
 * O mapa desenha pinos de varios times ao mesmo tempo e nao tem a lista da
 * equipe carregada, entao a ficha e pedida pelo identificador. O time vem na
 * mesma resposta porque e o formulario dele que da nome as respostas.
 *
 * Quem decide o alcance e o servidor: ADMIN chega em qualquer integrante, o
 * Administrador do time apenas nos do proprio time, e a EQUIPE somente em
 * quem se cadastrou pelo proprio link.
 */
interface MemberSheetPanelProps {
  memberId: string;
  onClose: () => void;
  className?: string;
}

interface Payload {
  member: Member;
  client: Client;
}

export function MemberSheetPanel({ memberId, onClose, className }: MemberSheetPanelProps) {
  const loader = useCallback(() => api<Payload>(`/api/members/${memberId}`), [memberId]);
  const { data, loading, error, reload } = useRepositoryQuery(loader);

  // A resposta anterior continua em memoria enquanto a nova nao chega: sem
  // conferir de quem ela e, abrir a segunda pessoa mostraria por um instante
  // a ficha da primeira.
  const pronta = data && data.member.id === memberId ? data : null;

  return (
    <div className={cn('flex min-h-0 flex-col bg-surface', className)}>
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <UserRound aria-hidden="true" className="size-4 text-brand-700" />
            Ficha do integrante
          </h3>
          <p className="mt-0.5 truncate text-xs text-ink-500">
            {pronta ? pronta.member.name : loading ? 'Carregando...' : 'Não foi possível abrir'}
          </p>
        </div>

        {/* Fechar devolve o ranking, com o mapa exatamente como estava. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar ficha e voltar ao ranking"
          className="tap flex shrink-0 items-center justify-center rounded-control text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {error ? (
          <div role="alert" className="space-y-3">
            <p className="text-sm text-danger-700">{error}</p>
            <Button variant="secondary" size="sm" onClick={reload}>
              Tentar novamente
            </Button>
          </div>
        ) : !pronta ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
          </div>
        ) : (
          // Editar continua sendo da pagina do time: o mapa e leitura, e
          // abrir um formulario aqui tiraria o mapa da tela de novo.
          <MemberSheetBody client={pronta.client} member={pronta.member} />
        )}
      </div>
    </div>
  );
}
