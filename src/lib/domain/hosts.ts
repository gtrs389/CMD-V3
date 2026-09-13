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
 * Qual e o endereco do painel vem da variavel de ambiente `CMD_PANEL_HOST`.
 * SEM ELA, NADA MUDA: todo endereco continua servindo tudo, como antes. E
 * proposital — uma instalacao que ainda nao separou os dominios nao pode
 * perder o proprio login por causa de uma configuracao ausente.
 *
 * Modulo comum, sem `server-only`: o middleware (Edge) e as paginas
 * (Node) leem as mesmas regras.
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

/**
 * O endereco recebido e o do painel?
 *
 * Sem `CMD_PANEL_HOST` configurada, sempre verdadeiro: o comportamento
 * antigo continua valendo em qualquer endereco.
 */
export function isPanelHost(host: string | null | undefined): boolean {
  const painel = normalize(process.env.CMD_PANEL_HOST);
  if (!painel) return true;
  return normalize(host) === painel;
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
  '/saida',
] as const;

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Para onde vai quem chega ao dominio publico sem um link valido. */
export const PUBLIC_EXIT_PATH = '/saida';
