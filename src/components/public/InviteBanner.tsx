'use client';

/* eslint-disable @next/next/no-img-element */
import { useState, type CSSProperties, type ReactNode } from 'react';

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
 * container (`cqw`), medidas na largura da imagem, com um piso em pixels
 * para continuar legivel em 320 px.
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

/** Arquivo oficial, servido estaticamente a partir de `public/`. */
export const INVITE_BANNER_SRC = '/banner/convite-mobile.png';

/**
 * Posicao e tamanho da identificacao, em porcentagem da IMAGEM.
 *
 * Os quatro numeros abaixo sao o unico ponto de ajuste fino da camada: eles
 * colocam o texto sobre a camisa clara, a esquerda. Mexer aqui move a
 * identificacao inteira, em qualquer largura de tela, porque tudo o mais e
 * proporcional.
 */
const MARCA = {
  /** Distancia da borda esquerda da imagem. */
  left: '3.1%',
  /** Distancia do topo da imagem. */
  top: '58%',
  /** Largura reservada para as duas linhas. */
  width: '24%',
  /** Corpo da primeira linha, proporcional a largura da imagem. */
  titulo: 'max(9px, 2.9cqw)',
  /** Corpo da segunda linha. */
  codigo: 'max(8px, 2.5cqw)',
} as const;

/** Verde-escuro da identidade, para o texto parecer impresso no tecido. */
const VERDE = '#0b5c2c';

interface InviteBannerProps {
  /** Nome do time, exibido como `#TIME {NOME}`. */
  teamName: string;
  /** Codigo visual daquele link, exibido como `#{CODIGO}`. Opcional. */
  code?: string | null;
  /** Desenhado quando o arquivo do banner ainda nao existe. */
  fallback?: ReactNode;
  className?: string;
}

export function InviteBanner({ teamName, code, fallback, className }: InviteBannerProps) {
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
          className="pointer-events-none absolute font-bold uppercase select-none"
          style={{
            left: MARCA.left,
            top: MARCA.top,
            width: MARCA.width,
            color: VERDE,
            fontSize: MARCA.titulo,
            fontStretch: 'condensed',
            letterSpacing: '-0.01em',
            lineHeight: 1.05,
            mixBlendMode: 'multiply',
            whiteSpace: 'nowrap',
          }}
        >
          #TIME {teamName}
          {code ? (
            <span
              className="block"
              style={{ fontSize: MARCA.codigo, letterSpacing: '0.02em' }}
            >
              #{code}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
