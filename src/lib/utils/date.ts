import { appConfig } from '@/config/app.config';

const dateFormatter = new Intl.DateTimeFormat(appConfig.locale, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(appConfig.locale, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  return dateFormatter.format(date);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  return dateTimeFormatter.format(date);
}

/** Texto relativo curto, usado em listas de atividade recente. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);

  if (minutes < 1) return 'agora';
  if (minutes < 60) return `ha ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `ha ${hours} h`;

  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? 'ontem' : `ha ${days} dias`;

  return formatDate(iso);
}

/** Ordena do mais recente para o mais antigo. */
export function byNewest(a: { createdAt: string }, b: { createdAt: string }): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}
