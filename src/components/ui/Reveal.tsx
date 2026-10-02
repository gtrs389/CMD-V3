'use client';

import { useEffect, useRef, type ElementType, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Atraso em milissegundos, para escalonar itens de uma lista. */
  delay?: number;
  as?: ElementType;
}

/**
 * Revela o conteudo quando ele entra na tela.
 * A animacao e desligada automaticamente por `prefers-reduced-motion`
 * (regra definida em globals.css).
 */
export function Reveal({ children, className, delay = 0, as: Tag = 'div' }: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || typeof IntersectionObserver === 'undefined') {
      node.dataset.reveal = 'visible';
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.reveal = 'visible';
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.05 },
    );

    observer.observe(node);
    // Rede de seguranca: se o observador nao disparar (impressao, captura da
    // pagina inteira, aba em segundo plano), o conteudo aparece mesmo assim.
    // Um bloco invisivel ocupando lugar e pior do que uma animacao perdida.
    const garantia = window.setTimeout(() => {
      node.dataset.reveal = 'visible';
      observer.disconnect();
    }, 1500);
    return () => {
      window.clearTimeout(garantia);
      observer.disconnect();
    };
  }, []);

  return (
    <Tag
      ref={ref}
      data-reveal="hidden"
      style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}
      className={cn(className)}
    >
      {children}
    </Tag>
  );
}
