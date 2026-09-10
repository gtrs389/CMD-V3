import { createLocalClientRepository } from './local/client.repository';
import { createLocalMemberRepository } from './local/member.repository';
import type { ClientRepository, MemberRepository } from './types';

/**
 * Fabrica unica de repositorios.
 *
 * Ponto de troca para a futura integracao com API + banco de dados:
 * substitua as duas linhas abaixo por implementacoes HTTP que respeitem
 * as mesmas interfaces. Nenhuma tela precisa ser alterada.
 */
export const clientRepository: ClientRepository = createLocalClientRepository();
export const memberRepository: MemberRepository = createLocalMemberRepository();

export * from './types';
export { subscribeToData, notifyDataChanged } from './events';
