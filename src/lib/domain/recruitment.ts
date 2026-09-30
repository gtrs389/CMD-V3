import type { Member, Recruiter } from '@/lib/types';
import { roleShortLabel } from '@/lib/permissions';

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
 * Texto de uma linha: `João Silva · Líder` ou, se o usuario foi excluido,
 * `João Silva · Líder (acesso removido)`.
 *
 * O perfil EQUIPE aparece como Lider, que e quem cadastra. So quando o
 * nivel do responsavel e conhecido e e Equipe — cadastro anterior a
 * separacao dos niveis — o texto diz "Equipe".
 */
export function recruiterText(recruiter: Recruiter | null | undefined): string {
  if (!recruiter) return UNKNOWN_RECRUITER;

  const base = `${recruiter.name} · ${roleShortLabel(recruiter.role, recruiter.tier)}`;
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

/**
 * As mesmas opcoes, em ordem alfabetica pelo nome — para achar um Lider
 * pelo nome numa lista longa. Quem nao tem origem conhecida fica no fim:
 * nao e um nome.
 */
export function recruiterOptionsAlfabeticas(members: Pick<Member, 'recruitedBy'>[]): RecruiterOption[] {
  return recruiterOptions(members).sort(
    (a, b) =>
      Number(a.key === NO_RECRUITER_KEY) - Number(b.key === NO_RECRUITER_KEY) ||
      a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base', numeric: true }),
  );
}
