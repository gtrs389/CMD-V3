'use client';

import { useCallback, useMemo, useState } from 'react';
import { History, SearchX } from 'lucide-react';
import type { InviteHistoryEntry } from '@/lib/types';
import { INVITE_STATE_LABELS, type InviteState } from '@/lib/domain/invite-expiration';
import { ROLE_LABELS } from '@/lib/permissions';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { cn } from '@/lib/utils/cn';
import { formatDateTime } from '@/lib/utils/date';
import { matchesSearch } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';

const STATE_CLASSES: Record<InviteState, string> = {
  ACTIVE: 'bg-success-50 text-success-600',
  CLAIMED: 'bg-accent-50 text-accent-700',
  SUBMITTING: 'bg-accent-50 text-accent-700',
  CONSUMED: 'bg-brand-50 text-brand-800',
  EXPIRED: 'bg-ink-100 text-ink-700',
  REVOKED: 'bg-danger-50 text-danger-600',
};

const STATES: readonly InviteState[] = [
  'ACTIVE',
  'CLAIMED',
  'CONSUMED',
  'EXPIRED',
  'REVOKED',
];

/**
 * Historico de links, em Configuracoes.
 *
 * Somente o ADMIN: a rota exige `settings.view`. CANDIDATE e EQUIPE veem
 * apenas o estado e o prazo do proprio link atual, no painel deles.
 *
 * A tabela mostra responsavel, perfil, time, geracao, primeiro acesso,
 * prazo, conclusao e estado. Nenhum token, segredo da reserva, senha, CPF,
 * IP ou identificador interno chega aqui.
 */
export function InviteHistoryCard() {
  const [role, setRole] = useState('todos');
  const [state, setState] = useState('todos');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [term, setTerm] = useState('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (role !== 'todos') params.set('perfil', role);
    if (state !== 'todos') params.set('status', state);
    // O recorte por periodo usa o dia inteiro, no fuso do navegador.
    if (from) params.set('de', new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set('ate', new Date(`${to}T23:59:59`).toISOString());
    return params.toString();
  }, [role, state, from, to]);

  const loader = useCallback(
    () =>
      api<{ history: InviteHistoryEntry[] }>(
        `/api/configuracoes/links/historico${query ? `?${query}` : ''}`,
      ),
    [query],
  );
  const { data, loading, error, reload } = useRepositoryQuery(loader);

  const rows = useMemo(() => {
    const list = data?.history ?? [];
    if (!term.trim()) return list;
    return list.filter((row) => matchesSearch(term, row.ownerName, row.candidateName));
  }, [data, term]);

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>
            <span className="flex items-center gap-2">
              <History aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
              Histórico de links
            </span>
          </CardTitle>
          <CardDescription>
            Cada link gerado, com o responsável, o prazo e o desfecho. Nenhum token, senha ou dado
            pessoal é guardado neste histórico.
          </CardDescription>
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="historico-responsavel" label="Responsável">
            <SearchInput
              id="historico-responsavel"
              value={term}
              onChange={setTerm}
              label="Filtrar por responsável ou time"
              placeholder="Nome do responsável"
            />
          </Field>

          <Field id="historico-perfil" label="Perfil">
            <Select
              id="historico-perfil"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="CANDIDATE">{ROLE_LABELS.CANDIDATE}</option>
              <option value="EQUIPE">{ROLE_LABELS.EQUIPE}</option>
            </Select>
          </Field>

          <Field id="historico-status" label="Status">
            <Select
              id="historico-status"
              value={state}
              onChange={(event) => setState(event.target.value)}
            >
              <option value="todos">Todos</option>
              {STATES.map((item) => (
                <option key={item} value={item}>
                  {INVITE_STATE_LABELS[item]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field id="historico-de" label="De">
              <Input
                id="historico-de"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field id="historico-ate" label="Até">
              <Input
                id="historico-ate"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </Field>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-40 w-full rounded-control" />
        ) : error ? (
          <div role="alert" className="space-y-3">
            <p className="text-sm text-danger-700">{error}</p>
            <Button variant="secondary" onClick={reload}>
              Tentar novamente
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            icon={<SearchX className="size-5" />}
            title="Nenhum link no filtro"
            description="Ajuste os filtros para ver outros períodos ou perfis."
          />
        ) : (
          <>
            {/* Tabela a partir de `lg`; em telas menores a mesma informação
                vira lista, sem rolagem horizontal na página. */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">Histórico de links de recrutamento</caption>
                <thead className="bg-ink-50 text-xs tracking-wide text-ink-500 uppercase">
                  <tr>
                    {[
                      'Responsável',
                      'Perfil',
                      'Time',
                      'Gerado em',
                      'Primeiro acesso',
                      'Expira em',
                      'Concluído em',
                      'Status',
                    ].map((coluna) => (
                      <th key={coluna} scope="col" className="px-3 py-2.5 font-medium">
                        {coluna}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr key={row.key}>
                      <td className="px-3 py-2.5 font-medium text-ink-900">{row.ownerName}</td>
                      <td className="px-3 py-2.5 text-ink-700">
                        {row.ownerRole ? ROLE_LABELS[row.ownerRole] : '--'}
                      </td>
                      <td className="px-3 py-2.5 text-ink-700">{row.candidateName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-ink-500">
                        {row.generatedAt ? formatDateTime(row.generatedAt) : '--'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-ink-500">
                        {row.firstAccessAt ? formatDateTime(row.firstAccessAt) : '--'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-ink-500">
                        {row.expiresAt ? formatDateTime(row.expiresAt) : '--'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-ink-500">
                        {row.consumedAt ? formatDateTime(row.consumedAt) : '--'}
                      </td>
                      <td className="px-3 py-2.5">
                        <StateBadge state={row.state} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="space-y-3 lg:hidden">
              {rows.map((row) => (
                <li key={row.key} className="rounded-control border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-900">{row.ownerName}</p>
                      <p className="truncate text-xs text-ink-500">
                        {row.ownerRole ? ROLE_LABELS[row.ownerRole] : '--'} · {row.candidateName}
                      </p>
                    </div>
                    <StateBadge state={row.state} />
                  </div>

                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    <Line label="Gerado em" value={row.generatedAt} />
                    <Line label="Primeiro acesso" value={row.firstAccessAt} />
                    <Line label="Expira em" value={row.expiresAt} />
                    <Line label="Concluído em" value={row.consumedAt} />
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function StateBadge({ state }: { state: InviteState }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-pill px-2 py-1 text-[0.6875rem] font-semibold whitespace-nowrap',
        STATE_CLASSES[state],
      )}
    >
      {INVITE_STATE_LABELS[state]}
    </span>
  );
}

function Line({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-500">{label}</dt>
      <dd className="font-medium text-ink-900">{value ? formatDateTime(value) : '--'}</dd>
    </div>
  );
}
