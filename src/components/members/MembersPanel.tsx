'use client';

import { useMemo, useState } from 'react';
import { Eye, Pencil, SearchX, Trash2, UserPlus, Users } from 'lucide-react';
import type { Client, Member } from '@/lib/types';
import { memberRepository } from '@/lib/repositories';
import { byNewest, formatDate } from '@/lib/utils/date';
import { formatPhone, normalizePhone } from '@/lib/utils/phone';
import { matchesSearch } from '@/lib/utils/text';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { SearchInput } from '@/components/ui/SearchInput';
import { useToast } from '@/components/ui/Toast';
import { MemberDetailModal } from './MemberDetailModal';
import { MemberFormModal } from './MemberFormModal';

interface MembersPanelProps {
  client: Client;
  members: Member[];
  loading: boolean;
}

/**
 * Gestao da equipe do candidato.
 * Tabela no desktop e cartoes no celular, sem rolagem horizontal.
 */
export function MembersPanel({ client, members, loading }: MembersPanelProps) {
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [viewing, setViewing] = useState<Member | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);

  const ordered = useMemo(() => [...members].sort(byNewest), [members]);

  const filtered = useMemo(() => {
    const digits = normalizePhone(term);
    return ordered.filter((member) => {
      if (matchesSearch(term, member.name)) return true;
      return digits.length >= 2 && member.phone.includes(digits);
    });
  }, [ordered, term]);

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
            <Button onClick={openCreate}>
              <UserPlus aria-hidden="true" className="size-4" />
              Adicionar integrante
            </Button>
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
        <SearchInput
          id="busca-integrantes"
          value={term}
          onChange={setTerm}
          label="Pesquisar integrantes por nome ou telefone"
          placeholder="Pesquisar por nome ou telefone"
          className="sm:max-w-sm"
        />
        <div className="flex items-center gap-3">
          <p className="text-sm whitespace-nowrap text-ink-500">
            {filtered.length} de {ordered.length}
          </p>
          <Button onClick={openCreate}>
            <UserPlus aria-hidden="true" className="size-4" />
            Adicionar
          </Button>
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
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral">{formatDate(member.createdAt)}</Badge>
                        {member.source === 'invite' ? <Badge tone="brand">Via link</Badge> : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setViewing(member)}>
                          <Eye aria-hidden="true" className="size-4" />
                          Ficha
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => openEdit(member)}>
                          <Pencil aria-hidden="true" className="size-4" />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger-600 hover:bg-danger-50"
                          onClick={() => setRemoving(member)}
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                          Excluir
                        </Button>
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
                  <th scope="col" className="w-[38%] px-4 py-3 font-medium">
                    Integrante
                  </th>
                  <th scope="col" className="w-[22%] px-4 py-3 font-medium">
                    Telefone
                  </th>
                  <th scope="col" className="w-[18%] px-4 py-3 font-medium">
                    Cadastro
                  </th>
                  <th scope="col" className="w-[22%] px-4 py-3 text-right font-medium">
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
                          {member.source === 'invite' ? (
                            <span className="block text-xs text-ink-500">Via link de convite</span>
                          ) : null}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-700 tabular-nums">
                      {member.phone ? formatPhone(member.phone) : '--'}
                    </td>
                    <td className="px-4 py-3 text-ink-500">{formatDate(member.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <IconButton
                          label={`Ver ficha de ${member.name}`}
                          icon={<Eye className="size-4" />}
                          onClick={() => setViewing(member)}
                        />
                        <IconButton
                          label={`Editar ${member.name}`}
                          icon={<Pencil className="size-4" />}
                          onClick={() => openEdit(member)}
                        />
                        <IconButton
                          label={`Excluir ${member.name}`}
                          icon={<Trash2 className="size-4" />}
                          variant="danger"
                          onClick={() => setRemoving(member)}
                        />
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
        open={viewing !== null}
        client={client}
        member={viewing}
        onClose={() => setViewing(null)}
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
