/* eslint-disable @next/next/no-img-element */
import type { CSSProperties, ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { appConfig } from '@/config/app.config';
import type { PublicInviteOwner } from '@/lib/types';
import { cn } from '@/lib/utils/cn';
import { initials } from '@/lib/utils/text';

/**
 * Moldura da pagina publica de cadastro. Sem cabecalho de marca: a
 * identidade da tela vem so do cartao azul-marinho.
 *
 * Desktop: coluna azul-marinho fixa a esquerda, com quem convidou, e o
 * formulario a direita, com rolagem propria.
 * Celular: faixa azul-marinho de ponta a ponta no topo e o formulario em uma
 * coluna, tudo rolando junto.
 *
 * Nao ha etapas, progresso nem pastilhas: o cadastro inteiro cabe em uma
 * pagina so.
 */

function OwnerAvatar({
  owner,
  fallbackName,
  className,
}: {
  owner: PublicInviteOwner | null;
  fallbackName: string;
  className: string;
}) {
  const name = owner?.name ?? fallbackName;
  const photo = owner?.photoUrl ?? null;

  if (photo) {
    return (
      <img
        src={photo}
        alt={`Foto de ${name}`}
        className={cn('shrink-0 rounded-full border-2 border-navy-600 object-cover', className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border-2 border-navy-600 bg-navy-700 font-semibold text-white',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

interface OwnerProps {
  owner: PublicInviteOwner | null;
  /** Nome da operacao, usado quando o convite nao tem dono registrado. */
  fallbackName: string;
  className?: string;
}

/**
 * Faixa azul-marinho do celular.
 *
 * Sangra de ponta a ponta, sem margem nem canto arredondado: e a primeira
 * coisa que a pessoa ve ao abrir o link, e ocupar a largura inteira faz ela
 * parecer o topo do proprio aplicativo, nao um cartao solto dentro da
 * pagina.
 *
 * A foto ocupa toda a altura a esquerda, cortada de forma a manter os
 * rostos no alto, e se dissolve no azul antes de encostar no texto. A
 * direita, a hierarquia em tres degraus: de quem e o convite, quem convidou
 * e o convite em si.
 */
export function InviteOwnerBanner({ owner, fallbackName, className }: OwnerProps) {
  const name = owner?.name ?? fallbackName;
  const photo = owner?.photoUrl ?? null;

  return (
    <section
      aria-label="Quem enviou o convite"
      className={cn(
        'relative flex min-h-30 overflow-hidden bg-navy-900 shadow-overlay',
        'bg-gradient-to-br from-navy-800 via-navy-900 to-navy-900',
        className,
      )}
    >
      <div className="relative w-[38%] max-w-44 shrink-0 self-stretch">
        {photo ? (
          <img
            src={photo}
            alt={`Foto de ${name}`}
            className="absolute inset-0 size-full object-cover object-top"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-full items-center justify-center bg-navy-700 text-2xl font-bold text-white"
          >
            {initials(name)}
          </span>
        )}

        {/* A foto se dissolve no azul: sem corte duro entre imagem e texto. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-12 bg-gradient-to-r from-transparent to-navy-900"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-4">
        <p className="text-[0.5625rem] font-bold tracking-[0.18em] text-navy-300 uppercase">
          Convite de
        </p>
        <p className="mt-0.5 truncate text-base leading-tight font-extrabold tracking-tight text-white uppercase">
          {name}
        </p>
        <p className="mt-2.5 text-[0.9375rem] leading-snug font-bold text-balance text-white">
          Faça parte desta mobilização.
        </p>
      </div>
    </section>
  );
}

/**
 * Malha de pontos do fundo.
 *
 * Desenhada aqui mesmo, em SVG: nenhuma imagem e nenhum recurso externo e
 * carregado so para decorar. Fica atras do conteudo, sem receber clique e
 * sem ser anunciada por leitor de tela.
 *
 * Os pontos vivem nas bordas, em tres grupos, e o miolo fica limpo: a malha
 * e ambiente, nunca concorre com o texto. As linhas sao finas de verdade
 * (`non-scaling-stroke`), entao nao engrossam quando a coluna estica.
 */
function AsideMesh() {
  /** Grupos de pontos, ja ligados entre si. Coordenadas em porcentagem. */
  const clusters: Array<Array<[number, number]>> = [
    // Alto, a direita.
    [
      [66, 5],
      [83, 11],
      [96, 4],
      [88, 23],
      [72, 18],
    ],
    // Beirada direita, no meio.
    [
      [97, 40],
      [89, 52],
      [99, 63],
    ],
    // Base, a esquerda.
    [
      [6, 70],
      [17, 82],
      [3, 89],
      [25, 93],
    ],
    // Canto de baixo, a direita.
    [
      [80, 86],
      [93, 79],
      [88, 97],
    ],
  ];

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
    >
      {clusters.map((pontos, grupo) => (
        <g key={grupo}>
          <g stroke="#7bb4ff" strokeWidth="0.5" opacity="0.16" vectorEffect="non-scaling-stroke">
            {pontos.slice(1).map(([x, y], index) => (
              <line
                key={`${x}-${y}`}
                x1={pontos[index][0]}
                y1={pontos[index][1]}
                x2={x}
                y2={y}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>

          <g fill="#9ecbff">
            {pontos.map(([x, y], index) => (
              <ellipse
                key={`${x}-${y}`}
                className="mesh-dot"
                cx={x}
                cy={y}
                rx={0.5}
                ry={0.25}
                style={
                  {
                    // Atraso e duracao tirados da propria posicao: a malha
                    // pisca fora de compasso sem depender de sorteio, que
                    // mudaria entre o servidor e o navegador.
                    '--mesh-delay': `${((grupo * 3 + index) % 7) * 0.8}s`,
                    '--mesh-duration': `${5 + ((x + y) % 4)}s`,
                  } as CSSProperties
                }
              />
            ))}
          </g>
        </g>
      ))}
    </svg>
  );
}

/**
 * Cartao azul-marinho lateral do desktop.
 *
 * Fixo em toda a altura da tela: quem preenche o formulario nunca perde de
 * vista quem convidou. Apenas a coluna do formulario, ao lado, tem rolagem
 * propria.
 *
 * A ordem e a do desenho: o rotulo do convite, quem convidou, a foto, o nome,
 * o convite em si e, depois de um divisor, o aviso de ambiente seguro.
 */
export function InviteOwnerAside({ owner, fallbackName, className }: OwnerProps) {
  const name = owner?.name ?? fallbackName;

  return (
    <aside
      className={cn(
        'relative flex-col overflow-hidden bg-navy-900 p-8 lg:p-10',
        'bg-gradient-to-br from-navy-800 via-navy-900 to-navy-900',
        className,
      )}
    >
      <AsideMesh />

      {/* Brilho suave no alto, para o topo nao ficar chapado. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-accent-500/20 blur-3xl"
      />

      <div className="relative flex flex-col">
        <p className="text-[0.625rem] font-semibold tracking-[0.16em] text-navy-200 uppercase">
          Convite de mobilização
        </p>

        <p className="mt-6 text-[0.9375rem] text-white/85">Você foi convidado(a) por</p>

        <div className="mt-4">
          <OwnerAvatar
            owner={owner}
            fallbackName={fallbackName}
            className="size-32 ring-4 ring-white/10"
          />
        </div>

        <h2 className="mt-4 text-[1.375rem] leading-tight font-bold tracking-tight break-words text-white">
          {name}
        </h2>

        <p className="mt-3 text-[0.8125rem] leading-relaxed text-navy-300">
          Faça parte desta mobilização e ajude a construir uma equipe mais próxima das pessoas.
        </p>

        {/* Aviso de ambiente seguro, separado por um divisor discreto. */}
        <div className="mt-8 border-t border-white/10 pt-6">
          <div className="flex gap-3">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-400" />

            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-white">Ambiente seguro</p>
              <p className="mt-1.5 text-xs leading-relaxed text-navy-300">
                Seus dados estão protegidos e são usados apenas para esta mobilização.
              </p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * Moldura das telas de estado (carregando, erro, convite indisponivel e
 * cadastro enviado): um cartao centralizado, sem cabecalho — mesmo
 * tratamento da tela do formulario, para nao piscar uma faixa que some
 * assim que o convite carrega.
 */
export function InviteStateShell({ children }: { children: ReactNode }) {
  return (
    <main className="safe-x safe-top flex min-h-dvh flex-col bg-surface-muted">
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md animate-rise rounded-card border border-line bg-surface p-6 text-center shadow-card sm:p-8">
          {children}
        </div>
      </div>

      <p className="pb-6 text-center text-xs text-ink-400">{appConfig.shortName}</p>
    </main>
  );
}
