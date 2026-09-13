import { createHttpClientRepository } from './http/client.repository';
import { createHttpMemberRepository } from './http/member.repository';
import type { ClientRepository, MemberRepository } from './types';

/**
 * Fabrica unica de repositorios.
 *
 * As telas continuam falando apenas com estas interfaces. A implementacao
 * ativa conversa com as rotas de API do proprio Next.js, que sao o unico
 * caminho ate o Supabase. As implementacoes em `./local` seguem existindo
 * como referencia da regra de negocio e sao exercitadas pelos testes.
 */
export const clientRepository: ClientRepository = createHttpClientRepository();
export const memberRepository: MemberRepository = createHttpMemberRepository();

export * from './types';
export { NetworkError } from './http/api';
export {
  submitInvite,
  sendInviteDeviceSignals,
  lookupInviteCpf,
  lookupInviteTitulo,
  type PublicSubmission,
  type InviteCpfLookup,
  type InviteTituloLookup,
} from './http/public';
export { regenerateTeamInvite } from './http/client.repository';
export {
  fetchSurvey,
  updateSurvey,
  fetchSurveyResponses,
  fetchOwnSurvey,
  generateSurveyLink,
  fetchPublicSurvey,
  submitSurvey,
  type OwnSurvey,
  type PublicSurveyOutcome,
  type SurveySubmissionInput,
} from './http/survey';
export { subscribeToData, notifyDataChanged } from './events';
