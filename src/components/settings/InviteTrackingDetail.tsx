'use client';

import Link from 'next/link';
import { Clock, MonitorSmartphone, Route, UserRound } from 'lucide-react';
import type { InviteTrackingEntry } from '@/lib/types';
import { formatDuration, trackingLabel } from '@/lib/domain/invite-tracking';
import { EMPTY } from '@/lib/domain/device-summary';
import { ROLE_LABELS } from '@/lib/permissions';
import { formatDateTime } from '@/lib/utils/date';
import { formatPhone } from '@/lib/utils/phone';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';

interface InviteTrackingDetailProps {
  entry: InviteTrackingEntry | null;
  onClose: () => void;
}

/**
 * Detalhe de uma geracao de link, aberto ao clicar na linha.
 *
 * Quatro blocos: origem, linha do tempo, aparelho do primeiro acesso e a
 * pessoa cadastrada (somente depois da conclusao).
 *
 * O que NAO aparece aqui, de proposito: CPF, titulo de eleitor, qualquer
 * dado de consulta cadastral, hash do IP, hash do token, segredo do aparelho
 * e a URL do convite. Nada disso chega sequer a resposta da API.
 */
export function InviteTrackingDetail({ entry, onClose }: InviteTrackingDetailProps) {
  return (
    <Modal
      open={entry !== null}
      onClose={onClose}
      size="lg"
      title="Rastreamento do link"
      description={entry ? `${entry.ownerName} · ${entry.clientName}` : undefined}
    >
      {entry ? <Conteudo entry={entry} /> : null}
    </Modal>
  );
}

function Conteudo({ entry }: { entry: InviteTrackingEntry }) {
  const { device, member } = entry;

  return (
    <div className="space-y-6">
      <Bloco icon={<Route className="size-4" />} title="Origem">
        <Linha label="Dono do link" value={entry.ownerName} />
        <Linha
          label="Perfil"
          value={entry.ownerRole ? ROLE_LABELS[entry.ownerRole] : EMPTY}
        />
        <Linha label="Time" value={entry.clientName} />
        <Linha
          label="Gerado por"
          value={
            entry.generatedByRole
              ? `${entry.generatedByName} (${ROLE_LABELS[entry.generatedByRole]})`
              : entry.generatedByName
          }
        />
        <Linha label="Geração do convite" value={`${entry.generation}ª`} />
      </Bloco>

      <Bloco icon={<Clock className="size-4" />} title="Linha do tempo">
        <Etapa
          label="Link gerado"
          value={entry.generatedAt ? formatDateTime(entry.generatedAt) : EMPTY}
        />
        <Etapa
          label="Primeiro acesso"
          value={entry.firstAccessAt ? formatDateTime(entry.firstAccessAt) : 'Ainda não aberto'}
          duration={entry.firstAccessAt ? formatDuration(entry.msToFirstAccess) : null}
        />
        <Etapa
          label={fecho(entry)}
          value={fechoEm(entry)}
          duration={entry.consumedAt ? formatDuration(entry.msToConsume) : null}
        />
        <p className="pt-1 text-xs text-ink-500">
          Tempo total entre geração e conclusão: {formatDuration(entry.msTotal)}. Todos os tempos
          são calculados com o horário do servidor.
        </p>
      </Bloco>

      <Bloco icon={<MonitorSmartphone className="size-4" />} title="Aparelho do primeiro acesso">
        {device ? (
          <>
            <Linha label="Tipo" value={device.deviceType ?? EMPTY} />
            <Linha label="Navegador" value={device.browser ?? EMPTY} />
            <Linha label="Sistema operacional" value={device.os ?? EMPTY} />
            <Linha label="Plataforma" value={device.platform ?? EMPTY} />
            <Linha label="Resolução" value={resolucao(device.screenWidth, device.screenHeight)} />
            <Linha label="Fuso horário" value={device.timezone ?? EMPTY} />
            <Linha label="Idiomas" value={device.languages ?? EMPTY} />
            <Linha label="Pontos de toque" value={toque(device.maxTouchPoints)} />
            <Linha label="Primeiro acesso" value={formatDateTime(device.firstAccessAt)} />

            {device.userAgent ? (
              <details className="pt-1 sm:col-span-2">
                <summary className="cursor-pointer text-xs font-medium text-ink-700">
                  User-Agent
                </summary>
                <p className="mt-2 break-all rounded-control bg-ink-50 p-3 font-mono text-[0.6875rem] text-ink-700">
                  {device.userAgent}
                </p>
              </details>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink-500 sm:col-span-2">
            Nenhum aparelho registrado: o link ainda não foi aberto.
          </p>
        )}
      </Bloco>

      <Bloco icon={<UserRound className="size-4" />} title="Pessoa cadastrada">
        {member ? (
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Avatar name={member.name} src={member.photoUrl} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900">{member.name}</p>
              <p className="truncate text-sm text-ink-500">{formatPhone(member.phone)}</p>
            </div>
            <Link
              href={`/candidatos/${member.clientId}?integrante=${member.id}`}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-control border border-line bg-surface px-4 text-sm font-medium text-ink-900 transition-colors hover:bg-ink-50"
            >
              Ver ficha completa
            </Link>
          </div>
        ) : (
          <p className="text-sm text-ink-500 sm:col-span-2">
            O cadastro ainda não foi concluído: {trackingLabel(entry.state).toLowerCase()}.
          </p>
        )}
      </Bloco>
    </div>
  );
}

/** Ultimo passo da linha do tempo, conforme o desfecho da geracao. */
function fecho(entry: InviteTrackingEntry): string {
  if (entry.consumedAt) return 'Cadastro concluído';
  if (entry.revokedAt) return 'Link revogado';
  if (entry.state === 'EXPIRED') return 'Link expirado';
  return 'Cadastro concluído';
}

function fechoEm(entry: InviteTrackingEntry): string {
  if (entry.consumedAt) return formatDateTime(entry.consumedAt);
  if (entry.revokedAt) return formatDateTime(entry.revokedAt);
  if (entry.expiredAt) return formatDateTime(entry.expiredAt);
  if (entry.state === 'EXPIRED' && entry.expiresAt) return formatDateTime(entry.expiresAt);
  return 'Ainda em aberto';
}

function resolucao(width: number | null, height: number | null): string {
  if (typeof width !== 'number' || typeof height !== 'number') return EMPTY;
  return `${width} x ${height}`;
}

function toque(points: number | null): string {
  return typeof points === 'number' ? String(points) : EMPTY;
}

function Bloco({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <span aria-hidden="true" className="text-brand-700">
          {icon}
        </span>
        {title}
      </h3>
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="truncate text-sm font-medium text-ink-900">{value}</dd>
    </div>
  );
}

/** Passo da linha do tempo, com a duracao desde o passo anterior. */
function Etapa({
  label,
  value,
  duration,
}: {
  label: string;
  value: string;
  duration?: string | null;
}) {
  return (
    <div className="min-w-0 sm:col-span-2">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-sm font-medium text-ink-900">
        {value}
        {duration && duration !== '--' ? (
          <span className="ml-2 text-xs font-normal text-ink-500">(+{duration})</span>
        ) : null}
      </dd>
    </div>
  );
}
