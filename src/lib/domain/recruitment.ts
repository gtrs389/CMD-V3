import type { Member, Recruiter } from '@/lib/types';
import { ROLE_SHORT_LABELS } from '@/lib/permissions';

/**
 * Origem do cadastro, exibida com o rotulo "Cadastrado por".
 *
 * O texto vem do snapshot gravado no momento do cadastro, entao ele continua
 * existindo mesmo depois que o usuario responsavel e excluido. Registro sem
 * evidencia nenhuma nunca e atribuido a alguem.
 */

export const RECRUITED_BY_LABEL = 'Cadastrado por';

/** Registro anterior ao rastreamento da origem. */
export const UNKNOWN_RECRUITER = 'Cadastro anterior ao rastreamento';

/** Sufixo mostrado quando o usuario responsavel nao existe mais. */
export const REVOKED_SUFFIX = '(acesso removido)';

/**
 * Texto de uma linha: `João Silva · Equipe` ou, se o usuario foi excluido,
 * `João Silva · Equipe (acesso removido)`.
 */
export function recruiterText(recruiter: Recruiter | null | undefined): string {
  if (!recruiter) return UNKNOWN_RECRUITER;

  const base = `${recruiter.name} · ${ROLE_SHORT_LABELS[recruiter.role]}`;
  return recruiter.userId ? base : `${base} ${REVOKED_SUFFIX}`;
}

/** Chave do filtro por responsavel. Agrupa os sem origem conhecida. */
export const NO_RECRUITER_KEY = '__sem_origem';

export function recruiterKey(member: Pick<Member, 'recruitedBy'>): string {
  const recruiter = member.recruitedBy;
  if (!recruiter) return NO_RECRUITER_KEY;
  // Usuario excluido continua agrupado pelo nome do snapshot.
  return recruiter.userId ?? `nome:${recruiter.name}:${recruiter.role}`;
}

export interface RecruiterOption {
  key: string;
  label: string;
  count: number;
}

/** Opcoes do filtro "Cadastrado por", ordenadas do maior para o menor. */
export function recruiterOptions(members: Pick<Member, 'recruitedBy'>[]): RecruiterOption[] {
  const map = new Map<string, RecruiterOption>();

  for (const member of members) {
    const key = recruiterKey(member);
    const current = map.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    map.set(key, { key, label: recruiterText(member.recruitedBy), count: 1 });
  }

  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'),
  );
}
