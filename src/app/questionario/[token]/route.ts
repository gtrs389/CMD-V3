import { NextResponse, type NextRequest } from 'next/server';
import { resolveSurveyLink } from '@/lib/server/survey.service';
import {
  attachSurveyContext,
  attachPublicState,
  clearPublicContext,
} from '@/lib/server/public-context';

/**
 * Entrada do link do questionario.
 *
 * Espelha a rota do convite de cadastro e tem a mesma disciplina: nao desenha
 * nada, valida tudo no servidor, guarda o contexto em cookie `HttpOnly` e
 * devolve um redirect 303 para `/`. A barra de endereco fica so com o
 * dominio — sem token, slug, query nem fragmento.
 *
 * Assim como no cadastro, esta rota NAO RESERVA o link. Enviar o endereco
 * por WhatsApp, Telegram, Facebook ou e-mail faz o servidor do aplicativo
 * abri-lo sozinho para montar a previa, e nenhum deles guarda cookie:
 * reservar aqui faria o primeiro robo ficar com o link e a pessoa receber
 * "link encerrado" sem ter aberto nada. A reserva acontece em
 * `GET /api/public/questionario`, que so roda quando o formulario carrega de
 * verdade em um navegador.
 *
 * Quem responde o questionario NAO vira integrante: esta rota nao toca em
 * cadastro, usuario ou convite de recrutamento.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, ctx: RouteContext<'/questionario/[token]'>) {
  const { token } = await ctx.params;

  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');

  // Abrir um link novo nunca herda o contexto do anterior.
  clearPublicContext(response);

  const estado = await resolveSurveyLink(token).catch(() => ({ kind: 'unavailable' as const }));

  // Encerrado, reservado por outro aparelho ou vencido: sempre a mesma tela,
  // sem dizer qual dos casos foi.
  if (estado.kind === 'gone') {
    attachPublicState(response, 'questionario-encerrado');
    return response;
  }

  // Inexistente, desligado pelo time ou ainda sem nenhuma pergunta.
  if (estado.kind === 'unavailable') {
    attachPublicState(response, 'questionario-indisponivel');
    return response;
  }

  attachSurveyContext(response, token, estado.expiresAt);
  return response;
}
