'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  KeyRound,
  LogOut,
  Search,
  SearchX,
  ShieldCheck,
  ShieldOff,
  Users,
  X,
} from 'lucide-react';
import type {
  AccessStatus,
  CandidateWithoutAccess,
  GeneratedCredential,
  Role,
  SystemUser,
} from '@/lib/types';
import { ACCESS_STATUS_LABELS } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/permissions';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { useSession } from '@/components/layout/SessionProvider';
import { cn } from '@/lib/utils/cn';
import { formatDateTime } from '@/lib/utils/date';
import { initials, matchesSearch } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Menu } from '@/components/ui/Menu';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { CredentialsModal } from './CredentialsModal';

interface Payload {
  users: SystemUser[];
  pendingCandidates: CandidateWithoutAccess[];
}

interface GrantOutcome {
  credentials: GeneratedCredential[];
  conflicts: { clientId: string; name: string; email: string }[];
}

/** Linha da lista: usuario existente ou candidato ainda sem acesso. */
interface Row {
  key: string;
  userId: string | null;
  clientId: string | null;
  name: string;
  email: string;
  role: Role;
  status: AccessStatus;
  candidate: { id: string; name: string; photo: string | null } | null;
  photo: string | null;
  lastLoginAt: string | null;
  self: boolean;
}

const STATUS_CLASSES: Record<AccessStatus, string> = {
  ACTIVE: 'bg-success-50 text-success-600',
  PENDING: 'bg-warning-50 text-warning-600',
  DISABLED: 'bg-danger-50 text-danger-600',
};

/**
 * Configuracoes do sistema.
 *
 * Lista apenas ADMINs e candidatos com vinculo de acesso. Integrantes
 * cadastrados pelos links publicos nao tem login e nunca aparecem aqui.
 * Nenhum hash de senha chega ao navegador; a senha temporaria existe apenas
 * na resposta da acao e no modal, e some ao fechar.
 */
export function SettingsView() {
  const toast = useToast();
  const { user } = useSession();
  const loader = useCallback(() => api<Payload>('/api/usuarios'), []);
  const { data, loading, error, reload } = useRepositoryQuery<Payload>(loader);

  const [term, setTerm] = useState('');
  const [working, setWorking] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<GrantOutcome | null>(null);
  const [confirming, setConfirming] = useState<{ row: Row; action: 'disable' | 'revoke' } | null>(
    null,
  );

  const rows = useMemo<Row[]>(() => {
    const users = (data?.users ?? []).map((item) => ({
      key: `u-${item.id}`,
      userId: item.id,
      clientId: item.candidate?.id ?? null,
      name: item.name,
      email: item.email,
      role: item.role,
      status: item.status,
      candidate: item.candidate,
      photo: item.candidate?.photo ?? null,
      lastLoginAt: item.lastLoginAt,
      self: item.self,
    }));

    const pendentes = (data?.pendingCandidates ?? []).map((item) => ({
      key: `c-${item.clientId}`,
      userId: null,
      clientId: item.clientId,
      name: item.name,
      email: item.email,
      role: 'CANDIDATE' as Role,
      status: 'PENDING' as AccessStatus,
      candidate: { id: item.clientId, name: item.name, photo: item.photo },
      photo: item.photo,
      lastLoginAt: null,
      self: false,
    }));

    return [...users, ...pendentes];
  }, [data]);

  const filtered = useMemo(
    () => rows.filter((row) => matchesSearch(term, row.name, row.email, row.candidate?.name ?? '')),
    [rows, term],
  );

  const pendentes = useMemo(() => rows.filter((row) => row.status === 'PENDING').length, [rows]);

  async function run(key: string, action: () => Promise<void>) {
    if (working) return;
    setWorking(key);
    try {
      await action();
    } catch (failure) {
      toast.error(
        failure instanceof Error && failure.message
          ? failure.message
          : 'Não foi possível concluir a ação.',
      );
    } finally {
      setWorking(null);
      reload();
    }
  }

  function gerarPendentes() {
    void run('pendentes', async () => {
      const result = await api<GrantOutcome>('/api/usuarios', {
        method: 'POST',
        body: { action: 'grant-pending' },
      });
      setOutcome(result);
    });
  }

  function gerarAcesso(row: Row) {
    void run(row.key, async () => {
      const result = row.userId
        ? {
            credentials: [
              (
                await api<{ credential: GeneratedCredential }>(
                  `/api/usuarios/${row.userId}/senha`,
                  { method: 'POST' },
                )
              ).credential,
            ],
            conflicts: [],
          }
        : await api<GrantOutcome>('/api/usuarios', {
            method: 'POST',
            body: { action: 'grant', clientId: row.clientId },
          });

      setOutcome(result);
    });
  }

  function alterarAtivo(row: Row, isActive: boolean) {
    void run(row.key, async () => {
      await api(`/api/usuarios/${row.userId}`, { method: 'PATCH', body: { isActive } });
      toast.success(isActive ? 'Acesso ativado.' : 'Acesso desativado.');
    });
  }

  function revogar(row: Row) {
    void run(row.key, async () => {
      await api(`/api/usuarios/${row.userId}/sessoes`, { method: 'DELETE' });
      toast.success('Sessões encerradas.');
    });
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-[0.6875rem] font-semibold tracking-[0.14em] text-ink-500 uppercase">
          Administração
        </p>
        <h1 className="mt-1.5 text-2xl leading-tight font-bold tracking-tight text-ink-900 sm:text-[1.75rem]">
          Configurações
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Acessos do sistema: administradores e candidatos vinculados.
        </p>
      </header>

      <section
        aria-labelledby="usuarios-do-sistema"
        className="rounded-card border border-line bg-surface shadow-card"
      >
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2
              id="usuarios-do-sistema"
              className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink-900"
            >
              <Users aria-hidden="true" className="size-4 text-accent-600" />
              Usuários do sistema
            </h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Integrantes cadastrados pelos links de convite não possuem acesso e não aparecem
              aqui.
            </p>
          </div>

          {pendentes > 0 ? (
            <Button onClick={gerarPendentes} loading={working === 'pendentes'} className="shrink-0">
              {working !== 'pendentes' ? <KeyRound aria-hidden="true" className="size-4" /> : null}
              Gerar acessos pendentes
            </Button>
          ) : null}
        </div>

        <div className="border-b border-line p-3">
          <div className="relative flex items-center">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 size-4 text-ink-400"
            />
            <input
              id="busca-usuarios"
              type="search"
              value={term}
              aria-label="Buscar usuários por nome, e-mail ou candidato"
              placeholder="Buscar por nome, e-mail ou candidato"
              onChange={(event) => setTerm(event.target.value)}
              className="min-h-11 w-full rounded-control border border-line bg-surface pr-10 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
            />
            {term ? (
              <button
                type="button"
                onClick={() => setTerm('')}
                aria-label="Limpar busca"
                className="absolute right-1 flex size-9 items-center justify-center rounded-control text-ink-400 transition-colors hover:text-ink-900"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        {error ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <AlertTriangle aria-hidden="true" className="size-6 text-danger-600" />
            <p className="text-sm font-semibold text-danger-700">{error}</p>
            <Button variant="secondary" onClick={reload}>
              Tentar novamente
            </Button>
          </div>
        ) : loading ? (
          <ul className="space-y-2 p-4">
            {Array.from({ length: 4 }, (_, index) => (
              <li key={index}>
                <Skeleton className="h-16 rounded-control" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <EmptyState
            compact
            className="border-0 shadow-none"
            icon={<Users className="size-5" />}
            title="Nenhum usuário cadastrado"
            description="Cadastre um candidato para gerar o primeiro acesso."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            className="border-0 shadow-none"
            icon={<SearchX className="size-5" />}
            title="Nenhum resultado"
            description={`Nada encontrado para "${term}".`}
            action={
              <Button variant="secondary" onClick={() => setTerm('')}>
                Limpar busca
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((row) => (
              <li key={row.key} className="flex flex-wrap items-center gap-3 p-4">
                {row.photo ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={row.photo}
                    alt={`Foto de ${row.name}`}
                    className="size-10 shrink-0 rounded-full border border-line object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-500"
                  >
                    {initials(row.name)}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">
                    {row.name}
                    {row.self ? (
                      <span className="ml-1.5 text-[0.6875rem] font-medium text-ink-500">
                        (você)
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-ink-500">{row.email}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {ROLE_LABELS[row.role]}
                    {row.candidate ? ` · ${row.candidate.name}` : ''}
                  </p>
                </div>

                {/* No celular o estado desce para a segunda linha, para o
                    nome e o e-mail nao serem espremidos. */}
                <div className="order-last flex w-full flex-wrap items-center gap-x-2 gap-y-1 sm:order-none sm:w-auto sm:flex-col sm:items-end">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-pill px-2 py-1 text-[0.6875rem] font-medium whitespace-nowrap',
                      STATUS_CLASSES[row.status],
                    )}
                  >
                    {ACCESS_STATUS_LABELS[row.status]}
                  </span>
                  <span className="text-[0.6875rem] whitespace-nowrap text-ink-500">
                    {row.lastLoginAt ? `Último acesso: ${formatDateTime(row.lastLoginAt)}` : 'Nunca acessou'}
                  </span>
                </div>

                <Menu
                  label={`Ações de ${row.name}`}
                  actions={[
                    {
                      id: 'senha',
                      label: row.status === 'PENDING' ? 'Gerar acesso' : 'Gerar nova senha temporária',
                      icon: <KeyRound className="size-4" />,
                      disabled: row.self || working !== null,
                      onSelect: () => gerarAcesso(row),
                    },
                    {
                      id: 'ativo',
                      label: row.status === 'DISABLED' ? 'Ativar acesso' : 'Desativar acesso',
                      icon:
                        row.status === 'DISABLED' ? (
                          <ShieldCheck className="size-4" />
                        ) : (
                          <ShieldOff className="size-4" />
                        ),
                      disabled: row.self || !row.userId || working !== null,
                      onSelect: () =>
                        row.status === 'DISABLED'
                          ? alterarAtivo(row, true)
                          : setConfirming({ row, action: 'disable' }),
                    },
                    {
                      id: 'sessoes',
                      label: 'Revogar sessões',
                      icon: <LogOut className="size-4" />,
                      tone: 'danger',
                      disabled: row.self || !row.userId || working !== null,
                      onSelect: () => setConfirming({ row, action: 'revoke' }),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-ink-500">
        Conectado como {user?.email ?? '--'}. Sua própria conta não pode ser desativada nem ter as
        sessões revogadas por aqui.
      </p>

      <CredentialsModal
        open={outcome !== null}
        credentials={outcome?.credentials ?? []}
        conflicts={outcome?.conflicts ?? []}
        onClose={() => setOutcome(null)}
      />

      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.action === 'disable' ? 'Desativar acesso' : 'Revogar sessões'}
        description={
          confirming?.action === 'disable'
            ? `${confirming?.row.name ?? ''} não conseguirá entrar até que o acesso seja ativado novamente.`
            : `${confirming?.row.name ?? ''} precisará entrar de novo em todos os aparelhos.`
        }
        confirmLabel={confirming?.action === 'disable' ? 'Desativar' : 'Revogar'}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (!confirming) return;
          if (confirming.action === 'disable') alterarAtivo(confirming.row, false);
          else revogar(confirming.row);
          setConfirming(null);
        }}
      />
    </div>
  );
}
