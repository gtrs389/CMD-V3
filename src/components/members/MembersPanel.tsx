'use client';

import { useMemo, useState } from 'react';
import { Eye, Pencil, SearchX, Trash2, UserPlus, Users } from 'lucide-react';
import type { Client, Member } from '@/lib/types';
import { memberRepository } from '@/lib/repositories';
import {
  RECRUITED_BY_LABEL,
  recruiterKey,
  recruiterOptions,
  recruiterText,
} from '@/lib/domain/recruitment';
import { byNewest, formatDate } from '@/lib/utils/date';
import { formatPhone, normalizePhone } from '@/lib/utils/phone';
import { matchesSearch } from '@/lib/utils/text';
import { Select } from '@/components/ui/Select';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { SearchInput } from '@/components/ui/SearchInput';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/components/layout/SessionProvider';
import { MemberDetailModal } from './MemberDetailModal';
import { MemberFormModal } from './MemberFormModal';
import { RecruitedBy } from './RecruitedBy';

interface MembersPanelProps {
  client: Client;
  members: Member[];
  loading: boolean;
  /**
   * Ficha aberta ao entrar, indicada pelo endereco (`?integrante=`). Usada
   * pelo botao "Ver ficha completa" do Rastreamento de links. Abre uma unica
   * vez: fechar o dialogo nao reabre.
   */
  openMemberId?: string | null;
}

/**
 * Gestao da equipe do time.
 * Tabela no desktop e cartoes no celular, sem rolagem horizontal.
 */
export function MembersPanel({
  client,
  members,
  loading,
  openMemberId = null,
}: MembersPanelProps) {
  const toast = useToast();
  // Perfil somente leitura nao recebe as acoes. O servidor recusa do mesmo
  // jeito: esconder o botao nunca e a protecao.
  const { can, user } = useSession();
  const podeCriar = can('member.create');
  const podeEditar = can('member.update');
  const podeExcluir = can('member.delete');
  // O integrante da equipe ve apenas nome, foto e telefone: nada de e-mail,
  // responsavel pelo cadastro ou origem, que o servidor ja nao envia mais.
  const somenteBasico = user?.role === 'EQUIPE';
  const [term, setTerm] = useState('');
  // Filtro por responsavel pelo cadastro. Recorte de leitura apenas: o que
  // chega da API ja vem limitado pela hierarquia, no servidor.
  const [recruiter, setRecruiter] = useState('todos');
  const [viewing, setViewing] = useState<Member | null>(null);
  /** A ficha aberta pelo endereco so aparece ate ser fechada uma vez. */
  const [deepLinkClosed, setDeepLinkClosed] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);

  const ordered = useMemo(() => [...members].sort(byNewest), [members]);

  // A ficha indicada pelo endereco e derivada da lista, sem efeito: ela
  // aparece assim que o integrante chega e some de vez quando o dialogo e
  // fechado.
  const deepLinkMember = useMemo(() => {
    if (deepLinkClosed || !openMemberId) return null;
    return members.find((member) => member.id === openMemberId) ?? null;
  }, [deepLinkClosed, members, openMemberId]);

  const shownMember = viewing ?? deepLinkMember;

  const responsaveis = useMemo(() => recruiterOptions(ordered), [ordered]);

  const filtered = useMemo(() => {
    const digits = normalizePhone(term);
    return ordered.filter((member) => {
      if (recruiter !== 'todos' && recruiterKey(member) !== recruiter) return false;

      if (
        matchesSearch(
          term,
          member.name,
          member.email ?? '',
          recruiterText(member.recruitedBy),
        )
      ) {
        return true;
      }
      return digits.length >= 2 && member.phone.includes(digits);
    });
  }, [ordered, term, recruiter]);

  async function handleRemove() {
    if (!removing) return;
    try {
      await memberRepository.remove(removing.id);
      toast.success('Integrante excluido.');
    } catch {
      toast.error('Não foi possível excluir o integrante.');
    } finally {
      setRemoving(null);
    }
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(member: Member) {
    setEditing(member);
    setFormOpen(true);
  }

  if (!loading && members.length === 0) {
    return (
      <>
        <EmptyState
          icon={<Users className="size-6" />}
          title="Nenhum integrante cadastrado"
          description="Compartilhe o link de convite para receber cadastros ou adicione um integrante manualmente."
          action={
            podeCriar ? (
              <Button onClick={openCreate}>
                <UserPlus aria-hidden="true" className="size-4" />
                Adicionar integrante
              </Button>
            ) : undefined
          }
        />
        <MemberFormModal
          open={formOpen}
          client={client}
          member={null}
          onClose={() => setFormOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            id="busca-integrantes"
            value={term}
            onChange={setTerm}
            label="Pesquisar integrantes por nome, e-mail, telefone ou responsável"
            placeholder="Pesquisar por nome, e-mail ou responsável"
            className="sm:max-w-sm"
          />

          {responsaveis.length > 1 ? (
            <Select
              id="filtro-responsavel"
              aria-label={`Filtrar por ${RECRUITED_BY_LABEL.toLowerCase()}`}
              value={recruiter}
              onChange={(event) => setRecruiter(event.target.value)}
              className="sm:max-w-56"
            >
              <option value="todos">{RECRUITED_BY_LABEL}: todos</option>
              {responsaveis.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label} ({option.count})
                </option>
              ))}
            </Select>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="shrink-0 text-sm whitespace-nowrap text-ink-500">
            {filtered.length} de {ordered.length}
          </p>
          {podeCriar ? (
            <Button onClick={openCreate}>
              <UserPlus aria-hidden="true" className="size-4" />
              Adicionar
            </Button>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          icon={<SearchX className="size-5" />}
          title="Nenhum resultado"
          description={`Nada encontrado para "${term}".`}
          action={
            <Button variant="secondary" onClick={() => setTerm('')}>
              Limpar pesquisa
            </Button>
          }
        />
      ) : (
        <>
          {/* Celular e tablet: cartoes empilhados */}
          <ul className="space-y-3 lg:hidden">
            {filtered.map((member) => (
              <li key={member.id}>
                <Card>
                  <CardBody className="flex items-start gap-3">
                    <Avatar name={member.name} src={member.photo} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-900">{member.name}</p>
                      <p className="truncate text-sm text-ink-500">
                        {member.phone ? formatPhone(member.phone) : 'Sem telefone'}
                      </p>
                      {member.email ? (
                        <p className="truncate text-xs text-ink-500">{member.email}</p>
                      ) : null}

                      {!somenteBasico ? (
                        <>
                          {/* No celular a origem fica na propria coluna do cartao:
                              nada de rolagem horizontal. */}
                          <RecruitedBy
                            recruiter={member.recruitedBy}
                            withLabel
                            className="mt-1.5"
                          />

                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <Badge tone="neutral">{formatDate(member.createdAt)}</Badge>
                            {member.source === 'invite' ? <Badge tone="brand">Via link</Badge> : null}
                          </div>
                        </>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setViewing(member)}>
                          <Eye aria-hidden="true" className="size-4" />
                          Ficha
                        </Button>
                        {podeEditar ? (
                          <Button variant="secondary" size="sm" onClick={() => openEdit(member)}>
                            <Pencil aria-hidden="true" className="size-4" />
                            Editar
                          </Button>
                        ) : null}
                        {podeExcluir ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger-600 hover:bg-danger-50"
                            onClick={() => setRemoving(member)}
                          >
                            <Trash2 aria-hidden="true" className="size-4" />
                            Excluir
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>

          {/* Desktop: tabela para leitura rapida */}
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <caption className="sr-only">Integrantes da equipe de {client.name}</caption>
              <thead className="bg-ink-50 text-xs tracking-wide text-ink-500 uppercase">
                <tr>
                  <th scope="col" className={somenteBasico ? 'w-[52%] px-4 py-3 font-medium' : 'w-[28%] px-4 py-3 font-medium'}>
                    Integrante
                  </th>
                  <th scope="col" className={somenteBasico ? 'w-[32%] px-4 py-3 font-medium' : 'w-[18%] px-4 py-3 font-medium'}>
                    Telefone
                  </th>
                  {!somenteBasico ? (
                    <>
                      <th scope="col" className="w-[24%] px-4 py-3 font-medium">
                        {RECRUITED_BY_LABEL}
                      </th>
                      <th scope="col" className="w-[14%] px-4 py-3 font-medium">
                        Cadastro
                      </th>
                    </>
                  ) : null}
                  <th scope="col" className="w-[16%] px-4 py-3 text-right font-medium">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((member) => (
                  <tr key={member.id} className="transition-colors hover:bg-ink-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={member.name} src={member.photo} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink-900">
                            {member.name}
                          </span>
                          {/* E-mail historico: sem endereco a linha some, e
                              nenhum cadastro novo tem um. */}
                          {!somenteBasico && member.email ? (
                            <span className="block truncate text-xs text-ink-500">
                              {member.email}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-700 tabular-nums">
                      {member.phone ? formatPhone(member.phone) : '--'}
                    </td>
                    {!somenteBasico ? (
                      <>
                        <td className="px-4 py-3">
                          <RecruitedBy recruiter={member.recruitedBy} />
                        </td>
                        <td className="px-4 py-3 text-ink-500">{formatDate(member.createdAt)}</td>
                      </>
                    ) : null}
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <IconButton
                          label={`Ver ficha de ${member.name}`}
                          icon={<Eye className="size-4" />}
                          onClick={() => setViewing(member)}
                        />
                        {podeEditar ? (
                          <IconButton
                            label={`Editar ${member.name}`}
                            icon={<Pencil className="size-4" />}
                            onClick={() => openEdit(member)}
                          />
                        ) : null}
                        {podeExcluir ? (
                          <IconButton
                            label={`Excluir ${member.name}`}
                            icon={<Trash2 className="size-4" />}
                            variant="danger"
                            onClick={() => setRemoving(member)}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <MemberDetailModal
        open={shownMember !== null}
        client={client}
        member={shownMember}
        onClose={() => {
          setViewing(null);
          setDeepLinkClosed(true);
        }}
        onEdit={openEdit}
      />

      <MemberFormModal
        open={formOpen}
        client={client}
        member={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        title="Excluir integrante"
        description={`"${removing?.name ?? ''}" será removido da equipe de ${client.name}. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir integrante"
        onCancel={() => setRemoving(null)}
        onConfirm={handleRemove}
        details={
          <p className="rounded-control bg-ink-50 p-3 text-sm text-ink-700">
            A foto e todas as respostas do formulário também serão apagadas.
          </p>
        }
      />
    </div>
  );
}
