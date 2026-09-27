'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Download, Filter, X } from 'lucide-react';
import type { Member } from '@/lib/types';
import {
  FILTROS_DE_DADOS,
  aplicarFiltros,
  contarPorFiltro,
  type ContextoDosFiltros,
} from '@/lib/domain/filtros-de-dados';
import { recruiterText } from '@/lib/domain/recruitment';
import { basePorResponsavel } from '@/lib/domain/por-responsavel';
import { grupoRepetidoParaPdf } from '@/lib/domain/repetidos-pdf';
import type { GrupoRepetido } from '@/lib/domain/inconsistencias';
import { baixarArquivo } from '@/lib/utils/download';
import { slug } from '@/components/neo/pdf-base';
import type { SecaoDoFiltro } from '@/components/neo/ListasPdf';
import { formatDate } from '@/lib/utils/date';
import { formatPhone } from '@/lib/utils/phone';
import { formatNumber } from '@/lib/utils/text';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

const GRUPOS = ['CPF', 'Título', 'Telefone', 'Endereço e votação', 'Cadastro'] as const;

/**
 * "Quem esta assim?" — filtro por dado, com a lista e o PDF so dela.
 *
 * Marcar varios filtros SOMA: aparece quem tem qualquer um dos problemas
 * marcados, com todos os motivos na mesma linha. O PDF leva exatamente o
 * que esta na tela — os filtros marcados, o responsavel escolhido acima e
 * quem cadastrou cada pessoa.
 */
export function FiltroDeDadosCard({
  clientName,
  members,
  responsavel,
  contexto,
  gruposRepetidos = [],
  onOpenMember,
  canExport,
}: {
  clientName: string;
  /** Ja recortada pelo responsavel escolhido no quadro. */
  members: Member[];
  responsavel: string | null;
  contexto: ContextoDosFiltros;
  /** Os grupos de "cadastrado mais de uma vez" do recorte: o PDF os mostra como na tela. */
  gruposRepetidos?: GrupoRepetido[];
  onOpenMember: (id: string) => void;
  canExport: boolean;
}) {
  const toast = useToast();
  const [marcados, setMarcados] = useState<string[]>([]);
  const [limite, setLimite] = useState(15);
  const [baixando, setBaixando] = useState(false);

  const contagem = useMemo(() => contarPorFiltro(members, contexto), [members, contexto]);
  const pessoas = useMemo(
    () => aplicarFiltros(members, marcados, contexto),
    [members, marcados, contexto],
  );

  function alternar(id: string) {
    setLimite(15);
    setMarcados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  async function baixar() {
    setBaixando(true);
    try {
      const { gerarPdfDaLista } = await import('@/components/neo/ListasPdf');
      // Uma secao por filtro marcado, na ordem da tela — cada uma com a
      // estrutura que faz sentido para ela.
      const secoes: SecaoDoFiltro[] = FILTROS_DE_DADOS.filter((f) => marcados.includes(f.id)).map((filtro) => {
        if (filtro.id === 'repetido') {
          return { tipo: 'repetidos', rotulo: filtro.rotulo, grupos: gruposRepetidos.map(grupoRepetidoParaPdf) };
        }
        const pessoasDoFiltro = aplicarFiltros(members, [filtro.id], contexto).map(({ member, motivos }) => ({
          id: member.id,
          nome: member.name,
          telefone: member.phone ?? '',
          bairro: member.district ?? '',
          cadastradoPor: recruiterText(member.recruitedBy),
          cadastradoEm: member.createdAt,
          problema: motivos.join(', '),
        }));
        return {
          tipo: filtro.id === 'telefone-repetido' ? 'telefones' : 'pessoas',
          rotulo: filtro.rotulo,
          pessoas: pessoasDoFiltro,
        };
      });
      const blob = await gerarPdfDaLista({
        time: clientName,
        responsavel,
        geradaEm: new Date().toISOString(),
        basePorResponsavel: basePorResponsavel(members),
        secoes,
      });
      baixarArquivo(`dados-para-corrigir-${slug(clientName)}-${new Date().toISOString().slice(0, 10)}.pdf`, blob);
    } catch {
      toast.error('Não foi possível montar o PDF. Tente de novo.');
    } finally {
      setBaixando(false);
    }
  }

  return (
    <section
      aria-labelledby="filtro-de-dados"
      className="rounded-card border border-line bg-surface p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="filtro-de-dados" className="flex items-center gap-2 text-base font-semibold text-ink-900">
            <Filter aria-hidden="true" className="size-4 text-accent-600" />
            Filtrar por dado
          </h2>
          <p className="mt-0.5 text-[0.8125rem] text-ink-500">
            Marque um ou mais: aparece quem tem qualquer um deles, com quem cadastrou.
          </p>
        </div>
        {marcados.length > 0 ? (
          <button
            type="button"
            onClick={() => setMarcados([])}
            className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-900"
          >
            <X aria-hidden="true" className="size-3.5" />
            Limpar filtros
          </button>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        {GRUPOS.map((grupo) => (
          <div key={grupo} className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
            <p className="w-40 shrink-0 pt-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">
              {grupo}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {FILTROS_DE_DADOS.filter((f) => f.grupo === grupo).map((filtro) => {
                const ativo = marcados.includes(filtro.id);
                const quantos = contagem[filtro.id] ?? 0;
                return (
                  <button
                    key={filtro.id}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => alternar(filtro.id)}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1.5 rounded-pill border px-3 text-xs font-medium transition-colors',
                      ativo
                        ? 'border-accent-600 bg-accent-600 text-white'
                        : 'border-line bg-surface text-ink-700 hover:border-accent-600 hover:text-accent-700',
                      !ativo && quantos === 0 && 'text-ink-400',
                    )}
                  >
                    {filtro.rotulo}
                    <span
                      className={cn(
                        'rounded-pill px-1.5 py-px text-[0.6875rem] font-semibold tabular-nums',
                        ativo ? 'bg-white/20 text-white' : 'bg-ink-100 text-ink-500',
                      )}
                    >
                      {formatNumber(quantos)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {marcados.length > 0 ? (
        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink-900">
              {formatNumber(pessoas.length)} {pessoas.length === 1 ? 'pessoa' : 'pessoas'}
            </p>
            {canExport && pessoas.length > 0 ? (
              <Button onClick={baixar} loading={baixando} className="whitespace-nowrap">
                <Download aria-hidden="true" className="size-4" />
                {baixando ? 'Montando o PDF...' : 'Baixar PDF'}
              </Button>
            ) : null}
          </div>

          {pessoas.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-500">Ninguém nesse filtro.</p>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {pessoas.slice(0, limite).map(({ member, motivos }) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => onOpenMember(member.id)}
                      className="group grid w-full grid-cols-1 gap-x-4 gap-y-0.5 py-2.5 text-left sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink-900 group-hover:text-brand-700">
                          {member.name}
                        </span>
                        <span className="block text-xs text-ink-500 tabular-nums">
                          {member.phone ? formatPhone(member.phone) : 'sem telefone'}
                        </span>
                      </span>
                      <span className="text-xs text-danger-600">{motivos.join(', ')}</span>
                      <span className="truncate text-xs text-ink-500">
                        por {recruiterText(member.recruitedBy)} · {formatDate(member.createdAt)}
                      </span>
                      <ArrowRight
                        aria-hidden="true"
                        className="hidden size-4 text-ink-300 group-hover:text-brand-700 sm:block"
                      />
                    </button>
                  </li>
                ))}
              </ul>
              {pessoas.length > limite ? (
                <div className="mt-2 flex justify-center">
                  <Button variant="ghost" size="sm" onClick={() => setLimite((v) => v + 45)}>
                    Mostrar mais ({formatNumber(pessoas.length - limite)} restantes)
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
