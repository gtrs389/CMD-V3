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
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? 'ontem' : `há ${days} dias`;

  return formatDate(iso);
}

/** Ordena do mais recente para o mais antigo. */
export function byNewest(a: { createdAt: string }, b: { createdAt: string }): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/** Primeiro instante do mes corrente, em ISO. */
export function startOfMonthIso(reference: Date = new Date()): string {
  return new Date(reference.getFullYear(), reference.getMonth(), 1).toISOString();
}

/** Instante de N dias atras, em ISO. */
export function daysAgoIso(days: number, reference: Date = new Date()): string {
  return new Date(reference.getTime() - days * 86_400_000).toISOString();
}

const hourFormatter = new Intl.DateTimeFormat(appConfig.locale, {
  hour: '2-digit',
  minute: '2-digit',
});

/** Texto do ultimo cadastro: "Hoje, 10:24", "Ontem, 18:41", "Há 3 dias" ou a data. */
export function formatLastActivity(iso: string | null | undefined): string {
  if (!iso) return '--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';

  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);

  if (days <= 0) return `Hoje, ${hourFormatter.format(date)}`;
  if (days === 1) return `Ontem, ${hourFormatter.format(date)}`;
  if (days < 7) return `Há ${days} dias`;
  return formatDate(iso);
}
