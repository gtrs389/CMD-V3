import { cn } from '@/lib/utils/cn';

/**
 * Aviso de que a tela esta sendo carregada.
 *
 * Existe porque as paginas deste sistema sao montadas no SERVIDOR, contra o
 * banco: enquanto a resposta nao chega, o navegador nao tem o que desenhar.
 * Sem um `loading.tsx` por perto, o Next nao tem o que por no lugar, e o que
 * a pessoa ve e a tela VAZIA — indistinguivel de um sistema travado. Quem
 * espera sem sinal nenhum recarrega a pagina, e recarregar recomeca a
 * espera.
 *
 * O `role="status"` com `aria-live` faz o leitor de tela anunciar a espera
 * em vez de ler um vazio.
 *
 * Nada aqui depende de movimento para ser lido: parado — que e o que ve quem
 * pediu menos movimento no sistema — continua sendo o anel, a palavra e os
 * tres pontos.
 */

interface LoadingScreenProps {
  /** Texto principal. Sem os pontos: eles sao desenhados e animados aqui. */
  label?: string;
  /** Uma linha a mais, quando a espera tem motivo que valha explicar. */
  description?: string;
  /**
   * Ocupa a JANELA inteira, e nao so o espaco do pai.
   *
   * Usado onde ainda nao ha moldura desenhada — antes do cabecalho e da
   * barra lateral existirem na tela. Dentro do painel o aviso fica na area
   * de conteudo, para a moldura nao piscar a cada navegacao.
   */
  fullscreen?: boolean;
  /**
   * Preenche EXATAMENTE o espaco do pai, sem altura minima propria.
   *
   * Para quem ja tem uma moldura de altura definida e so precisa preencher o
   * miolo — o mapa e o caso: o cartao dele ja reservou a altura, e uma
   * altura minima aqui esticaria a pagina enquanto carrega.
   */
  fill?: boolean;
  className?: string;
}

export function LoadingScreen({
  label = 'Carregando',
  description,
  fullscreen = false,
  fill = false,
  className,
}: LoadingScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex w-full flex-col items-center justify-center gap-5 px-6 text-center',
        fullscreen ? 'min-h-dvh' : fill ? 'h-full' : 'min-h-[60vh] py-16',
        className,
      )}
    >
      {/* Dois aneis, girando em sentidos opostos, e o ponto que pulsa no
          centro. O de fora e a pista; o de dentro e o que anda nela. */}
      <span aria-hidden="true" className="relative flex size-14 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-accent-100" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent-600" />
        <span className="animate-giro-inverso absolute inset-2 rounded-full border-2 border-transparent border-b-accent-400" />
        <span className="animate-shimmer size-2 rounded-full bg-accent-600" />
      </span>

      <p className="text-base font-semibold text-ink-900">
        {label}
        {/* Os pontos sao tres elementos, e nao o texto "...": e o que
            permite a onda. Ficam fora do rotulo lido em voz alta — o leitor
            de tela ja anuncia "Carregando", e tres pontos saltitantes nao
            acrescentam nada a quem escuta. */}
        <span aria-hidden="true">
          {[0, 1, 2].map((indice) => (
            <span
              key={indice}
              className="carregando-ponto inline-block"
              style={{ ['--ponto-atraso' as string]: `${indice * 160}ms` }}
            >
              .
            </span>
          ))}
        </span>
      </p>

      {description ? (
        <p className="max-w-xs text-sm text-balance text-ink-500">{description}</p>
      ) : null}
    </div>
  );
}
