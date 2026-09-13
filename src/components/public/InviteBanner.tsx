'use client';

/* eslint-disable @next/next/no-img-element */
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { BannerTag } from '@/lib/types';
import { DEFAULT_BANNER_TAG } from '@/lib/types';

/**
 * Banner oficial do convite, exclusivo do celular.
 *
 * A imagem e o ARQUIVO DE PRODUCAO, servido tal como foi entregue: nada aqui
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
 * Enquanto o arquivo oficial nao estiver publicado em `public/`, o
 * componente desenha o `fallback` recebido — a faixa de convite de sempre —
 * em vez de deixar o topo da tela vazio.
 */

/**
 * Arquivo oficial do banner, exatamente como esta publicado.
 *
 * Servido do proprio Storage do projeto, no endereco publico entregue pela
 * producao. O navegador baixa o arquivo original, byte a byte: nada aqui
 * recorta, converte, recomprime ou passa a imagem por qualquer
 * processamento.
 *
 * Para trocar o banner, troque o arquivo nesse endereco — ou publique um
 * arquivo em `public/banner/` e aponte esta constante para ele. Nenhuma
 * outra linha muda.
 */
export const INVITE_BANNER_SRC =
  'https://zpfhqweydlujotqbuwse.supabase.co/storage/v1/object/public/imagem_url/00.png';

interface InviteBannerProps {
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
  teamName,
  tag = DEFAULT_BANNER_TAG,
  code,
  fallback,
  className,
}: InviteBannerProps) {
  const [indisponivel, setIndisponivel] = useState(false);
  if (indisponivel) return <>{fallback ?? null}</>;

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
          src={INVITE_BANNER_SRC}
          alt={`Convite do time ${teamName}`}
          onError={() => setIndisponivel(true)}
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
