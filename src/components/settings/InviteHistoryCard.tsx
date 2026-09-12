'use client';

import { useCallback, useMemo, useState } from 'react';
import { Radar, SearchX } from 'lucide-react';
import type { InviteTrackingEntry } from '@/lib/types';
import type { InviteState } from '@/lib/domain/invite-expiration';
import {
  INVITE_TRACKING_STATES,
  formatDuration,
  trackingLabel,
} from '@/lib/domain/invite-tracking';
import { ROLE_LABELS } from '@/lib/permissions';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { cn } from '@/lib/utils/cn';
import { formatDateTime } from '@/lib/utils/date';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { InviteTrackingDetail } from './InviteTrackingDetail';

const STATE_CLASSES: Record<InviteState, string> = {
  ACTIVE: 'bg-success-50 text-success-600',
  CLAIMED: 'bg-accent-50 text-accent-700',
  SUBMITTING: 'bg-accent-50 text-accent-700',
  CONSUMED: 'bg-brand-50 text-brand-800',
  EXPIRED: 'bg-ink-100 text-ink-700',
  REVOKED: 'bg-danger-50 text-danger-600',
};

const COLUNAS = [
  'Dono do link',
  'Perfil',
  'Time',
  'Gerado por',
  'Gerado em',
  'Primeiro acesso',
  'Concluído em',
  'Tempo para abrir',
  'Tempo para concluir',
  'Status',
];

const TODOS = 'todos';

/**
 * Rastreamento dos links de recrutamento, em Configuracoes.
 *
 * EXCLUSIVO do ADMIN geral: a rota exige `settings.view` E o perfil ADMIN.
 * Administrador do time e integrante EQUIPE recebem 403, inclusive para o
 * proprio link — o que nao muda nada na capacidade deles de gerar e copiar o
 * link que usam para cadastrar pessoas.
 *
 * A tabela mostra dono, perfil, time, quem gerou, os tres instantes do
 * ciclo, os tempos entre eles e o estado. Clicar na linha abre o detalhe com
 * origem, linha do tempo, aparelho do primeiro acesso e a pessoa cadastrada.
 *
 * Nenhum token, URL de convite, hash de token, hash de IP, segredo da
 * reserva, CPF, titulo de eleitor ou dado de consulta cadastral chega aqui.
 */
export function InviteHistoryCard() {
  const [client, setClient] = useState(TODOS);
  const [owner, setOwner] = useState(TODOS);
  const [role, setRole] = useState(TODOS);
  const [generatedBy, setGeneratedBy] = useState(TODOS);
  const [state, setState] = useState(TODOS);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [aberto, setAberto] = useState<InviteTrackingEntry | null>(null);

  // Time, perfil, status e periodo sao resolvidos no servidor; dono e gerador
  // ficam no navegador porque as opcoes saem da propria lista carregada.
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (client !== TODOS) params.set('time', client);
    if (role !== TODOS) params.set('perfil', role);
    if (state !== TODOS) params.set('status', state);
    // O recorte por periodo usa o dia inteiro, no fuso do navegador.
    if (from) params.set('de', new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set('ate', new Date(`${to}T23:59:59`).toISOString());
    return params.toString();
  }, [client, role, state, from, to]);

  const loader = useCallback(
    () =>
      api<{ history: InviteTrackingEntry[] }>(
        `/api/configuracoes/links/historico${query ? `?${query}` : ''}`,
      ),
    [query],
  );
  const { data, loading, error, reload } = useRepositoryQuery(loader);

  const todos = useMemo(() => data?.history ?? [], [data]);

  const times = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const row of todos) if (row.clientId) mapa.set(row.clientId, row.clientName);
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [todos]);

  const donos = useMemo(
    () => [...new Set(todos.map((row) => row.ownerName))].sort((a, b) => a.localeCompare(b)),
    [todos],
  );

  const geradores = useMemo(
    () => [...new Set(todos.map((row) => row.generatedByName))].sort((a, b) => a.localeCompare(b)),
    [todos],
  );

  const rows = useMemo(
    () =>
      todos.filter((row) => {
        if (owner !== TODOS && row.ownerName !== owner) return false;
        if (generatedBy !== TODOS && row.generatedByName !== generatedBy) return false;
        return true;
      }),
    [todos, owner, generatedBy],
  );

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>
            <span className="flex items-center gap-2">
              <Radar aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
              Rastreamento de links
            </span>
          </CardTitle>
          <CardDescription>
            Cada link de cadastro gerado, com o dono, quem gerou, o primeiro acesso, o aparelho e o
            tempo até a conclusão. Nenhum token, endereço do link ou documento aparece aqui.
          </CardDescription>
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="rastreio-time" label="Time">
            <Select
              id="rastreio-time"
              value={client}
              onChange={(event) => setClient(event.target.value)}
            >
              <option value={TODOS}>Todos</option>
              {times.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="rastreio-dono" label="Dono do link">
            <Select
              id="rastreio-dono"
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            >
              <option value={TODOS}>Todos</option>
              {donos.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="rastreio-perfil" label="Perfil">
            <Select
              id="rastreio-perfil"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value={TODOS}>Todos</option>
              <option value="CANDIDATE">{ROLE_LABELS.CANDIDATE}</option>
              <option value="EQUIPE">{ROLE_LABELS.EQUIPE}</option>
            </Select>
          </Field>

          <Field id="rastreio-gerador" label="Gerado por">
            <Select
              id="rastreio-gerador"
              value={generatedBy}
              onChange={(event) => setGeneratedBy(event.target.value)}
            >
              <option value={TODOS}>Todos</option>
              {geradores.map((nome) => (
                <option key={nome} value={nome}>
                  {nome}
                </option>
              ))}
            </Select>
          </Field>

          <Field id="rastreio-status" label="Status">
            <Select
              id="rastreio-status"
              value={state}
              onChange={(event) => setState(event.target.value)}
            >
              <option value={TODOS}>Todos</option>
              {INVITE_TRACKING_STATES.map((item) => (
                <option key={item} value={item}>
                  {trackingLabel(item)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field id="rastreio-de" label="De">
              <Input
                id="rastreio-de"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field id="rastreio-ate" label="Até">
              <Input
                id="rastreio-ate"
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
            description="Ajuste os filtros para ver outros períodos, times ou perfis."
          />
        ) : (
          <>
            {/* Tabela a partir de `lg`; em telas menores a mesma informação
                vira lista, sem rolagem horizontal na página. */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="sr-only">
                  Rastreamento dos links de recrutamento. Clique em uma linha para ver o detalhe.
                </caption>
                <thead className="bg-ink-50 text-xs tracking-wide text-ink-500 uppercase">
                  <tr>
                    {COLUNAS.map((coluna) => (
                      <th key={coluna} scope="col" className="px-3 py-2.5 font-medium">
                        {coluna}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr
                      key={row.key}
                      tabIndex={0}
                      role="button"
                      onClick={() => setAberto(row)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setAberto(row);
                        }
                      }}
                      className="cursor-pointer transition-colors hover:bg-ink-50 focus:bg-ink-50 focus:outline-none"
                    >
                      <td className="px-3 py-2.5 font-medium text-ink-900">{row.ownerName}</td>
                      <td className="px-3 py-2.5 text-ink-700">
                        {row.ownerRole ? ROLE_LABELS[row.ownerRole] : '--'}
                      </td>
                      <td className="px-3 py-2.5 text-ink-700">{row.clientName}</td>
                      <td className="px-3 py-2.5 text-ink-700">{row.generatedByName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-ink-500">
                        {row.generatedAt ? formatDateTime(row.generatedAt) : '--'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-ink-500">
                        {row.firstAccessAt ? formatDateTime(row.firstAccessAt) : '--'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-ink-500">
                        {row.consumedAt ? formatDateTime(row.consumedAt) : '--'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-ink-500">
                        {formatDuration(row.msToFirstAccess)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-ink-500">
                        {formatDuration(row.msToConsume)}
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
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => setAberto(row)}
                    className="w-full rounded-control border border-line p-3 text-left transition-colors hover:bg-ink-50"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900">
                          {row.ownerName}
                        </p>
                        <p className="truncate text-xs text-ink-500">
                          {row.ownerRole ? ROLE_LABELS[row.ownerRole] : '--'} · {row.clientName}
                        </p>
                      </div>
                      <StateBadge state={row.state} />
                    </div>

                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <Line label="Gerado por" value={row.generatedByName} />
                      <Line
                        label="Gerado em"
                        value={row.generatedAt ? formatDateTime(row.generatedAt) : '--'}
                      />
                      <Line
                        label="Primeiro acesso"
                        value={row.firstAccessAt ? formatDateTime(row.firstAccessAt) : '--'}
                      />
                      <Line
                        label="Concluído em"
                        value={row.consumedAt ? formatDateTime(row.consumedAt) : '--'}
                      />
                      <Line label="Tempo para abrir" value={formatDuration(row.msToFirstAccess)} />
                      <Line
                        label="Tempo para concluir"
                        value={formatDuration(row.msToConsume)}
                      />
                    </dl>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardBody>

      <InviteTrackingDetail entry={aberto} onClose={() => setAberto(null)} />
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
      {trackingLabel(state)}
    </span>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-500">{label}</dt>
      <dd className="truncate font-medium text-ink-900">{value}</dd>
    </div>
  );
}
