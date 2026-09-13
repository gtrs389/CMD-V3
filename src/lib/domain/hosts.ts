/**
 * Os dois enderecos do sistema.
 *
 *   painel.<dominio>   o painel: login, cadastro, configuracoes, tudo.
 *   <dominio>          o dominio publico, que vai nos links enviados por
 *                      WhatsApp. Serve o formulario de cadastro, o
 *                      questionario e o acesso do time — e mais nada.
 *
 * A separacao existe por seguranca: a tela de login e por onde um ataque
 * comeca, e ela nao tem por que ficar exposta no endereco que milhares de
 * pessoas recebem. No dominio publico, quem tenta abrir o painel e mandado
 * para um endereco escolhido pelo ADMIN.
 *
 * COMO O PAINEL E RECONHECIDO, em ordem:
 *
 *   1. endereco de desenvolvimento ou de previa (localhost, 127.0.0.1,
 *      *.vercel.app): e painel. Sao os enderecos usados para testar, e
 *      trancar o login neles deixaria qualquer um sem entrada;
 *   2. `CMD_PANEL_HOST`, quando configurada: manda sozinha;
 *   3. sem ela, vale a convencao: o painel e o subdominio `painel.`.
 *
 * A regra 3 existe porque a versao anterior dependia SO da variavel — e ela
 * e lida no Edge, onde o valor entra no pacote na hora do build. Configurar
 * depois, ou esquecer, fazia a separacao simplesmente nao acontecer: a tela
 * de login continuava aberta no endereco publico e nada avisava. Agora o
 * caminho comum funciona sem configuracao nenhuma, e a variavel serve para
 * quem usa outro subdominio.
 *
 * Modulo comum, sem `server-only`: o proxy (Edge) e as paginas (Node) leem
 * as mesmas regras.
 */

/** Compara hosts ignorando porta, maiusculas e o ponto final do FQDN. */
function normalize(host: string | null | undefined): string {
  return (host ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .split(':')[0]
    .replace(/^www\./, '');
}

/** Subdominio do painel, quando nao ha variavel dizendo outra coisa. */
const PANEL_PREFIX = 'painel.';

/**
 * Endereco de desenvolvimento ou de previa.
 *
 * Nao e o dominio publico de ninguem: e onde se testa. Trancar o login aqui
 * deixaria sem entrada quem esta desenvolvendo ou revisando uma previa.
 */
function isLocalOrPreview(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.endsWith('.localhost') ||
    host.endsWith('.vercel.app')
  );
}

/** O endereco recebido e o do painel? */
export function isPanelHost(host: string | null | undefined): boolean {
  const atual = normalize(host);
  if (!atual) return false;
  if (isLocalOrPreview(atual)) return true;

  const configurado = normalize(process.env.CMD_PANEL_HOST);
  if (configurado) return atual === configurado;

  return atual.startsWith(PANEL_PREFIX);
}

/**
 * Caminhos que o dominio publico serve.
 *
 * Sao as portas de entrada dos links enviados e o que elas precisam para
 * funcionar. Tudo o que nao esta aqui e painel.
 *
 * `/` entra na lista porque e onde as telas publicas sao desenhadas, a
 * partir do cookie de contexto — a propria pagina manda embora quem chega
 * sem contexto nenhum.
 */
const PUBLIC_PREFIXES = [
  '/convite/',
  '/questionario/',
  '/acesso/',
  '/api/public/',
  '/api/acesso-time',
  // Estado, municipio, bairro e rua: as listas encadeadas do endereco. Sao
  // do formulario publico, e sem elas o campo de endereco fica vazio no
  // dominio que justamente serve os links enviados.
  '/api/localidades',
  '/saida',
] as const;

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Para onde vai quem chega ao dominio publico sem um link valido. */
export const PUBLIC_EXIT_PATH = '/saida';
