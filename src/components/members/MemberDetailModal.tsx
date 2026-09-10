'use client';

/* eslint-disable @next/next/no-img-element */
import { Pencil } from 'lucide-react';
import type { Client, Member } from '@/lib/types';
import { formatResponse, sortedFields } from '@/lib/validation/dynamic-form';
import { formatDateTime } from '@/lib/utils/date';
import { formatPhone } from '@/lib/utils/phone';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { MemberDeviceSection } from './MemberDeviceSection';

interface MemberDetailModalProps {
  open: boolean;
  client: Client;
  member: Member | null;
  onClose: () => void;
  onEdit: (member: Member) => void;
}

/** Ficha completa do integrante, incluindo as respostas personalizadas. */
export function MemberDetailModal({
  open,
  client,
  member,
  onClose,
  onEdit,
}: MemberDetailModalProps) {
  if (!member) return null;

  const custom = sortedFields(client.form).filter((field) => field.systemKey === null);
  const responses = new Map(member.responses.map((item) => [item.fieldId, item.value]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ficha do integrante"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={() => {
              onClose();
              onEdit(member);
            }}
          >
            <Pencil aria-hidden="true" className="size-4" />
            Editar
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {member.photo ? (
            <img
              src={member.photo}
              alt={`Foto de ${member.name}`}
              className="size-28 shrink-0 rounded-card border border-line object-cover"
            />
          ) : (
            <Avatar name={member.name} size="xl" className="rounded-card" />
          )}

          <div className="min-w-0">
            <h3 className="text-lg font-semibold break-words text-ink-900">{member.name}</h3>
            <p className="text-sm text-ink-500">
              {member.phone ? formatPhone(member.phone) : 'Sem telefone'}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={member.source === 'invite' ? 'brand' : 'neutral'}>
                {member.source === 'invite' ? 'Cadastro pelo link' : 'Cadastro pelo painel'}
              </Badge>
              {member.consentAt ? <Badge tone="success">Consentimento registrado</Badge> : null}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-3 rounded-control bg-ink-50 p-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-ink-500">Cadastrado em</dt>
            <dd className="font-medium break-words text-ink-900">
              {formatDateTime(member.createdAt)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-ink-500">Última atualização</dt>
            <dd className="font-medium break-words text-ink-900">
              {formatDateTime(member.updatedAt)}
            </dd>
          </div>
        </dl>

        <div>
          <h4 className="text-sm font-semibold text-ink-900">Respostas do formulário</h4>

          {custom.length === 0 ? (
            <p className="mt-2 text-sm text-ink-500">
              Este formulário ainda não possui campos personalizados.
            </p>
          ) : (
            <dl className="mt-2 divide-y divide-line">
              {custom.map((field) => (
                <div key={field.id} className="grid gap-1 py-2.5 sm:grid-cols-3 sm:gap-3">
                  <dt className="text-sm text-ink-500 sm:col-span-1">
                    {field.label}
                    {!field.enabled ? (
                      <span className="ml-1 text-xs text-ink-400">(desativado)</span>
                    ) : null}
                  </dt>
                  <dd className="text-sm break-words text-ink-900 sm:col-span-2">
                    {field.type === 'photo' && typeof responses.get(field.id) === 'string' ? (
                      <img
                        src={String(responses.get(field.id))}
                        alt={field.label}
                        className="max-h-40 rounded-control border border-line object-cover"
                      />
                    ) : (
                      formatResponse(field, responses.get(field.id) ?? null)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <MemberDeviceSection memberId={member.id} />
      </div>
    </Modal>
  );
}
