/**
 * Qual banner o celular mostra ao abrir um link de cadastro.
 *
 * Modulo PURO, e a decisao vive so aqui — nao no componente. Ele desenha o
 * que recebe.
 *
 * O banner era UM SO para o sistema inteiro, com o endereco escrito dentro do
 * proprio componente. Funcionava enquanto havia uma operacao. Com um Time
 * DEMO na mesma tela, a demonstracao passou a exibir o banner de PRODUCAO de
 * um cliente real — a arte dele, o nome dele, na apresentacao de outra
 * pessoa. E nao ha correcao possivel em cima de um endereco fixo.
 */

/**
 * Banner padrao do sistema, exatamente como esta publicado.
 *
 * Servido do Storage publico do projeto, no endereco entregue pela producao.
 * O navegador baixa o arquivo original, byte a byte: nada recorta, converte,
 * recomprime ou reprocessa a imagem.
 *
 * E o banner de quem ainda nao subiu o seu. Para trocar o padrao, troque o
 * arquivo nesse endereco.
 */
export const DEFAULT_INVITE_BANNER =
  'https://zpfhqweydlujotqbuwse.supabase.co/storage/v1/object/public/imagem_url/00.png';

export interface InviteBannerSource {
  /** Banner proprio do time, ja assinado (migration 035). */
  banner: string | null;
  /** Time de demonstracao. */
  isDemo: boolean;
}

/**
 * Endereco da imagem, ou `null` quando nao ha banner para mostrar.
 *
 * Tres casos, nesta ordem:
 *
 *   1. o time subiu o seu — e ele, sempre;
 *   2. e um Time DEMO sem banner proprio — NENHUM. A tela cai na faixa de
 *      convite comum. Emprestar a arte de producao de um cliente real para
 *      uma demonstracao seria pior do que nao ter banner nenhum;
 *   3. qualquer outro time — o banner padrao do sistema, como sempre foi.
 */
export function inviteBannerSrc(source: InviteBannerSource): string | null {
  if (source.banner) return source.banner;
  if (source.isDemo) return null;
  return DEFAULT_INVITE_BANNER;
}
