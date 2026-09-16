'use client';

/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import { ArrowRightLeft, Pencil } from 'lucide-react';
import type { Client, FieldOption, Member } from '@/lib/types';
import { ACCESS_STATUS_LABELS } from '@/lib/types';
import { RECRUITED_BY_LABEL } from '@/lib/domain/recruitment';
import { formatResponse, sortedFields } from '@/lib/validation/dynamic-form';
import { formatDateTime } from '@/lib/utils/date';
import { formatPhone } from '@/lib/utils/phone';
import { formatCpf, formatVoterId, genderLabel } from '@/lib/utils/documents';
import {
  RELATIONSHIP_COLOR_CLASSES,
  relationshipColor,
  relationshipIconElement,
  relationshipLabel,
} from '@/lib/domain/relationship';
import { useSession } from '@/components/layout/SessionProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { MemberDeviceSection } from './MemberDeviceSection';
import { MemberVerificationSection } from './MemberVerificationSection';
import { RecruitedBy } from './RecruitedBy';
import { TransferRecruiterModal } from './TransferRecruiterModal';

interface MemberDetailModalProps {
  open: boolean;
  client: Client;
  member: Member | null;
  onClose: () => void;
  /**
   * Abre a edicao. Ausente esconde o botao: no mapa a ficha e leitura, e
   * editar continua sendo da pagina do time.
   */
  onEdit?: (member: Member) => void;
}

/** Circulo colorido com o icone da opcao. */
function RelationshipIcon({ option }: { option: FieldOption }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-9 shrink-0 items-center justify-center rounded-full ${RELATIONSHIP_COLOR_CLASSES[relationshipColor(option)]}`}
    >
      {relationshipIconElement(option, 'size-[1.125rem]')}
    </span>
  );
}

/**
 * Vinculo escolhido.
 *
 * Enquanto a opcao existir, mostra o nome atual: renomear se reflete aqui.
 * Se a opcao tiver sido excluida, fica o nome registrado no cadastro.
 */
function RelationshipRow({ client, member }: { client: Client; member: Member }) {
  const campo = client.form.fields.find((field) => field.systemKey === 'relationship');
  if (!campo) return null;

  const nome = relationshipLabel(
    campo.options,
    member.relationshipOptionId,
    member.relationshipLabel,
  );

  if (!nome) {
    return (
      <section>
        <h4 className="text-sm font-semibold text-ink-900">{campo.label}</h4>
        <p className="mt-2 text-sm text-ink-500">Não informado.</p>
      </section>
    );
  }

  const opcao = campo.options.find((item) => item.id === member.relationshipOptionId);

  return (
    <section>
      <h4 className="text-sm font-semibold text-ink-900">{campo.label}</h4>

      <div className="mt-2 flex items-center gap-2.5">
        {opcao ? <RelationshipIcon option={opcao} /> : null}

        <div className="min-w-0">
          <p className="text-sm font-medium break-words text-ink-900">{nome}</p>
          {!opcao ? (
            <p className="text-xs text-ink-500">Opção removida do formulário.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Campos padrao com coluna propria, sempre na mesma ordem. */
function StandardFields({ member }: { member: Member }) {
  const linhas: Array<[string, string | null]> = [
    ['Gênero', genderLabel(member.gender)],
    ['CPF', member.cpf ? formatCpf(member.cpf) : null],
    ['Título de eleitor', member.voterId ? formatVoterId(member.voterId) : null],
    ['Zona eleitoral', member.zone],
    ['Seção eleitoral', member.section],
    ['Estado (UF)', member.state],
    ['Município / Cidade', member.city],
    ['Bairro', member.district],
    ['Rua', member.street],
  ];

  const preenchidas = linhas.filter(([, valor]) => Boolean(valor));

  return (
    <section>
      <h4 className="text-sm font-semibold text-ink-900">Dados padrão</h4>

      {preenchidas.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">Nenhum dado padrão informado.</p>
      ) : (
        <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          {preenchidas.map(([rotulo, valor]) => (
            <div key={rotulo} className="min-w-0">
              <dt className="text-xs text-ink-500">{rotulo}</dt>
              <dd className="font-medium break-words text-ink-900">{valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/**
 * Ficha completa do integrante, em um dialogo.
 *
 * Usada onde a ficha e um desvio: a lista da equipe, o rastreamento de
 * links. No MAPA ela nao abre assim — la o mesmo conteudo ocupa a coluna
 * lateral, no lugar do ranking, porque um dialogo sobre o mapa esconde
 * justamente o que a pessoa estava olhando.
 */
export function MemberDetailModal({
  open,
  client,
  member,
  onClose,
  onEdit,
}: MemberDetailModalProps) {
  const { can } = useSession();
  const podeEditar = can('member.update');

  if (!member) return null;

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
          {podeEditar && onEdit ? (
            <Button
              onClick={() => {
                onClose();
                onEdit(member);
              }}
            >
              <Pencil aria-hidden="true" className="size-4" />
              Editar
            </Button>
          ) : null}
        </>
      }
    >
      <MemberSheetBody client={client} member={member} />
    </Modal>
  );
}

/**
 * Corpo da ficha, sem moldura nenhuma.
 *
 * Existe separado porque a MESMA ficha aparece em dois lugares com molduras
 * diferentes: em dialogo (lista da equipe) e em coluna (mapa). Duplicar o
 * conteudo faria as duas divergirem no primeiro campo novo — e a ficha e
 * exatamente o lugar onde divergir seria pior.
 *
 * O alcance continua sendo do servidor e da sessao: o integrante da equipe
 * ve apenas nome, foto e telefone; CPF, endereco, respostas, origem,
 * verificacao e aparelho sao do ADMIN.
 */
export function MemberSheetBody({ client, member }: { client: Client; member: Member }) {
  // Dados enriquecidos e sinais do aparelho sao exclusivos do ADMIN.
  const { can, user } = useSession();
  const podeEditar = can('member.update');
  const [transferindo, setTransferindo] = useState(false);
  const podeVerificar = can('verification.view');
  const podeVerAparelho = can('device.view');
  // O integrante da equipe ve apenas nome, foto e telefone: o resto da
  // ficha (CPF, endereco, e-mail, respostas, origem) fica so com o ADMIN.
  const somenteBasico = user?.role === 'EQUIPE';

  const custom = sortedFields(client.form).filter((field) => field.systemKey === null);
  const responses = new Map(member.responses.map((item) => [item.fieldId, item.value]));

  return (
    <>
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
          {!somenteBasico ? (
            <>
              {/* E-mail historico: a linha nao aparece quando esta vazio,
                  e nenhum cadastro novo tem endereco. */}
              {member.email ? (
                <p className="truncate text-sm text-ink-500">{member.email}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={member.source === 'invite' ? 'brand' : 'neutral'}>
                  {member.source === 'invite' ? 'Cadastro pelo link' : 'Cadastro pelo painel'}
                </Badge>
                <Badge tone={member.access === 'ACTIVE' ? 'success' : 'neutral'}>
                  {ACCESS_STATUS_LABELS[member.access]}
                </Badge>
                {member.consentAt ? <Badge tone="success">Consentimento registrado</Badge> : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {!somenteBasico ? (
        <>
          <dl className="grid grid-cols-1 gap-3 rounded-control bg-ink-50 p-3 text-sm sm:grid-cols-2">
            {/* Origem do cadastro: o rotulo e o mesmo da lista. */}
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-xs text-ink-500">{RECRUITED_BY_LABEL}</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <RecruitedBy recruiter={member.recruitedBy} />

                {/* Passar o cadastro para outro responsavel: decisao do
                    ADMIN geral, e a rota confere de novo. */}
                {podeEditar ? (
                  <button
                    type="button"
                    onClick={() => setTransferindo(true)}
                    className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-brand-700 transition-colors hover:text-brand-800"
                  >
                    <ArrowRightLeft aria-hidden="true" className="size-3.5" />
                    Alterar responsável
                  </button>
                ) : null}
              </dd>

              {/* A troca aparece na ficha: o total de cada responsavel e
                  lido como resultado de trabalho, e mudar isso em silencio
                  tornaria a mudanca indistinguivel do que sempre foi. */}
              {member.recruiterChange ? (
                <dd className="mt-1 text-xs text-ink-500">
                  Alterado em {formatDateTime(member.recruiterChange.changedAt)}
                  {member.recruiterChange.previousName
                    ? `. Antes era ${member.recruiterChange.previousName}.`
                    : '.'}
                </dd>
              ) : null}
            </div>
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

          <StandardFields member={member} />

          <RelationshipRow client={client} member={member} />

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
        </>
      ) : null}

      {podeVerificar ? (
        <MemberVerificationSection
          member={member}
          verificationEnabled={client.verificationEnabled}
        />
      ) : null}

      {podeVerAparelho ? <MemberDeviceSection memberId={member.id} /> : null}
    </div>

      {/* Fora do corpo da ficha: e um segundo dialogo, por cima dela. */}
      <TransferRecruiterModal
        open={transferindo}
        member={member}
        onClose={() => setTransferindo(false)}
      />
    </>
  );
}
