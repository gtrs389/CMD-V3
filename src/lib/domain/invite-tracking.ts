import type { InviteState } from './invite-expiration';

/**
 * Rastreamento dos links de recrutamento.
 *
 * Modulo puro: rotulos e leitura de duracao para a tela do ADMIN geral. Nada
 * aqui consulta banco, rede ou relogio do navegador — os instantes e as
 * duracoes chegam prontos do servidor, calculados com o horario do banco.
 *
 * Os rotulos sao proprios desta auditoria e nao substituem
 * `INVITE_STATE_LABELS`, que continua valendo nas telas de quem gera o
 * proprio link.
 */

/** Rotulos do rastreamento, do ponto de vista de quem audita. */
export const INVITE_TRACKING_LABELS: Record<InviteState, string> = {
  ACTIVE: 'Aguardando acesso',
  CLAIMED: 'Cadastro em andamento',
  SUBMITTING: 'Cadastro em andamento',
  CONSUMED: 'Concluído',
  EXPIRED: 'Expirado',
  REVOKED: 'Revogado',
};

/** Estados oferecidos no filtro. CLAIMED e SUBMITTING sao o mesmo rotulo. */
export const INVITE_TRACKING_STATES: readonly InviteState[] = [
  'ACTIVE',
  'CLAIMED',
  'CONSUMED',
  'EXPIRED',
  'REVOKED',
];

export function trackingLabel(state: InviteState): string {
  return INVITE_TRACKING_LABELS[state] ?? INVITE_TRACKING_LABELS.EXPIRED;
}

/**
 * Duracao entre dois instantes do servidor: "2 d 3 h", "41 min", "18 s".
 *
 * Recebe milissegundos ja calculados no servidor. Valor ausente ou negativo
 * vira o tracinho neutro: nada e estimado pelo relogio de quem esta olhando.
 */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return '--';

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const restoMin = minutes % 60;
    return restoMin > 0 ? `${hours} h ${restoMin} min` : `${hours} h`;
  }

  const days = Math.floor(hours / 24);
  const restoH = hours % 24;
  return restoH > 0 ? `${days} d ${restoH} h` : `${days} d`;
}

/** Diferenca entre dois instantes ISO, em milissegundos. Null se faltar algum. */
export function elapsedMs(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const inicio = new Date(from).getTime();
  const fim = new Date(to).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fim)) return null;
  const diff = fim - inicio;
  return diff >= 0 ? diff : null;
}
