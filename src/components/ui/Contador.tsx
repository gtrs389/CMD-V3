'use client';

import { useEffect, useRef, useState } from 'react';
import { formatNumber } from '@/lib/utils/text';

/**
 * Numero que CORRE ate o valor: na primeira aparicao sobe do zero, e depois
 * desliza do valor antigo para o novo quando o filtro muda.
 *
 * `prefers-reduced-motion` mostra o numero final direto. O texto final e o
 * que fica para leitor de tela (o meio da corrida e `aria-hidden`).
 */
export function Contador({
  valor,
  duracao = 900,
  formatar = formatNumber,
  className,
}: {
  valor: number;
  duracao?: number;
  formatar?: (n: number) => string;
  className?: string;
}) {
  const [mostrado, setMostrado] = useState(0);
  const anterior = useRef(0);

  useEffect(() => {
    const reduzido =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const de = anterior.current;
    anterior.current = valor;
    if (reduzido || de === valor) {
      const quadro = requestAnimationFrame(() => setMostrado(valor));
      return () => cancelAnimationFrame(quadro);
    }

    const inicio = performance.now();
    let quadro = 0;
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / duracao);
      // Sai rapido e pousa devagar.
      const suave = 1 - Math.pow(1 - t, 4);
      setMostrado(Math.round(de + (valor - de) * suave));
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [valor, duracao]);

  return (
    <span className={className}>
      <span aria-hidden="true" className="tabular-nums">
        {formatar(mostrado)}
      </span>
      <span className="sr-only">{formatar(valor)}</span>
    </span>
  );
}
