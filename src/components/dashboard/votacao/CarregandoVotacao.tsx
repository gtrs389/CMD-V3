'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Vote } from 'lucide-react';
import { fotoDoCandidatoUrl, type CandidatoDaVotacao } from '@/lib/domain/votacao-tse';
import { FotoDoCandidato } from '@/components/apuracao/FotoDoCandidato';
import { cn } from '@/lib/utils/cn';

/**
 * A espera da votacao, por cima do mapa, depois do "Ver no mapa".
 *
 * Os escolhidos orbitam a urna, cada um na sua cor, com as ondas do radar
 * saindo dela; embaixo, as tres etapas do que esta acontecendo vao sendo
 * marcadas, e a barra corre. Quem clicou ve na hora que o pedido foi
 * aceito e o que esta vindo — nunca um mapa parado sem resposta.
 *
 * As etapas andam no relogio (o servidor responde de uma vez so); a ultima
 * fica esperando ate a votacao chegar e o componente sair da tela.
 */

const ETAPAS = [
  'Buscando os votos seção por seção no TSE',
  'Cruzando com a estimativa do time',
  'Desenhando as escolas no mapa',
];

export function CarregandoVotacao({
  candidatos,
  cores,
}: {
  candidatos: CandidatoDaVotacao[];
  cores: string[];
}) {
  const [etapa, setEtapa] = useState(0);
  useEffect(() => {
    const relogio = window.setInterval(() => setEtapa((atual) => Math.min(atual + 1, ETAPAS.length - 1)), 1100);
    return () => window.clearInterval(relogio);
  }, []);

  const titulo =
    candidatos.length === 1
      ? `Carregando a votação de ${candidatos[0].nome}`
      : `Carregando a votação de ${candidatos.length} candidatos`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-[1150] flex animate-fade-in items-center justify-center overflow-y-auto bg-navy-900/80 p-4 backdrop-blur-sm"
    >
      <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0" />

      <div className="relative flex w-full max-w-md flex-col items-center text-center text-white">
        {/* A urna no centro, as ondas e os candidatos em orbita. */}
        <div aria-hidden="true" className="relative size-40 sm:size-56">
          <span className="absolute inset-0 rounded-full border border-white/10" />
          <span className="absolute inset-7 rounded-full border border-white/10" />
          <span className="absolute inset-14 rounded-full border border-white/15" />
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background: 'conic-gradient(from 0deg, rgb(242 193 78 / 0.35), rgb(242 193 78 / 0) 80deg)',
              animation: 'cmd-radar 2.2s linear infinite',
            }}
          />
          <span className="absolute inset-0 rounded-full border-2 border-gold-400/40" style={{ animation: 'cmd-onda 2.2s ease-out infinite' }} />
          <span className="absolute inset-0 rounded-full border-2 border-accent-400/40" style={{ animation: 'cmd-onda 2.2s ease-out 1.1s infinite' }} />

          <span className="absolute top-1/2 left-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-400 to-gold-500 text-navy-900 shadow-[0_0_40px_rgba(242,193,78,0.55)]">
            <Vote className="size-8 animate-pulse" />
          </span>

          {/* A orbita gira; cada foto gira ao contrario e fica de pe. */}
          <div className="cmd-orbita absolute inset-0">
            {candidatos.map((c, i) => {
              const angulo = (360 / candidatos.length) * i - 90;
              return (
                <span
                  key={c.id}
                  className="absolute top-1/2 left-1/2"
                  style={{ transform: `rotate(${angulo}deg) translate(var(--cmd-raio)) rotate(${-angulo}deg)` } as CSSProperties}
                >
                  <span className="cmd-orbita__item -mt-6 -ml-6 block">
                    <span
                      className="cmd-chip-entra block rounded-full ring-[3px] ring-offset-2 ring-offset-navy-900"
                      style={{ '--tw-ring-color': cores[i], animationDelay: `${i * 120}ms` } as CSSProperties}
                    >
                      <FotoDoCandidato
                        cargo={c.cargoCodigo}
                        sqcand={c.sqcand ?? null}
                        src={fotoDoCandidatoUrl(c)}
                        nome={c.nome}
                        tamanho="md"
                      />
                    </span>
                  </span>
                </span>
              );
            })}
          </div>
        </div>

        <p className="mt-4 text-[0.625rem] font-bold sm:mt-6 tracking-[0.16em] text-gold-400 uppercase">Votação 2026 · TSE</p>
        <h3 className="mt-1 text-lg leading-snug font-bold sm:text-xl">{titulo}</h3>
        {/* Com varios, cada nome inteiro numa etiqueta da sua cor. */}
        {candidatos.length > 1 ? (
          <ul className="mt-2 flex flex-wrap justify-center gap-1.5">
            {candidatos.map((c, i) => (
              <li
                key={c.id}
                className="cmd-chip-entra inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-2.5 py-1 text-xs font-semibold"
                style={{ animationDelay: `${150 + i * 90}ms` }}
              >
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: cores[i] }} />
                {c.nome}
              </li>
            ))}
          </ul>
        ) : null}

        <ol className="mt-4 w-full space-y-2 text-left">
          {ETAPAS.map((texto, i) => {
            const feita = i < etapa;
            const atual = i === etapa;
            return (
              <li
                key={texto}
                className={cn(
                  'flex items-center gap-2.5 rounded-control px-3 py-2 text-sm transition-all duration-300',
                  atual ? 'bg-white/10 text-white' : feita ? 'text-white/80' : 'text-white/40',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-300',
                    feita ? 'bg-success-400 text-navy-900' : atual ? 'border-2 border-gold-400' : 'border-2 border-white/20',
                  )}
                >
                  {feita ? (
                    <Check aria-hidden="true" className="cmd-chip-entra size-3.5" strokeWidth={3} />
                  ) : atual ? (
                    <span className="size-2 animate-ping rounded-full bg-gold-400" />
                  ) : null}
                </span>
                {texto}
              </li>
            );
          })}
        </ol>

        {/* A barra corre sem parar: o servidor responde de uma vez so. */}
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-pill bg-white/10">
          <div className="cmd-barra-indeterminada h-full w-1/3 rounded-pill bg-gradient-to-r from-accent-400 via-gold-400 to-accent-400" />
        </div>
      </div>
    </div>
  );
}
