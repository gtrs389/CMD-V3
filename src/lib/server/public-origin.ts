import 'server-only';
import type { NextRequest } from 'next/server';
import { panelHostFrom, publicHostFrom } from '@/lib/domain/hosts';
import { getPublicEntry } from './settings.service';

/**
 * Endereco que vai nos links enviados.
 *
 * O sistema tem dois enderecos: o painel, onde o ADMIN e a equipe
 * trabalham, e o dominio publico, que vai nos links de cadastro enviados
 * por WhatsApp.
 *
 * O link era montado no navegador, com o endereco da aba aberta. Como quem
 * gera o link esta no painel, o link saia apontando para o painel — o
 * endereco que justamente nao deve ser divulgado, e onde a pessoa convidada
 * cairia na tela de saida. Por isso quem monta agora e o servidor.
 *
 * A ordem:
 *
 *   1. o endereco configurado em Configuracoes, quando houver. Ele manda, e
 *      pode ser corrigido sem publicar codigo;
 *   2. deduzido do proprio painel: `painel.x` — ou o endereco exclusivo do
 *      ADMIN — vira `www.x`;
 *   3. o endereco da propria requisicao, quando nao ha painel nenhum para
 *      trocar — o caso de quem ainda nao separou os dominios.
 */

/** `https://painel.exemplo.com` -> `https://www.exemplo.com`. */
function derive(origin: string): string {
  try {
    const url = new URL(origin);
    const publico = publicHostFrom(url.hostname);
    if (publico) url.hostname = publico;
    return url.origin;
  } catch {
    return origin;
  }
}

/** Endereco da requisicao, respeitando o proxy da hospedagem. */
function requestOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return request.nextUrl.origin;

  const protocol = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
  return `${protocol}://${host}`;
}

export async function publicOrigin(request: NextRequest): Promise<string> {
  const { linkOrigin } = await getPublicEntry().catch(() => ({ linkOrigin: '' }));
  if (linkOrigin) return linkOrigin.replace(/\/$/, '');

  return derive(requestOrigin(request));
}

/** Endereco completo de um link publico, pronto para copiar e enviar. */
export async function publicLink(request: NextRequest, path: string): Promise<string> {
  return `${await publicOrigin(request)}${path}`;
}

/**
 * Endereco do PAINEL, para o link de acesso do time.
 *
 * Nem todo link enviado vai para o dominio publico. O do Formulario 1 e o do
 * Formulario 2 vao: quem os recebe preenche um cadastro e nao entra no
 * sistema. Ja o link de ACESSO leva o Administrador do time e a equipe para
 * dentro do painel — e o painel deles e `painel.`.
 *
 * Mandar esse link para o dominio publico autenticaria a pessoa e, no passo
 * seguinte, a jogaria na saida; monta-lo no navegador o faria sair com o
 * endereco da aba aberta, que pode ser o endereco exclusivo do ADMIN.
 */
export function panelLink(request: NextRequest, path: string): string {
  const origin = requestOrigin(request);

  try {
    const url = new URL(origin);
    const painel = panelHostFrom(url.hostname);
    if (painel) url.hostname = painel;
    return `${url.origin}${path}`;
  } catch {
    return `${origin}${path}`;
  }
}
