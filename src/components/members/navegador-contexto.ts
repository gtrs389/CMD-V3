'use client';

import { createContext, useContext } from 'react';
import type { Member } from '@/lib/types';

/**
 * O contrato do `NavegadorDePessoas`, separado dele para que a ficha e o
 * painel do Lider (que o navegador desenha) possam usa-lo sem importacao
 * circular.
 */
export interface Navegador {
  /** Abre a ficha da pessoa por cima do que estiver aberto. */
  abrirPessoa: (id: string) => void;
  /** Abre o painel do Lider por cima do que estiver aberto. */
  abrirLider: (id: string) => void;
  /** Abre a edicao da ficha, por cima. */
  editar: (id: string) => void;
  /** O Lider (integrante) por tras de um usuario responsavel, se estiver no time. */
  liderDoUsuario: (userId: string | null | undefined) => Member | null;
  /** Quantas pessoas da lista o Lider cadastrou: a Equipe que mostra a tag dele. */
  tamanhoDaEquipe: (lider: Member) => number;
}

export const ContextoDoNavegador = createContext<Navegador | null>(null);

/** O navegador da pagina, ou nulo fora dela (o mapa, por exemplo). */
export function useNavegador(): Navegador | null {
  return useContext(ContextoDoNavegador);
}
