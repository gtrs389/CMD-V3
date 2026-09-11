'use client';

import { useCallback, useState } from 'react';
import { Clock, Save } from 'lucide-react';
import type { InviteExpirationSettings } from '@/lib/types';
import {
  fromSeconds,
  INVITE_UNITS,
  INVITE_UNIT_LABELS,
  isInviteUnit,
  maxAmountFor,
  type InviteUnit,
} from '@/lib/domain/invite-expiration';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

const NOTICE = 'A nova duração será aplicada aos próximos links gerados ou renovados.';

interface Draft {
  amount: string;
  unit: InviteUnit;
}

function toDraft(seconds: number): Draft {
  const { amount, unit } = fromSeconds(seconds);
  return { amount: String(amount), unit };
}

/**
 * Expiracao dos links, em Configuracoes.
 *
 * Somente o ADMIN ve e altera: as rotas exigem `settings.view` e
 * `settings.manage`. Sao duas configuracoes independentes — link do time
 * e link do membro da equipe — de 1 minuto a 365 dias. A conversao para
 * intervalo acontece no servidor, a partir do inteiro e da unidade escolhida
 * em uma lista fechada.
 *
 * O time e o integrante podem gerar ou renovar os proprios links, mas
 * nunca escolhem a duracao.
 */
export function InviteExpirationCard() {
  const toast = useToast();
  const loader = useCallback(
    () => api<{ expiration: InviteExpirationSettings }>('/api/configuracoes/links'),
    [],
  );
  const { data, loading, error, reload } = useRepositoryQuery(loader);

  const [draft, setDraft] = useState<{ candidate: Draft; team: Draft } | null>(null);
  const [saving, setSaving] = useState(false);

  const atual = data?.expiration;
  const valores =
    draft ??
    (atual
      ? { candidate: toDraft(atual.candidateSeconds), team: toDraft(atual.teamSeconds) }
      : null);

  function change(which: 'candidate' | 'team', patch: Partial<Draft>) {
    if (!valores) return;
    setDraft({ ...valores, [which]: { ...valores[which], ...patch } });
  }

  async function save() {
    if (!valores || saving) return;

    const candidateAmount = Number(valores.candidate.amount);
    const teamAmount = Number(valores.team.amount);

    if (!Number.isInteger(candidateAmount) || !Number.isInteger(teamAmount)) {
      toast.error('Informe apenas números inteiros.');
      return;
    }
    if (candidateAmount < 1 || teamAmount < 1) {
      toast.error('O prazo mínimo é de 1 minuto.');
      return;
    }
    if (
      candidateAmount > maxAmountFor(valores.candidate.unit) ||
      teamAmount > maxAmountFor(valores.team.unit)
    ) {
      toast.error('O prazo máximo é de 365 dias.');
      return;
    }

    setSaving(true);
    try {
      await api('/api/configuracoes/links', {
        method: 'PATCH',
        body: {
          candidate: { amount: candidateAmount, unit: valores.candidate.unit },
          team: { amount: teamAmount, unit: valores.team.unit },
        },
      });
      toast.success('Configurações salvas.');
      setDraft(null);
      reload();
    } catch (cause) {
      toast.error(
        cause instanceof Error && cause.message
          ? cause.message
          : 'Não foi possível salvar as configurações.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>
            <span className="flex items-center gap-2">
              <Clock aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
              Expiração dos links
            </span>
          </CardTitle>
          <CardDescription>
            Duração dos links de recrutamento, de 1 minuto até 365 dias. Só a administração define
            estes prazos; o time e o integrante podem gerar os próprios links, mas não a
            duração.
          </CardDescription>
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        {loading ? (
          <Skeleton className="h-28 w-full rounded-control" />
        ) : error ? (
          <div role="alert" className="space-y-3">
            <p className="text-sm text-danger-700">{error}</p>
            <Button variant="secondary" onClick={reload}>
              Tentar novamente
            </Button>
          </div>
        ) : valores ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <DurationField
                id="prazo-candidato"
                label="Link do time"
                value={valores.candidate}
                disabled={saving}
                onChange={(patch) => change('candidate', patch)}
              />
              <DurationField
                id="prazo-equipe"
                label="Link do membro da equipe"
                value={valores.team}
                disabled={saving}
                onChange={(patch) => change('team', patch)}
              />
            </div>

            <p className="rounded-control border border-line bg-ink-50 p-3 text-xs text-ink-700">
              {NOTICE}
            </p>

            <Button loading={saving} onClick={save}>
              {!saving ? <Save aria-hidden="true" className="size-4" /> : null}
              Salvar configurações
            </Button>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}

function DurationField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: Draft;
  disabled: boolean;
  onChange: (patch: Partial<Draft>) => void;
}) {
  return (
    <Field id={id} label={label}>
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={maxAmountFor(value.unit)}
          step={1}
          value={value.amount}
          disabled={disabled}
          className="max-w-28"
          onChange={(event) => onChange({ amount: event.target.value })}
        />

        <Select
          id={`${id}-unidade`}
          aria-label={`Unidade do prazo: ${label}`}
          value={value.unit}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            if (isInviteUnit(next)) onChange({ unit: next });
          }}
        >
          {INVITE_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {INVITE_UNIT_LABELS[unit]}
            </option>
          ))}
        </Select>
      </div>
    </Field>
  );
}
