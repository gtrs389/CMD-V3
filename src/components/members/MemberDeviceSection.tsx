'use client';

import { MonitorSmartphone } from 'lucide-react';
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
 * Os dados vem da rota protegida do ADMIN. Token, hash de IP e identificadores
 * tecnicos nunca sao enviados ao navegador, portanto nao aparecem aqui.
 */
export function MemberDeviceSection({ memberId }: MemberDeviceSectionProps) {
  const { data, loading, error } = useMemberDevices(memberId);
  const devices = [...(data ?? [])].sort(byLastSeen);

  return (
    <section>
      <h4 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <MonitorSmartphone aria-hidden="true" className="size-4 text-brand-700" />
        Aparelho e segurança
      </h4>

      {loading ? (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-24 w-full rounded-control" />
        </div>
      ) : error ? (
        <p role="alert" className="mt-2 text-sm text-danger-700">
          {error}
        </p>
      ) : devices.length === 0 ? (
        <p className="mt-2 text-sm text-ink-500">{EMPTY_MESSAGE}</p>
      ) : (
        <div className="mt-2 space-y-3">
          {devices.map((device, index) => (
            <DeviceCard key={`${device.firstSeenAt}-${index}`} device={device} />
          ))}
        </div>
      )}
    </section>
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
