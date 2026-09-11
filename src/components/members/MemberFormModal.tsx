'use client';

import { useEffect } from 'react';
import type { Client, Member } from '@/lib/types';
import { memberRepository } from '@/lib/repositories';
import { NetworkError } from '@/lib/repositories';
import {
  CONSENT_KEY,
  toSubmission,
  valuesFromMember,
  visibleFields,
} from '@/lib/validation/dynamic-form';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { DynamicFieldInput } from '@/components/form-renderer/DynamicFieldInput';
import { LocationProvider } from '@/components/form-renderer/location-context';
import { useDynamicForm } from '@/components/form-renderer/use-dynamic-form';

interface MemberFormModalProps {
  open: boolean;
  client: Client;
  member: Member | null;
  onClose: () => void;
}

/**
 * Edicao de integrante pelo painel.
 * Usa o mesmo formulario configurado para o link publico.
 */
export function MemberFormModal({ open, client, member, onClose }: MemberFormModalProps) {
  const toast = useToast();
  const form = useDynamicForm(client.form);
  const fields = visibleFields(client.form);
  const { privacy } = client.form;

  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset(member ? valuesFromMember(client.form, member) : undefined);
  }, [open, member, client.form, reset]);

  async function handleSubmit() {
    const values = form.validate();
    if (!values) {
      toast.error('Revise os campos destacados.');
      return;
    }

    const payload = toSubmission(client.form, values);

    try {
      if (member) {
        await memberRepository.update(member.id, {
          name: payload.name,
          phone: payload.phone,
          photo: payload.photo,
          gender: payload.gender,
          cpf: payload.cpf,
          voterId: payload.voterId,
          zone: payload.zone,
          section: payload.section,
          state: payload.state,
          city: payload.city,
          district: payload.district,
        relationshipOptionId: payload.relationshipOptionId,
          relationshipLabel: payload.relationshipLabel,
          responses: payload.responses,
          consentAt: payload.consentAt ?? member.consentAt,
        });
        toast.success('Integrante atualizado.');
      } else {
        await memberRepository.create({
          clientId: client.id,
          name: payload.name,
          phone: payload.phone,
          photo: payload.photo,
          gender: payload.gender,
          cpf: payload.cpf,
          voterId: payload.voterId,
          zone: payload.zone,
          section: payload.section,
          state: payload.state,
          city: payload.city,
          district: payload.district,
        relationshipOptionId: payload.relationshipOptionId,
          relationshipLabel: payload.relationshipLabel,
          responses: payload.responses,
          consentAt: payload.consentAt,
          source: 'admin',
        });
        toast.success('Integrante cadastrado.');
      }
      onClose();
    } catch (error) {
      if (error instanceof NetworkError) {
        toast.error(error.message);
        return;
      }
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível salvar o integrante.',
      );
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={member ? 'Editar integrante' : 'Novo integrante'}
      description={
        member
          ? 'Atualize os dados cadastrados pela pessoa.'
          : 'Cadastro manual, com os mesmos campos do formulário público.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>{member ? 'Salvar alterações' : 'Cadastrar'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <LocationProvider fields={fields} values={form.values} setValue={form.setValue}>
          {fields.map((field) => (
            <DynamicFieldInput
              key={field.id}
              field={field}
              idPrefix="integrante"
              value={form.values[field.id] ?? null}
              error={form.errors[field.id]}
              onChange={(value) => form.setValue(field.id, value)}
              onImageError={(message) => toast.error(message)}
            />
          ))}
        </LocationProvider>

        {privacy.enabled && privacy.requireConsent ? (
          <Checkbox
            id="integrante-consentimento"
            label={privacy.consentLabel}
            checked={form.values[CONSENT_KEY] === true}
            onChange={(event) => form.setValue(CONSENT_KEY, event.target.checked)}
          />
        ) : null}

        {form.errors[CONSENT_KEY] ? (
          <p role="alert" className="text-xs font-medium text-danger-600">
            {form.errors[CONSENT_KEY]}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
