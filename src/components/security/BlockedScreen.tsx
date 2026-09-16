/**
 * Tela de acesso bloqueado.
 *
 * So o desenho: quem decide QUANDO ela aparece e `AccessShield`. Fica em
 * componente proprio porque e a unica coisa aqui que uma pessoa ve, e ela
 * precisa ser lida em um segundo — fundo preto, o triangulo, duas linhas.
 *
 * Nada de imagem externa: a grade e o triangulo sao CSS e SVG, entao a tela
 * aparece inteira no mesmo instante, sem esperar arquivo nenhum. Ela tambem
 * e desenhada por cima do que ja estava na tela, sem desmontar nada: quem
 * caiu aqui por engano no meio de um cadastro nao perde o que digitou.
 */
export function BlockedScreen() {
  return (
    <div
      role="alertdialog"
      aria-label="Acesso bloqueado"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-[#050505] px-6 text-center select-none"
      style={{
        // A grade vermelha: as cruzes nos cruzamentos e, atras delas, as
        // linhas bem fracas. A cruz e um SVG escrito aqui mesmo, no proprio
        // atributo — nao e arquivo, nao e requisicao, nao tem o que falhar
        // ao carregar.
        backgroundImage: [
          `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='78' height='78'%3E%3Cpath d='M39 33.5v11M33.5 39h11' stroke='%23dc2626' stroke-width='1.3' stroke-linecap='round' opacity='0.55'/%3E%3C/svg%3E")`,
          'linear-gradient(rgba(220,38,38,0.07) 1px, transparent 1px)',
          'linear-gradient(90deg, rgba(220,38,38,0.07) 1px, transparent 1px)',
        ].join(','),
        backgroundSize: '78px 78px, 78px 78px, 78px 78px',
      }}
    >
      {/* Brilho vermelho ao fundo, atras do triangulo. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(220,38,38,0.18) 0%, rgba(220,38,38,0.05) 42%, transparent 70%)',
        }}
      />

      <div className="relative flex flex-col items-center">
        {/* Anel discreto atras do simbolo, como no desenho aprovado. */}
        <div className="relative flex items-center justify-center">
          <div
            aria-hidden="true"
            className="absolute size-[15rem] rounded-full border border-red-900/40 sm:size-[17rem]"
          />
          <div
            aria-hidden="true"
            className="absolute size-[12.5rem] rounded-full border border-red-900/25 sm:size-[14rem]"
          />

          <svg
            viewBox="0 0 120 106"
            aria-hidden="true"
            className="relative w-44 sm:w-52"
            style={{ filter: 'drop-shadow(0 0 18px rgba(239,68,68,0.85))' }}
          >
            <path
              d="M60 8 L114 99 H6 Z"
              fill="none"
              stroke="#ef4444"
              strokeWidth="8"
              strokeLinejoin="round"
            />
            <rect x="54.5" y="40" width="11" height="31" rx="5.5" fill="#ef4444" />
            <circle cx="60" cy="82" r="6" fill="#ef4444" />
          </svg>
        </div>

        <h1 className="mt-10 text-4xl leading-none font-extrabold tracking-tight text-white uppercase sm:text-5xl">
          Acesso bloqueado
        </h1>

        {/* Uma linha so, inclusive no celular estreito: e a frase que da o
            recado, e quebrada ao meio ela perde a forca. Por isso ela e
            menor aqui do que no computador. */}
        <p className="mt-4 text-xs font-bold text-white/90 sm:text-base">
          Esta página é monitorada 24 horas por dia.
        </p>
      </div>
    </div>
  );
}
