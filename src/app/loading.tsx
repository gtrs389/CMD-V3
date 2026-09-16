import { LoadingScreen } from '@/components/ui/LoadingScreen';

/**
 * Espera do sistema inteiro, antes de existir moldura na tela.
 *
 * Este e o aviso mais alto da arvore: ele cobre ate o carregamento do
 * proprio `(admin)/layout.tsx`, que consulta a sessao no banco antes de
 * desenhar cabecalho e barra lateral. Um aviso posto so dentro do painel
 * nao alcancaria essa parte — ela acontece ANTES —, e era justamente ali
 * que a tela ficava vazia ao abrir o sistema.
 *
 * Por isso e de tela cheia: neste ponto nao ha cabecalho, barra lateral nem
 * cartao onde encaixar o aviso.
 */
export default function Loading() {
  return <LoadingScreen fullscreen />;
}
