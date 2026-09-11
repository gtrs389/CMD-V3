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
  Smartphone,
  Users,
  X,
} from 'lucide-react';
import type {
  AccessStatus,
  AdminDeviceInfo,
  CandidateWithoutAdmins,
  GeneratedCredential,
  MemberWithoutAccess,
  Recruiter,
  Role,
  SystemUser,
} from '@/lib/types';
import { ACCESS_STATUS_LABELS } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/permissions';
import { RECRUITED_BY_LABEL, recruiterText } from '@/lib/domain/recruitment';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { useSession } from '@/components/layout/SessionProvider';
import { cn } from '@/lib/utils/cn';
import { formatDateTime } from '@/lib/utils/date';
import { formatPhone } from '@/lib/utils/phone';
import { initials, matchesSearch } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Menu } from '@/components/ui/Menu';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { CredentialsModal } from './CredentialsModal';
import { InviteExpirationCard } from './InviteExpirationCard';
import { InviteHistoryCard } from './InviteHistoryCard';

interface Payload {
  users: SystemUser[];
  teamsWithoutAdmins: CandidateWithoutAdmins[];
  pendingMembers: MemberWithoutAccess[];
}

/** Linha da lista: usuario existente, time ou integrante sem acesso. */
interface Row {
  key: string;
  userId: string | null;
  clientId: string | null;
  memberId: string | null;
  name: string;
  /** Contato exibido: telefone de acesso, ou e-mail no ADMIN geral. */
  contact: string;
  /**
   * Entra por link do time + telefone, nunca por senha: Administrador do
   * time e membro da equipe. E quem tem aparelho vinculado.
   */
  phoneAccess: boolean;
  /** Aparelho autorizado. Nulo enquanto nenhum navegador foi vinculado. */
  device: AdminDeviceInfo | null;
  role: Role;
  status: AccessStatus;
  candidate: { id: string; name: string; photo: string | null } | null;
  /** Responsavel pelo cadastro. Preenchido nos integrantes. */
  recruitedBy: Recruiter | null;
  photo: string | null;
  lastLoginAt: string | null;
  self: boolean;
}

const STATUS_CLASSES: Record<AccessStatus, string> = {
  ACTIVE: 'bg-success-50 text-success-600',
  PENDING: 'bg-warning-50 text-warning-600',
  DISABLED: 'bg-danger-50 text-danger-600',
  NO_PHONE: 'bg-ink-100 text-ink-700',
  DUPLICATE_PHONE: 'bg-warning-50 text-warning-600',
};

/**
 * Configuracoes do sistema.
 *
 * Lista ADMINs, Administradores do time e membros da equipe, com foto, nome,
 * telefone, time, responsavel pelo cadastro, estado do acesso e estado do
 * aparelho autorizado. Nenhum hash de senha ou de credencial de aparelho
 * chega ao navegador; a senha temporaria do ADMIN geral existe apenas na
 * resposta da acao e no modal, e some ao fechar.
 */
export function SettingsView() {
  const toast = useToast();
  const { user } = useSession();
  const loader = useCallback(() => api<Payload>('/api/usuarios'), []);
  const { data, loading, error, reload } = useRepositoryQuery<Payload>(loader);

  const [term, setTerm] = useState('');
  const [working, setWorking] = useState<string | null>(null);
  const [credential, setCredential] = useState<GeneratedCredential | null>(null);
  const [confirming, setConfirming] = useState<{
    row: Row;
    action: 'disable' | 'revoke' | 'device';
  } | null>(null);

  const rows = useMemo<Row[]>(() => {
    const users = (data?.users ?? []).map((item) => ({
      key: `u-${item.id}`,
      userId: item.id,
      clientId: item.candidate?.id ?? null,
      memberId: item.memberId,
      name: item.name,
      // Somente o ADMIN geral tem e-mail: nos outros perfis o contato e o
      // telefone com que a pessoa entra, junto do link do time.
      contact:
        item.role === 'ADMIN' ? (item.email ?? '--') : formatPhone(item.phone ?? '') || '--',
      phoneAccess: item.role !== 'ADMIN',
      device: item.device,
      role: item.role,
      status: item.status,
      candidate: item.candidate,
      recruitedBy: item.recruitedBy,
      photo: item.photo ?? item.candidate?.photo ?? null,
      lastLoginAt: item.lastLoginAt,
      self: item.self,
    }));

    // Time sem nenhum administrador: ninguem consegue entrar nele ainda.
    const times = (data?.teamsWithoutAdmins ?? []).map((item) => ({
      key: `c-${item.clientId}`,
      userId: null,
      clientId: item.clientId,
      memberId: null,
      name: item.name,
      contact: 'Nenhum administrador cadastrado',
      phoneAccess: true,
      device: null,
      role: 'CANDIDATE' as Role,
      status: 'PENDING' as AccessStatus,
      candidate: { id: item.clientId, name: item.name, photo: item.photo },
      recruitedBy: null,
      photo: item.photo,
      lastLoginAt: null,
      self: false,
    }));

    // Integrante ainda sem acesso liberado: falta telefone, ou o numero se
    // repete dentro do time. Corrigido o telefone no cadastro do integrante,
    // o acesso e criado ou liberado sozinho — nao ha acao a executar aqui.
    const integrantes = (data?.pendingMembers ?? []).map((item) => ({
      key: `m-${item.memberId}`,
      userId: null,
      clientId: item.clientId,
      memberId: item.memberId,
      name: item.name,
      contact: formatPhone(item.phone ?? '') || '--',
      phoneAccess: true,
      device: null,
      role: 'EQUIPE' as Role,
      status: item.status,
      candidate: { id: item.clientId, name: item.candidateName, photo: null },
      recruitedBy: item.recruitedBy,
      photo: item.photo,
      lastLoginAt: null,
      self: false,
    }));

    return [...users, ...times, ...integrantes];
  }, [data]);

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesSearch(
          term,
          row.name,
          row.contact,
          row.candidate?.name ?? '',
          ROLE_LABELS[row.role],
          recruiterText(row.recruitedBy),
        ),
      ),
    [rows, term],
  );

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

  /**
   * Nova senha temporaria do ADMIN geral.
   *
   * Nenhum outro perfil passa por aqui: o Administrador do time e o membro
   * da equipe nao tem senha, nem visivel nem oculta — entram com o link do
   * time e o proprio telefone. A rota recusa de novo, do lado do servidor.
   */
  function redefinirSenha(row: Row) {
    if (row.phoneAccess || !row.userId) return;

    void run(row.key, async () => {
      const { credential: gerada } = await api<{ credential: GeneratedCredential }>(
        `/api/usuarios/${row.userId}/senha`,
        { method: 'POST' },
      );
      setCredential(gerada);
    });
  }

  function alterarAtivo(row: Row, isActive: boolean) {
    void run(row.key, async () => {
      await api(`/api/usuarios/${row.userId}`, { method: 'PATCH', body: { isActive } });
      toast.success(isActive ? 'Acesso ativado.' : 'Acesso desativado.');
    });
  }

  /**
   * Libera um novo aparelho.
   *
   * Vale para o Administrador do time e para o membro da equipe. O aparelho
   * atual e revogado e as sessoes daquele usuario caem. Telefone, nome, foto,
   * time e link nao mudam: o proximo acesso correto vincula o navegador novo.
   * Exclusivo do ADMIN geral — a rota confere de novo.
   */
  function liberarAparelho(row: Row) {
    void run(row.key, async () => {
      await api(`/api/usuarios/${row.userId}/aparelho`, { method: 'DELETE' });
      toast.success('Aparelho liberado. O próximo acesso vinculará um novo.');
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
          Acessos do sistema, prazo dos links de recrutamento e histórico dos links.
        </p>
      </header>

      {/* Duracao dos links e historico: exclusivos do ADMIN, como o resto
          desta pagina. As rotas exigem `settings.view` e `settings.manage`. */}
      <InviteExpirationCard />

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
              Administradores do time e membros da equipe entram com o link do time e o próprio
              telefone, sem e-mail e sem senha. Quem está sem telefone fica em &quot;
              {ACCESS_STATUS_LABELS.NO_PHONE}&quot;, e o telefone repetido dentro do time bloqueia
              o acesso até ser corrigido no cadastro da pessoa.
            </p>
          </div>
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
              aria-label="Buscar usuários por nome, telefone, perfil, time ou responsável"
              placeholder="Buscar por nome, telefone, perfil, time ou responsável"
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
            description="Cadastre um time para gerar o primeiro acesso."
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
                  <p className="truncate text-xs text-ink-500">{row.contact}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {ROLE_LABELS[row.role]}
                    {row.candidate ? ` · ${row.candidate.name}` : ''}
                  </p>
                  {row.recruitedBy ? (
                    <p className="mt-0.5 truncate text-xs text-ink-400">
                      {RECRUITED_BY_LABEL}: {recruiterText(row.recruitedBy)}
                    </p>
                  ) : null}

                  {/* Aparelho autorizado: quem entra por link + telefone. */}
                  {row.phoneAccess && row.userId ? <DeviceLine device={row.device} /> : null}
                </div>

                {/* No celular o estado desce para a segunda linha, para o
                    nome e o telefone nao serem espremidos. */}
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
                    // Somente o ADMIN geral tem senha. Quem entra por link do
                    // time + telefone nao tem senha para gerar nem redefinir:
                    // a acao simplesmente nao existe para essas pessoas.
                    ...(row.phoneAccess
                      ? []
                      : [
                          {
                            id: 'senha',
                            label: 'Redefinir senha',
                            icon: <KeyRound className="size-4" />,
                            disabled: row.self || !row.userId || working !== null,
                            onSelect: () => redefinirSenha(row),
                          },
                        ]),
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
                    ...(row.phoneAccess && row.userId
                      ? [
                          {
                            id: 'aparelho',
                            label: 'Liberar novo aparelho',
                            icon: <Smartphone className="size-4" />,
                            disabled: working !== null,
                            onSelect: () => setConfirming({ row, action: 'device' }),
                          },
                        ]
                      : []),
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
        Conectado como {user?.email ?? user?.name ?? '--'}. Sua própria conta não pode ser
        desativada nem ter as sessões revogadas por aqui.
      </p>

      <InviteHistoryCard />

      <CredentialsModal
        open={credential !== null}
        credentials={credential ? [credential] : []}
        conflicts={[]}
        onClose={() => setCredential(null)}
      />

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming?.action === 'disable'
            ? 'Desativar acesso'
            : confirming?.action === 'device'
              ? 'Liberar novo aparelho'
              : 'Revogar sessões'
        }
        description={
          confirming?.action === 'disable'
            ? `${confirming?.row.name ?? ''} não conseguirá entrar até que o acesso seja ativado novamente.`
            : confirming?.action === 'device'
              ? 'O aparelho atual será removido e todas as sessões deste usuário serão encerradas. No próximo acesso, um novo aparelho será vinculado. Deseja continuar?'
              : `${confirming?.row.name ?? ''} precisará entrar de novo em todos os aparelhos.`
        }
        confirmLabel={
          confirming?.action === 'disable'
            ? 'Desativar'
            : confirming?.action === 'device'
              ? 'Liberar novo aparelho'
              : 'Revogar'
        }
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (!confirming) return;
          if (confirming.action === 'disable') alterarAtivo(confirming.row, false);
          else if (confirming.action === 'device') liberarAparelho(confirming.row);
          else revogar(confirming.row);
          setConfirming(null);
        }}
      />
    </div>
  );
}

/**
 * Estado do aparelho autorizado de quem entra por link do time + telefone:
 * Administrador do time e membro da equipe.
 *
 * Apenas auditoria: tipo, navegador, sistema e as datas. Nenhum
 * identificador tecnico, credencial ou valor derivado de IP chega aqui.
 */
function DeviceLine({ device }: { device: AdminDeviceInfo | null }) {
  if (!device) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-warning-600">
        <Smartphone aria-hidden="true" className="size-3.5 shrink-0" />
        Aparelho não vinculado
      </p>
    );
  }

  const identificacao = [device.deviceType, device.browser, device.os ?? device.platform]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mt-1">
      <p className="flex items-center gap-1.5 text-xs text-success-600">
        <Smartphone aria-hidden="true" className="size-3.5 shrink-0" />
        Aparelho vinculado
        {identificacao ? <span className="truncate text-ink-500">{identificacao}</span> : null}
      </p>
      <p className="mt-0.5 text-[0.6875rem] text-ink-400">
        Primeiro acesso: {formatDateTime(device.firstSeenAt)} · Último acesso:{' '}
        {formatDateTime(device.lastSeenAt)}
      </p>
    </div>
  );
}
