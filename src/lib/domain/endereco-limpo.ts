import { LOGIN_PATH, PROTECTED_PREFIXES } from '@/lib/auth/constants';

/**
 * Endereco limpo: a barra do navegador mostra so o dominio.
 *
 * O painel roda dentro de uma MOLDURA no endereco raiz (`/`): a pagina de
 * fora e sempre `dominio/`, e a navegacao de verdade — `/dashboard`,
 * `/candidatos/...` — acontece na moldura, onde a barra nao alcanca. As
 * telas publicas ja moravam em `/` (o contexto vai em cookie); faltava o
 * painel.
 *
 * Tres pecas:
 *
 *   1. `SCRIPT_DA_MOLDURA`, no `<head>` de toda pagina, antes de desenhar:
 *      uma tela do painel aberta DIRETO na barra (link colado, favorito,
 *      recarregar antigo) anota o caminho e troca para `/`; uma pagina que
 *      NAO e do painel carregada DENTRO da moldura (a raiz, a saida) sai
 *      dela e ocupa a janela inteira — nunca moldura dentro de moldura;
 *   2. a moldura (`MolduraDoPainel`), em `/`, abre o caminho anotado — ou a
 *      pagina inicial do perfil;
 *   3. `RotaDaMoldura`, dentro da moldura, anota cada tela aberta: recarregar
 *      a pagina volta para a mesma tela, e o titulo da aba acompanha.
 *
 * O caminho anotado fica em `sessionStorage` — por aba, e so no navegador.
 * Nada disso e protecao: quem quiser descobrir o caminho descobre. E so a
 * barra de endereco que deixa de mostra-lo.
 */

/** Chave do caminho anotado, em `sessionStorage`. */
export const CHAVE_DA_ROTA = 'cmd:rota';

/** Caminhos que moram na moldura: o painel e a tela de login. */
export const PREFIXOS_DA_MOLDURA: readonly string[] = [...PROTECTED_PREFIXES, LOGIN_PATH];

/** O caminho e uma tela do painel (vai para a moldura)? */
export function ehRotaDaMoldura(caminho: string): boolean {
  return PREFIXOS_DA_MOLDURA.some((p) => caminho === p || caminho.startsWith(`${p}/`));
}

/**
 * O caminho anotado, se ainda serve: uma tela do painel, deste mesmo site.
 * Qualquer outra coisa — vazio, `//outro-site`, `/api/...` — e ignorada, e a
 * moldura abre a pagina inicial.
 */
export function rotaGuardada(valor: string | null | undefined): string | null {
  if (!valor || !valor.startsWith('/') || valor.startsWith('//') || valor.includes('\\')) return null;
  const caminho = valor.split(/[?#]/)[0];
  return ehRotaDaMoldura(caminho) ? valor : null;
}

/**
 * Roda no `<head>`, antes de qualquer desenho: a troca de endereco acontece
 * sem a tela piscar. Qualquer falha (armazenamento bloqueado, por exemplo)
 * deixa a pagina como esta — o painel continua funcionando, so com o
 * caminho a vista.
 */
export const SCRIPT_DA_MOLDURA = `(function(){try{
var p=location.pathname,dentro=window.self!==window.top;
var prefixos=${JSON.stringify(PREFIXOS_DA_MOLDURA)};
var painel=prefixos.some(function(x){return p===x||p.indexOf(x+'/')===0;});
if(!dentro){
if(painel){sessionStorage.setItem(${JSON.stringify(CHAVE_DA_ROTA)},p+location.search);document.documentElement.style.visibility='hidden';location.replace('/');}
}else if(!painel){
document.documentElement.style.visibility='hidden';window.top.location.replace(p==='/'?'/':location.href);
}
}catch(e){document.documentElement.style.visibility='';}})();`;
