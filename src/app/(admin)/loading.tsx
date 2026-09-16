import { LoadingScreen } from '@/components/ui/LoadingScreen';

/**
 * Espera DENTRO do painel, ao trocar de pagina.
 *
 * Fica abaixo do `layout.tsx` do painel, entao cabecalho e barra lateral
 * continuam desenhados e so a area de conteudo mostra o aviso. Sem este
 * arquivo, o aviso mais alto da arvore assumiria a tela inteira e a moldura
 * piscaria a cada navegacao — a barra lateral sumindo e voltando a cada
 * clique de menu e mais incomodo que a espera em si.
 *
 * As paginas do painel sao as que mais esperam: elas montam contra o banco,
 * e algumas somam integrantes, locais e coordenadas antes de ter o que
 * desenhar.
 */
export default function Loading() {
  return <LoadingScreen />;
}
