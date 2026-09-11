'use client';

import { useState } from 'react';
import { ChevronDown, MonitorSmartphone } from 'lucide-react';
import {
  browserName,
  byLastSeen,
  deviceType,
  locationLabel,
  mobileLabel,
  screenLabel,
  statusLabel,
  textOrEmpty,
  touchLabel,
  type MemberDevice,
} from '@/lib/domain/device-summary';
import { formatDateTime } from '@/lib/utils/date';
import { useMemberDevices } from '@/hooks/use-member-devices';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

interface MemberDeviceSectionProps {
  memberId: string;
}

const EMPTY_MESSAGE = 'Informações do aparelho não disponíveis.';

/**
 * Sinais tecnicos do aparelho usado no cadastro.
 *
 * Exclusivo do ADMIN: quem chama ja confere `device.view`, e a rota recusa
 * qualquer outro perfil com 403. Token, hash de IP e identificadores tecnicos
 * nunca sao enviados ao navegador, portanto nao aparecem aqui.
 *
 * A secao comeca fechada e a consulta so acontece quando ela e aberta: dado
 * tecnico nao carrega sozinho em cima de cada ficha.
 */
export function MemberDeviceSection({ memberId }: MemberDeviceSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-control border border-line">
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-50 [&::-webkit-details-marker]:hidden">
          <MonitorSmartphone aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
          <span className="min-w-0 flex-1">Aparelho e segurança</span>
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-ink-500 transition-transform group-open:rotate-180"
          />
        </summary>

        {/* Montado somente depois de abrir: e ai que a rota e consultada. */}
        {open ? <DeviceList memberId={memberId} /> : null}
      </details>
    </section>
  );
}

function DeviceList({ memberId }: MemberDeviceSectionProps) {
  const { data, loading, error } = useMemberDevices(memberId);
  const devices = [...(data ?? [])].sort(byLastSeen);

  return (
    <div className="border-t border-line p-3">
      {loading ? (
        <Skeleton className="h-24 w-full rounded-control" />
      ) : error ? (
        <p role="alert" className="text-sm text-danger-700">
          {error}
        </p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-ink-500">{EMPTY_MESSAGE}</p>
      ) : (
        <div className="space-y-3">
          {devices.map((device, index) => (
            <DeviceCard key={`${device.firstSeenAt}-${index}`} device={device} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceCard({ device }: { device: MemberDevice }) {
  const rows: Array<[string, string]> = [
    ['Tipo do dispositivo', deviceType(device)],
    ['Sistema / plataforma', textOrEmpty(device.platform)],
    ['Navegador', browserName(device.userAgent)],
    ['Dispositivo móvel', mobileLabel(device.isMobile)],
    ['Idioma', textOrEmpty(device.language)],
    ['Fuso horário', textOrEmpty(device.timezone)],
    ['Resolução da tela', screenLabel(device)],
    ['Pontos de toque', touchLabel(device.maxTouchPoints)],
    ['País / região', locationLabel(device)],
    ['Primeiro registro', formatDateTime(device.firstSeenAt)],
    ['Última atividade', formatDateTime(device.lastSeenAt)],
  ];

  return (
    <article className="rounded-control border border-line bg-ink-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink-900">{deviceType(device)}</p>
        <Badge tone={device.status === 'BLOCKED' ? 'danger' : 'neutral'}>
          {statusLabel(device.status)}
        </Badge>
      </div>

      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-ink-500">{label}</dt>
            <dd className="font-medium break-words text-ink-900">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-2 min-w-0">
        <p className="text-xs text-ink-500">User-Agent</p>
        <p className="font-mono text-xs break-all text-ink-700">
          {textOrEmpty(device.userAgent)}
        </p>
      </div>
    </article>
  );
}
