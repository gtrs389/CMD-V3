'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Client, Member } from '@/lib/types';
import { LiderPanel } from './LiderPanel';
import { MemberDetailModal } from './MemberDetailModal';
import { MemberFormModal } from './MemberFormModal';
import { estadoProprio, trocarParametros } from '@/lib/utils/historico';
import { ContextoDoNavegador, type Navegador } from './navegador-contexto';

export { useNavegador, type Navegador } from './navegador-contexto';

/**
 * Navegacao entre pessoas na pagina do time — em PILHA, e sem sair do lugar.
 *
 * O problema que isto resolve: abrir uma pessoa a partir do quadro de
 * inconsistencias, do ranking ou do painel de um Lider trocava a aba e o
 * endereco da pagina; fechar deixava a pessoa em outro lugar, sem a busca e
 * sem os filtros que ela tinha montado. E abrir alguem de dentro do painel
 * do Lider FECHAVA o painel.
 *
 * Agora:
 *
 *   - abrir uma pessoa ou um Lider NUNCA troca de aba nem de pagina: abre
 *     uma camada por cima de onde se esta;
 *   - dentro de uma camada, abrir outra EMPILHA (Lider -> pessoa ->
 *     editar), e a de cima mostra "Voltar para Joao Silva", que devolve
 *     exatamente a anterior — com a busca, a aba e a rolagem que ela tinha,
 *     porque as camadas de baixo continuam montadas, so escondidas;
 *   - o X (e o clique fora) fecha TUDO, e a pessoa esta onde comecou: mesma
 *     aba, mesma rolagem, mesma busca, mesmos filtros;
 *   - o botao "voltar" do navegador e do celular volta UMA camada, em vez
 *     de sair da pagina do time. Cada camada e uma entrada do historico,
 *     no mesmo endereco, e o proprio historico guarda a pilha: o "avancar"
 *     reabre, e recarregar a pagina mantem a ficha aberta.
 *
 * Uma camada guarda so o IDENTIFICADOR da pessoa: a ficha e sempre lida da
 * lista atual, entao editar e voltar mostra o dado ja corrigido.
 */

type Camada = { tipo: 'ficha' | 'lider' | 'editar'; id: string };

/** O que cada entrada do historico guarda, ao lado do que o Next guarda. */
interface NoHistorico {
  camadas: Camada[];
  /** Quantas entradas acima da pagina "limpa" esta esta. */
  profundidade: number;
}

const CHAVE = 'cmdPessoas';

function lerHistorico(estado: unknown): NoHistorico | null {
  const valor = (estado as Record<string, unknown> | null)?.[CHAVE] as NoHistorico | undefined;
  return valor && Array.isArray(valor.camadas) ? valor : null;
}

const mesma = (a: Camada | undefined, b: Camada) => Boolean(a && a.tipo === b.tipo && a.id === b.id);

export function NavegadorDePessoas({
  client,
  members,
  carregando = false,
  inicial = null,
  onFiltrarEquipe,
  children,
}: {
  client: Client;
  members: Member[];
  /** Enquanto a lista chega, uma camada pedida pelo endereco espera. */
  carregando?: boolean;
  /** Ficha pedida pelo endereco (`?integrante=`). */
  inicial?: string | null;
  /** "Ver a Equipe na lista": filtra a lista do time pelo Lider. */
  onFiltrarEquipe?: (lider: Member) => void;
  children: ReactNode;
}) {
  // Recarregou com camadas abertas: o historico as guardou, e elas voltam.
  // (A pagina do time so monta isto depois de carregar o time, ja no
  // navegador; o `typeof` e so a guarda.)
  const [pilha, setPilha] = useState<Camada[]>(() => {
    const guardado = typeof window === 'undefined' ? null : lerHistorico(window.history.state);
    if (guardado) return guardado.camadas;
    return inicial ? [{ tipo: 'ficha', id: inicial }] : [];
  });
  const pilhaAtual = useRef(pilha);
  useEffect(() => {
    pilhaAtual.current = pilha;
  }, [pilha]);

  /** "Fechar tudo" pediu ao historico para descer: a chegada fecha a pilha. */
  const fechando = useRef(false);

  /** Pilha vazia: o endereco esquece o `?integrante=` e a pilha guardada. */
  const esquecer = useCallback(() => {
    const estado = estadoProprio();
    const tinhaPilha = CHAVE in estado;
    delete estado[CHAVE];
    if (!trocarParametros({ integrante: null }, estado) && tinhaPilha) {
      window.history.replaceState(estado, '');
    }
  }, []);

  // O historico e a fonte da pilha: voltar, avancar e recarregar.
  useEffect(() => {
    if (!lerHistorico(window.history.state) && inicial) {
      // Ficha pedida pelo endereco: e a base da pilha. Voltar de uma camada
      // aberta por cima dela devolve a ela.
      window.history.replaceState(
        { ...estadoProprio(), [CHAVE]: { camadas: [{ tipo: 'ficha', id: inicial }], profundidade: 0 } },
        '',
      );
    }

    const aoVoltar = (evento: PopStateEvent) => {
      const no = lerHistorico(evento.state);
      if (fechando.current) {
        fechando.current = false;
        setPilha([]);
        esquecer();
        return;
      }
      setPilha(no?.camadas ?? []);
    };
    window.addEventListener('popstate', aoVoltar);
    return () => window.removeEventListener('popstate', aoVoltar);
    // So na montagem: o endereco inicial e lido uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const voltar = useCallback(() => {
    const no = lerHistorico(window.history.state);
    if (no && no.profundidade > 0) {
      window.history.back();
      return;
    }
    // Sem entrada propria para desfazer (nao deveria acontecer): so a tela.
    setPilha((atual) => atual.slice(0, -1));
  }, []);

  const fecharTudo = useCallback(() => {
    const profundidade = lerHistorico(window.history.state)?.profundidade ?? 0;
    setPilha([]);
    if (profundidade > 0) {
      fechando.current = true;
      window.history.go(-profundidade);
    } else {
      esquecer();
    }
  }, [esquecer]);

  const empilhar = useCallback(
    (camada: Camada) => {
      const atual = pilhaAtual.current;
      // Clicar de novo no que ja esta aberto nao empilha a mesma coisa; e
      // pedir a camada de baixo (a ficha do Lider aberta do painel dele, e
      // "Painel do Lider" nela) e so voltar, sem dar voltas.
      if (mesma(atual[atual.length - 1], camada)) return;
      if (mesma(atual[atual.length - 2], camada)) {
        voltar();
        return;
      }
      const nova = [...atual, camada];
      const profundidade = (lerHistorico(window.history.state)?.profundidade ?? 0) + 1;
      window.history.pushState({ [CHAVE]: { camadas: nova, profundidade } satisfies NoHistorico }, '');
      pilhaAtual.current = nova;
      setPilha(nova);
    },
    [voltar],
  );

  const porId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const porUsuario = useMemo(
    () => new Map(members.filter((m) => m.userId).map((m) => [m.userId as string, m])),
    [members],
  );

  const navegador = useMemo<Navegador>(
    () => ({
      abrirPessoa: (id) => empilhar({ tipo: 'ficha', id }),
      abrirLider: (id) => empilhar({ tipo: 'lider', id }),
      editar: (id) => empilhar({ tipo: 'editar', id }),
      liderDoUsuario: (userId) => {
        if (!userId) return null;
        const m = porUsuario.get(userId);
        return m && m.tier === 'LIDER' ? m : null;
      },
      tamanhoDaEquipe: (lider) =>
        lider.userId ? members.filter((m) => m.recruitedBy?.userId === lider.userId).length : 0,
    }),
    [empilhar, porUsuario, members],
  );

  // Pessoa que sumiu da lista (excluida agora mesmo) nao e desenhada.
  const camadas = pilha
    .map((camada, posicao) => ({ camada, posicao, pessoa: porId.get(camada.id) ?? null }))
    .filter((x): x is { camada: Camada; posicao: number; pessoa: Member } => x.pessoa !== null);
  const ultima = camadas.length - 1;

  return (
    <ContextoDoNavegador.Provider value={navegador}>
      {children}

      {carregando && camadas.length === 0
        ? null
        : camadas.map(({ camada, posicao, pessoa }, i) => {
            // Todas montadas; so a de cima visivel. O "Voltar" diz o nome da
            // de baixo: "Voltar para o painel de Joao", "Voltar para Maria".
            const inactive = i !== ultima;
            const baixo = camadas[i - 1];
            const voltarProps = baixo
              ? {
                  onBack: voltar,
                  backLabel: baixo.camada.tipo === 'lider' ? `o painel de ${baixo.pessoa.name}` : baixo.pessoa.name,
                }
              : {};
            const key = `${posicao}-${camada.tipo}-${pessoa.id}`;

            if (camada.tipo === 'lider') {
              return (
                <LiderPanel
                  key={key}
                  lider={pessoa}
                  members={members}
                  inactive={inactive}
                  onClose={fecharTudo}
                  onOpenMember={(m) => navegador.abrirPessoa(m.id)}
                  onFiltrarEquipe={
                    onFiltrarEquipe
                      ? () => {
                          onFiltrarEquipe(pessoa);
                          fecharTudo();
                        }
                      : undefined
                  }
                  {...voltarProps}
                />
              );
            }
            if (camada.tipo === 'ficha') {
              return (
                <MemberDetailModal
                  key={key}
                  open
                  client={client}
                  member={pessoa}
                  inactive={inactive}
                  onClose={fecharTudo}
                  onEdit={(m) => navegador.editar(m.id)}
                  onOpenLider={(m) => navegador.abrirLider(m.id)}
                  {...voltarProps}
                />
              );
            }
            // Salvar ou cancelar a edicao volta para a ficha que a abriu.
            return (
              <MemberFormModal
                key={key}
                open={!inactive}
                client={client}
                member={pessoa}
                onClose={baixo ? voltar : fecharTudo}
              />
            );
          })}
    </ContextoDoNavegador.Provider>
  );
}
