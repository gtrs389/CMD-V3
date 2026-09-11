/**
 * Prazo dos links de recrutamento.
 *
 * Modulo puro: converte a duracao configurada pelo ADMIN, descreve o estado
 * do link e monta a contagem regressiva. Nada aqui autoriza nada — a
 * autorizacao acontece sempre no servidor, comparando com o horario do
 * banco. A contagem na tela e apenas informativa.
 */

export const INVITE_UNITS = ['minutes', 'hours', 'days'] as const;
export type InviteUnit = (typeof INVITE_UNITS)[number];

export const INVITE_UNIT_LABELS: Record<InviteUnit, string> = {
  minutes: 'minutos',
  hours: 'horas',
  days: 'dias',
};

const SECONDS_PER_UNIT: Record<InviteUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86_400,
};

/** 1 minuto: menor prazo aceito. */
export const MIN_INVITE_SECONDS = 60;
/** 365 dias: maior prazo aceito. */
export const MAX_INVITE_SECONDS = 365 * 86_400;
/** Sem configuracao, o link vale 24 horas. */
export const DEFAULT_INVITE_SECONDS = 24 * 3600;

export function isInviteUnit(value: string): value is InviteUnit {
  return (INVITE_UNITS as readonly string[]).includes(value);
}

/** Maior valor aceito para a unidade escolhida. */
export function maxAmountFor(unit: InviteUnit): number {
  return Math.floor(MAX_INVITE_SECONDS / SECONDS_PER_UNIT[unit]);
}

/** Converte quantidade + unidade em segundos, sem passar dos limites. */
export function toSeconds(amount: number, unit: InviteUnit): number {
  const total = Math.round(amount) * SECONDS_PER_UNIT[unit];
  if (!Number.isFinite(total)) return DEFAULT_INVITE_SECONDS;
  return Math.min(MAX_INVITE_SECONDS, Math.max(MIN_INVITE_SECONDS, total));
}

export interface InviteDuration {
  amount: number;
  unit: InviteUnit;
}

/** Escolhe a maior unidade que representa os segundos sem resto. */
export function fromSeconds(seconds: number): InviteDuration {
  const total = Math.min(MAX_INVITE_SECONDS, Math.max(MIN_INVITE_SECONDS, Math.round(seconds)));
  if (total % SECONDS_PER_UNIT.days === 0) {
    return { amount: total / SECONDS_PER_UNIT.days, unit: 'days' };
  }
  if (total % SECONDS_PER_UNIT.hours === 0) {
    return { amount: total / SECONDS_PER_UNIT.hours, unit: 'hours' };
  }
  return { amount: Math.max(1, Math.round(total / SECONDS_PER_UNIT.minutes)), unit: 'minutes' };
}

/** Texto curto da duracao configurada, para leitura. */
export function describeDuration(seconds: number): string {
  const { amount, unit } = fromSeconds(seconds);
  const singular: Record<InviteUnit, string> = {
    minutes: 'minuto',
    hours: 'hora',
    days: 'dia',
  };
  return `${amount} ${amount === 1 ? singular[unit] : INVITE_UNIT_LABELS[unit]}`;
}

/**
 * Contagem regressiva amigavel: "Expira em 1h 42min".
 *
 * Recebe os milissegundos restantes ja calculados. Vazio quando o prazo
 * terminou: nesse caso a tela mostra "Expirado".
 */
export function countdownLabel(remainingMs: number): string {
  if (remainingMs <= 0) return '';

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `Expira em ${days}d ${hours}h`;
  if (hours > 0) return `Expira em ${hours}h ${minutes}min`;
  if (minutes > 0) return `Expira em ${minutes}min`;
  return 'Expira em menos de 1min';
}

/** Estado do link como as telas o exibem. */
export type InviteState = 'ACTIVE' | 'CLAIMED' | 'SUBMITTING' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';

export const INVITE_STATE_LABELS: Record<InviteState, string> = {
  ACTIVE: 'Ativo',
  CLAIMED: 'Em preenchimento',
  SUBMITTING: 'Em preenchimento',
  CONSUMED: 'Concluído',
  EXPIRED: 'Expirado',
  REVOKED: 'Substituído',
};

/**
 * O link ainda aceita cadastro.
 *
 * Leitura de tela: o servidor confere de novo a cada requisicao, com o
 * proprio relogio.
 */
export function isUsable(state: InviteState, expiresAt: string, now = Date.now()): boolean {
  if (state !== 'ACTIVE' && state !== 'CLAIMED' && state !== 'SUBMITTING') return false;
  const end = new Date(expiresAt).getTime();
  return Number.isFinite(end) && end > now;
}

/** Estado efetivo considerando o prazo: vencido aparece como expirado. */
export function effectiveState(
  state: InviteState,
  expiresAt: string,
  now = Date.now(),
): InviteState {
  if (state === 'ACTIVE' || state === 'CLAIMED' || state === 'SUBMITTING') {
    return isUsable(state, expiresAt, now) ? state : 'EXPIRED';
  }
  return state;
}

/** Link que a tela pode apresentar como ativo: ligado, no prazo e aberto. */
export function inviteIsLive(
  invite: { active: boolean; state: InviteState; expiresAt: string },
  now = Date.now(),
): boolean {
  return invite.active && isUsable(invite.state, invite.expiresAt, now);
}
