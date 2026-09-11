'use client';

import type { FieldOption, Member } from '@/lib/types';
import { RECRUITED_BY_LABEL } from '@/lib/domain/recruitment';
import { relationshipLabel } from '@/lib/domain/relationship';
import { formatDateTime } from '@/lib/utils/date';
import { formatPhone } from '@/lib/utils/phone';
import { initials } from '@/lib/utils/text';
import { Modal } from '@/components/ui/Modal';

interface TeamMemberSheetProps {
  open: boolean;
  member: Member | null;
  options: FieldOption[];
  onClose: () => void;
}

/**
 * Ficha basica de um recrutado direto.
 *
 * Traz somente o que o integrante precisa para falar com a pessoa que ele
 * mesmo cadastrou. Nada de sinais do aparelho, respostas privadas da
 * FonteData, verificacao cadastral ou mapa: essas rotas recusam o perfil
 * EQUIPE no servidor, e aqui elas nem existem.
 */
export function TeamMemberSheet({ open, member, options, onClose }: TeamMemberSheetProps) {
  if (!member) return null;

  const vinculo = relationshipLabel(options, member.relationshipOptionId, member.relationshipLabel);
  const local = [member.district, [member.city, member.state].filter(Boolean).join('/')]
    .filter(Boolean)
    .join(', ');

  return (
    <Modal open={open} onClose={onClose} title="Ficha do integrante">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {member.photo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={member.photo}
              alt={`Foto de ${member.name}`}
              className="size-16 shrink-0 rounded-card border border-line object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-16 shrink-0 items-center justify-center rounded-card border border-line bg-ink-100 text-lg font-semibold text-ink-500"
            >
              {initials(member.name)}
            </span>
          )}

          <div className="min-w-0">
            <h3 className="text-lg font-semibold break-words text-ink-900">{member.name}</h3>
            <p className="truncate text-sm text-ink-500">{member.email ?? 'Sem e-mail'}</p>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-3 rounded-control bg-ink-50 p-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-ink-500">Telefone</dt>
            <dd className="font-medium break-words text-ink-900">
              {member.phone ? formatPhone(member.phone) : '--'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-ink-500">Vínculo</dt>
            <dd className="font-medium break-words text-ink-900">{vinculo || '--'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-ink-500">Localização</dt>
            <dd className="font-medium break-words text-ink-900">{local || '--'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-ink-500">Cadastrado em</dt>
            <dd className="font-medium break-words text-ink-900">
              {formatDateTime(member.createdAt)}
            </dd>
          </div>
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-xs text-ink-500">{RECRUITED_BY_LABEL}</dt>
            <dd className="font-medium break-words text-ink-900">você</dd>
          </div>
        </dl>

        <p className="text-xs text-ink-500">
          Somente leitura. Alterações no cadastro são feitas por quem administra a candidatura.
        </p>
      </div>
    </Modal>
  );
}
