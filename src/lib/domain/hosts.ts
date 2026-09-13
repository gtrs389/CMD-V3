/**
 * Os tres enderecos do sistema.
 *
 *   <adm>.<dominio>    SO o ADMIN geral entra por aqui. A sessao de
 *                      qualquer outro perfil nao vale neste endereco, e
 *                      nenhuma porta publica e servida.
 *   painel.<dominio>   por onde o Administrador do time e a equipe entram,
 *                      pelo link de acesso do proprio time + telefone. Aqui
 *                      nao existe tela de e-mail e senha.
 *   <dominio>          SO OS CADASTROS: Formulario 1 e Formulario 2, os
 *                      links que vao por WhatsApp. Ninguem entra no sistema
 *                      por este endereco.
 *
 * Cada endereco tem UMA porta, e a porta de um nao abre no outro.
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
 * Subdominio exclusivo do ADMIN geral.
 *
 * Nao e um nome que se adivinhe, e essa e a ideia: o painel do ADMIN deixa
 * de morar em um endereco que qualquer um tenta no escuro. Quem usa outro
 * subdominio configura `CMD_ADMIN_HOST`.
 */
const ADMIN_PREFIX = '7061696e656c2061646d.';

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

/**
 * O endereco recebido e o EXCLUSIVO do ADMIN geral?
 *
 * Desenvolvimento e previa respondem nao: la nao existe endereco exclusivo,
 * e tratar `localhost` como tal trancaria o proprio ambiente de teste para
 * todos os outros perfis.
 */
export function isAdminHost(host: string | null | undefined): boolean {
  const atual = normalize(host);
  if (!atual) return false;
  if (isLocalOrPreview(atual)) return false;

  const configurado = normalize(process.env.CMD_ADMIN_HOST);
  if (configurado) return atual === configurado;

  return atual.startsWith(ADMIN_PREFIX);
}

/**
 * O endereco recebido serve o painel?
 *
 * O endereco do ADMIN tambem e painel: e por ele que o ADMIN entra. A
 * pergunta "quem pode usar este painel" e outra, e quem responde e
 * `isAdminHost` junto com a sessao — esconder tela nunca foi protecao.
 */
export function isPanelHost(host: string | null | undefined): boolean {
  const atual = normalize(host);
  if (!atual) return false;
  if (isLocalOrPreview(atual)) return true;
  if (isAdminHost(atual)) return true;

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
  '/api/public/',
  // Estado, municipio, bairro e rua: as listas encadeadas do endereco. Sao
  // do formulario publico, e sem elas o campo de endereco fica vazio no
  // dominio que justamente serve os links enviados.
  '/api/localidades',
  '/saida',
] as const;

/**
 * O dominio publico serve SO OS CADASTROS.
 *
 * O acesso do time — `/acesso/` e `/api/acesso-time` — saiu desta lista: ele
 * e a porta do Administrador do time e da equipe, e essa porta e `painel.`.
 * Ele estava aqui porque os dois enderecos eram um so; mantido, um link de
 * acesso aberto no dominio publico autenticaria a pessoa e, no passo
 * seguinte, a mandaria para a saida — o painel nao e servido ali.
 */

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * O endereco serve a porta de entrada do ADMIN geral?
 *
 * E-mail e senha sao so do ADMIN geral, e essa porta agora mora em UM
 * endereco. Em `painel.` ela nao existe mais: quem digita aquele endereco
 * nao pode cair na tela de login do ADMIN — e por ela que um ataque
 * comeca, e aquele endereco e conhecido.
 *
 * Desenvolvimento e previa continuam servindo a porta. Alem de nao trancar
 * quem testa, isso e a SAIDA DE EMERGENCIA: se o DNS do endereco exclusivo
 * cair ou ainda nao estiver no ar, o endereco `*.vercel.app` da propria
 * publicacao continua aceitando o login do ADMIN.
 */
export function servesAdminLogin(host: string | null | undefined): boolean {
  const atual = normalize(host);
  if (!atual) return false;
  if (isLocalOrPreview(atual)) return true;
  return isAdminHost(atual);
}

/**
 * Caminhos que SO o endereco do ADMIN geral serve.
 *
 * Curta de proposito: sao as duas portas de e-mail e senha. O resto do
 * painel do ADMIN nao precisa entrar aqui porque a sessao dele ja nao vale
 * em outro endereco — e quem decide isso e o servidor, contra o banco, e
 * nao esta lista.
 */
const ADMIN_ONLY_PREFIXES = ['/login', '/api/auth/login'] as const;

export function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Portas de entrada de link enviado, que o endereco do ADMIN NAO serve.
 *
 * Link de cadastro, Formulario 2 e acesso do time pertencem ao dominio
 * publico: recebe-los no endereco do ADMIN daria a ele um uso que nao e
 * dele — e faria o endereco circular por WhatsApp.
 *
 * A lista e escrita a mao, e nao derivada de `PUBLIC_PREFIXES`, porque nem
 * todo caminho publico e porta de entrada:
 *
 *   - `/api/localidades` e das listas de estado, municipio, bairro e rua, e
 *     o proprio painel do ADMIN as usa para cadastrar alguem a mao. Bloquea-lo
 *     deixaria o endereco do ADMIN com o campo de endereco quebrado;
 *   - `/saida` e a propria saida;
 *   - `/` decide o que desenhar e, sem contexto publico, leva ao login.
 */
const ADMIN_BLOCKED_PREFIXES = [
  '/convite/',
  '/questionario/',
  '/acesso/',
  '/api/public/',
  '/api/acesso-time',
] as const;

export function isPublicEntryPath(pathname: string): boolean {
  return ADMIN_BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Endereco do PAINEL deduzido de qualquer endereco do sistema.
 *
 * O link de acesso do time tem de apontar para `painel.`: e por ele que o
 * Administrador do time e a equipe entram. Montado com o endereco da aba
 * aberta, ele sairia com o endereco do ADMIN — e, pelo dominio publico, a
 * pessoa se autenticaria para em seguida cair na saida, porque o painel nao
 * e servido la.
 *
 * Devolve nulo em desenvolvimento e previa: ali um endereco so serve tudo, e
 * trocar o host quebraria o proprio ambiente de teste.
 */
export function panelHostFrom(host: string | null | undefined): string | null {
  const atual = normalize(host);
  if (!atual || isLocalOrPreview(atual)) return null;

  const configurado = normalize(process.env.CMD_PANEL_HOST);
  if (configurado) return configurado;

  if (atual.startsWith(PANEL_PREFIX)) return atual;

  // Tira o primeiro rotulo quando ele existe (o endereco do ADMIN) e poe o
  // do painel no lugar. No dominio raiz nao ha rotulo a tirar.
  const rotulos = atual.split('.');
  const base = rotulos.length >= 3 ? rotulos.slice(1).join('.') : atual;
  return `${PANEL_PREFIX}${base}`;
}

/**
 * Endereco publico deduzido de um endereco de painel.
 *
 * `painel.x` e `<adm>.x` viram `www.x`. E o que impede um link gerado de
 * dentro do painel de sair apontando para o painel — no endereco do ADMIN
 * isso seria pior do que um link quebrado: divulgaria, em cada convite
 * enviado, exatamente o endereco que existe para nao ser conhecido.
 *
 * Devolve nulo quando nao ha o que deduzir: no proprio dominio publico, em
 * desenvolvimento, ou quando o painel nao esta em um subdominio (menos de
 * tres rotulos) — ai nao existe primeiro rotulo para trocar.
 */
export function publicHostFrom(host: string | null | undefined): string | null {
  const atual = normalize(host);
  if (!atual || isLocalOrPreview(atual)) return null;
  if (!isPanelHost(atual)) return null;

  const rotulos = atual.split('.');
  if (rotulos.length < 3) return null;

  return `www.${rotulos.slice(1).join('.')}`;
}

/** Para onde vai quem chega ao dominio publico sem um link valido. */
export const PUBLIC_EXIT_PATH = '/saida';
