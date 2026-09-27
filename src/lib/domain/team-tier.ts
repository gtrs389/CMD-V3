import type { Role, TeamTier } from '@/lib/types';

/**
 * Lider e Equipe: os dois niveis de quem esta abaixo do Administrador do
 * time.
 *
 *   Administrador do time  cadastra os LIDERES;
 *   Lider                  cadastra a EQUIPE;
 *   Equipe                 nao cadastra ninguem — a hierarquia para aqui.
 *
 * O nivel NAO e gravado: ele sai de quem cadastrou a pessoa
 * (`recruited_by_role`), que ja existe em todo cadastro desde a migration
 * 012. Por isso quem ja estava cadastrado foi reclassificado sozinho, sem
 * uma linha reescrita, e a troca de responsavel muda o nivel junto — nao ha
 * duas informacoes para ficarem em desacordo.
 *
 * A regra e uma so:
 *
 *   cadastrado por alguem do perfil EQUIPE (um Lider)  -> Equipe;
 *   qualquer outra origem                              -> Lider.
 *
 * "Qualquer outra" inclui o Administrador do time, o ADMIN geral cadastrando
 * pela pagina do time e o cadastro antigo, anterior ao rastreamento. Nenhum
 * deles esta abaixo de um Lider, e rebaixar alguem a Equipe sem evidencia
 * tiraria dele o poder de cadastrar que sempre teve.
 */
export function tierOf(recruitedByRole: Role | string | null | undefined): TeamTier {
  return recruitedByRole === 'EQUIPE' ? 'EQUIPE' : 'LIDER';
}

/** So o Lider cadastra. A Equipe e o fim da hierarquia. */
export function tierCanRecruit(tier: TeamTier | null | undefined): boolean {
  return tier !== 'EQUIPE';
}

/** Mensagem unica da recusa, no servidor e na tela. */
export const EQUIPE_NAO_CADASTRA = 'Quem é da Equipe não cadastra pessoas: só o Líder.';
