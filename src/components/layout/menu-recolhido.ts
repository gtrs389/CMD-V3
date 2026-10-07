/**
 * Menu lateral recolhido: so os icones, e o conteudo ganha a largura.
 *
 * E uma preferencia DESTE navegador (localStorage): quem recolheu volta e
 * encontra recolhido. O estado mora no atributo `data-menu` do <html>, e o
 * CSS faz o resto (variantes `recolhido:` e `menu-recolhido:` em
 * globals.css) — o React so troca o atributo.
 */

export const CHAVE_DO_MENU = 'cmd:menu';

/** Roda no <head>, antes de desenhar: a pagina ja abre no tamanho certo. */
export const SCRIPT_DO_MENU = `try{if(localStorage.getItem('${CHAVE_DO_MENU}')==='recolhido')document.documentElement.setAttribute('data-menu','recolhido')}catch(e){}`;

export function menuEstaRecolhido(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-menu') === 'recolhido';
}

/** Recolhe ou abre o menu, e guarda a escolha (sem armazenamento, vale so ate recarregar). */
export function alternarMenu(): boolean {
  const recolher = !menuEstaRecolhido();
  if (recolher) document.documentElement.setAttribute('data-menu', 'recolhido');
  else document.documentElement.removeAttribute('data-menu');
  try {
    if (recolher) localStorage.setItem(CHAVE_DO_MENU, 'recolhido');
    else localStorage.removeItem(CHAVE_DO_MENU);
  } catch {
    // Navegacao privada ou armazenamento bloqueado: segue sem lembrar.
  }
  // O mapa (Leaflet) precisa saber que o espaco dele mudou.
  window.setTimeout(() => window.dispatchEvent(new Event('resize')), 320);
  return recolher;
}
