/**
 * Endereco dos tiles do mapa — o desenho que fica ATRAS dos pinos.
 *
 * Os pinos sao desenhados pelo proprio sistema; o mapa embaixo deles vem de
 * um servidor de tiles. Quando esse endereco nao presta, os pinos continuam
 * aparecendo, sobre um fundo cinza vazio — o mapa "some" sem nenhum erro de
 * tela, porque para o Leaflet nao houve falha nenhuma: ele pediu o que
 * mandaram pedir.
 *
 * O padrao e o OpenStreetMap, e ele NAO usa credencial: nao ha chave, token
 * nem conta para configurar. Por isso o caminho comum e nao configurar nada.
 *
 * O QUE ESTA FUNCAO EVITA, e por que ela existe em vez de um `??`:
 *
 *   - `NEXT_PUBLIC_MAP_TILE_URL` cadastrada e VAZIA na hospedagem. `??` cai
 *     no padrao apenas quando o valor e `undefined` — string vazia ele
 *     entrega inteira, e o mapa pede tile de lugar nenhum. Criar a variavel
 *     e deixar o campo em branco e o caminho mais curto para o fundo cinza;
 *   - o valor colado COM ASPAS. Em `.env` as aspas somem sozinhas; num painel
 *     de hospedagem elas entram no valor, e `"https://..."` nao e endereco;
 *   - o endereco sem `{z}/{x}/{y}`. Sem os tres, todo tile do mapa vira a
 *     mesma imagem, ou nenhuma.
 *
 * Em qualquer um dos tres o padrao vale: um mapa em pe vale mais que um
 * fundo cinza, e o valor configurado errado nao tem como estar certo.
 *
 * Modulo puro, sem `leaflet` e sem `window`: a regra e testavel sozinha.
 */

/** OpenStreetMap. Publico, sem credencial. */
export const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Os tres marcadores que todo endereco de tile precisa ter. */
const PLACEHOLDERS = ['{z}', '{x}', '{y}'] as const;

export function tileUrlFrom(configurado: string | null | undefined): string {
  // Aspas sobram de quem colou o valor com elas; espaco, de quem colou com
  // uma quebra de linha junto.
  const valor = (configurado ?? '').trim().replace(/^["']|["']$/g, '').trim();

  if (!valor) return DEFAULT_TILE_URL;
  if (!PLACEHOLDERS.every((marca) => valor.includes(marca))) return DEFAULT_TILE_URL;

  return valor;
}
