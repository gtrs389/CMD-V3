import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Selo do Time DEMO.
 *
 * Um time de demonstracao e um time de verdade em tudo — mesmas telas,
 * mesmos servicos, mesmas tabelas. Justamente por isso ele precisa se
 * anunciar: sem o selo, ninguem distingue, olhando a tela, um numero de
 * apresentacao de um numero da operacao.
 *
 * Aparece na listagem de Times, no cabecalho da pagina do time e ao lado dos
 * acessos daquele time em Configuracoes.
 */
export function DemoBadge({ className }: { className?: string } = {}) {
  return (
    <span
      title="Time de demonstração: os dados são fictícios e ficam fora dos números reais."
      className={cn(
        'inline-flex items-center gap-1 rounded-pill bg-warning-50 px-2 py-0.5 text-[0.6875rem] font-bold tracking-wide text-warning-600 uppercase',
        className,
      )}
    >
      <FlaskConical aria-hidden="true" className="size-3" />
      Demo
    </span>
  );
}
