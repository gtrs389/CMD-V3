'use client';

/* eslint-disable @next/next/no-img-element */
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { BannerTag } from '@/lib/types';
import { DEFAULT_BANNER_TAG } from '@/lib/types';

/**
 * Banner oficial do convite, exclusivo do celular.
 *
 * A imagem e o ARQUIVO tal como foi entregue, seja o banner do proprio time
 * ou o padrao do sistema: nada aqui
 * recorta, estica, recompoe, adiciona borda ou reprocessa um unico pixel. O
 * `img` recebe largura total e altura automatica, entao a proporcao original
 * e a do proprio arquivo — nao existe caixa com proporcao fixa para a imagem
 * brigar, e por isso tambem nao aparece faixa branca em lugar nenhum.
 *
 * A unica coisa desenhada por cima e a identificacao dinamica: o nome do
 * time e o codigo visual daquele link. Ela vive em uma camada HTML
 * posicionada em PORCENTAGEM dentro da propria imagem, nunca da tela, entao
 * acompanha o banner quando ele encolhe. O tamanho da fonte usa unidades de
 * container (`cqw`), medidas na largura da imagem: a estampa guarda sempre a
 * mesma proporcao com o banner, entao o que o ADMIN ve na previa e o que
 * aparece no celular.
 *
 * Posicao, tamanho e cor vem do proprio time (migration 022): cada banner
 * tem a camisa em um lugar, e quem ajusta e o ADMIN geral, pela pagina do
 * time, vendo o resultado na hora.
 *
 * Some por completo a partir de 768 px: em tablet e desktop o banner nao e
 * renderizado e nao deixa espaco alto nenhum. E exclusivo do formulario
 * publico aberto pelo link de cadastro — login, painel, pagina do Time e
 * acesso por telefone nao o carregam.
 *
 * Qual arquivo aparece NAO se decide aqui: chega pronto em `src`, escolhido
 * por `inviteBannerSrc` — o banner do proprio time, quando ele subiu um, e o
 * padrao do sistema no resto. Sem `src`, ou se o arquivo nao carregar, o
 * componente desenha o `fallback` recebido, a faixa de convite de sempre, em
 * vez de deixar o topo da tela vazio.
 */

interface InviteBannerProps {
  /**
   * Endereco da imagem, ja decidido por `inviteBannerSrc`. Nulo desenha o
   * `fallback`: nenhum time empresta o banner de outro.
   */
  src: string | null;
  /** Nome do time, exibido como `#{NOME}`. */
  teamName: string;
  /**
   * Posicao, tamanho e cor da estampa, ajustados pelo ADMIN geral na pagina
   * do time. Tudo em porcentagem da propria imagem.
   */
  tag?: BannerTag;
  /**
   * Codigo visual daquele link (`H03`), impresso em uma segunda linha, logo
   * abaixo do nome. Sem `#`: a cerquilha e do nome do time, e repeti-la
   * faria o codigo parecer um segundo time. Opcional.
   */
  code?: string | null;
  /** Desenhado quando o arquivo do banner ainda nao existe. */
  fallback?: ReactNode;
  className?: string;
}

export function InviteBanner({
  src,
  teamName,
  tag = DEFAULT_BANNER_TAG,
  code,
  fallback,
  className,
}: InviteBannerProps) {
  const [quebrado, setQuebrado] = useState<string | null>(null);
  // `quebrado` guarda QUAL endereco falhou, e nao apenas que algo falhou:
  // trocar o banner do time precisa apagar a falha do anterior, senao a
  // imagem nova nunca chegaria a ser tentada.
  if (!src || quebrado === src) return <>{fallback ?? null}</>;

  return (
    <div
      className={className}
      // A camada da identificacao mede a LARGURA DA IMAGEM, e nao a da tela:
      // e isso que mantem o texto no mesmo ponto do banner em qualquer
      // aparelho.
      style={{ containerType: 'inline-size' } as CSSProperties}
    >
      <div className="relative">
        <img
          src={src}
          alt={`Convite do time ${teamName}`}
          onError={() => setQuebrado(src)}
          className="block w-full object-contain"
          style={{ height: 'auto' }}
        />

        {/* Identificacao dinamica: so texto, sem circulo, fundo, caixa,
            borda ou adesivo. O `multiply` faz a tinta assentar no tecido em
            vez de flutuar por cima dele. */}
        <p
          className="pointer-events-none absolute text-center font-bold uppercase select-none"
          style={{
            left: `${tag.left}%`,
            top: `${tag.top}%`,
            width: `${tag.width}%`,
            color: tag.color,
            // Proporcional a LARGURA DA IMAGEM, e so a ela. Sem piso em
            // pixels: o piso antigo travava o tamanho no celular — la o
            // banner e estreito, entao o valor em `cqw` caia abaixo dele e
            // mexer no ajuste nao mudava nada na tela de quem se cadastra,
            // so na previa larga do computador.
            fontSize: `${tag.size}cqw`,
            fontStretch: 'condensed',
            letterSpacing: '-0.01em',
            lineHeight: 1.05,
            mixBlendMode: 'multiply',
            whiteSpace: 'nowrap',
          }}
        >
          #{teamName}
          {code ? (
            <span
              className="block"
              style={{ fontSize: `${tag.size * 0.82}cqw`, letterSpacing: '0.08em' }}
            >
              {code}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
