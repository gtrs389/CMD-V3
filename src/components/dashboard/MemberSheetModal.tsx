'use client';

import { useCallback } from 'react';
import type { Client, Member } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { MemberDetailModal } from '@/components/members/MemberDetailModal';

/**
 * Ficha completa aberta SOBRE o mapa.
 *
 * Antes, "Ver ficha completa" levava para a pagina do time. Sair do mapa
 * custa caro: some a posicao, o zoom, o filtro e a escola que estava aberta,
 * e voltar significa reencontrar tudo aquilo na mao. A ficha e uma leitura
 * rapida no meio da analise, e nao um destino.
 *
 * O mapa desenha pinos de varios times ao mesmo tempo e nao tem a lista da
 * equipe carregada, entao a ficha e pedida pelo identificador. O time vem na
 * mesma resposta porque e o formulario dele que da nome as respostas.
 *
 * Quem decide o alcance e o servidor: ADMIN chega em qualquer integrante, o
 * Administrador do time apenas nos do proprio time, e a EQUIPE somente em
 * quem se cadastrou pelo proprio link.
 */
interface MemberSheetModalProps {
  memberId: string | null;
  onClose: () => void;
}

interface Payload {
  member: Member;
  client: Client;
}

export function MemberSheetModal({ memberId, onClose }: MemberSheetModalProps) {
  const loader = useCallback(
    () =>
      memberId
        ? api<Payload>(`/api/members/${memberId}`)
        : Promise.resolve<Payload | null>(null),
    [memberId],
  );
  const { data, loading, error, reload } = useRepositoryQuery(loader);

  if (!memberId) return null;

  // A resposta anterior continua em memoria enquanto a nova nao chega: sem
  // conferir de quem ela e, abrir a segunda pessoa mostraria por um instante
  // a ficha da primeira.
  const pronta = data && data.member.id === memberId ? data : null;

  // Carregando e falha usam um dialogo simples: a ficha de verdade so aparece
  // quando ha o que mostrar, sem um esqueleto com a moldura dela.
  if (loading || error || !pronta) {
    return (
      <Modal open onClose={onClose} size="md" title="Ficha do integrante">
        {error ? (
          <div role="alert" className="space-y-3">
            <p className="text-sm text-danger-700">{error}</p>
            <Button variant="secondary" size="sm" onClick={reload}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
          </div>
        )}
      </Modal>
    );
  }

  return (
    <MemberDetailModal
      open
      client={pronta.client}
      member={pronta.member}
      onClose={onClose}
      // Editar continua sendo da pagina do time: o mapa e leitura, e abrir um
      // formulario por cima dele so empilharia dialogo sobre dialogo.
      onEdit={undefined}
    />
  );
}
