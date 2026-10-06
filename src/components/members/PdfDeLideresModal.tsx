'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { Check, Download, FileText, LayoutList, Layers, Search, Users } from 'lucide-react';
import type { Member } from '@/lib/types';
import {
  agruparPorReferencia,
  lideresComReferencia,
  lideresDasReferencias,
  nomeDoPdfDeLideres,
  referenciasDosLideres,
} from '@/lib/domain/lideres-por-referencia';
import { SEM_REFERENCIA } from '@/lib/domain/filtros-da-equipe';
import { baixarArquivo } from '@/lib/utils/download';
import { cn } from '@/lib/utils/cn';
import { formatNumber, normalizeSearch } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';
import { Contador } from '@/components/ui/Contador';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import type { FormaDoPdfDeLideres } from '@/components/neo/LideresPorReferenciaPdf';

/**
 * Escolher as referencias e baixar o PDF "Líderes por referência".
 *
 * Todas comecam marcadas: o caso comum e o time inteiro. A previa embaixo e
 * a mesma tabela do PDF (Nº, Líder, Referência), ja na ordem alfabetica e
 * so com o que esta marcado — o arquivo nao traz surpresa.
 */

const NA_PREVIA = 8;

export function PdfDeLideresModal({ open, onClose, members }: { open: boolean; onClose: () => void; members: readonly Member[] }) {
  const toast = useToast();
  const opcoes = useMemo(() => referenciasDosLideres(members), [members]);
  const todos = useMemo(() => lideresComReferencia(members), [members]);
  const [desmarcadas, setDesmarcadas] = useState<ReadonlySet<string>>(() => new Set());
  const [busca, setBusca] = useState('');
  const [forma, setForma] = useState<FormaDoPdfDeLideres>('lista');
  const [gerando, setGerando] = useState(false);

  const escolhidas = useMemo(
    () => new Set(opcoes.map((o) => o.valor).filter((v) => !desmarcadas.has(v))),
    [opcoes, desmarcadas],
  );
  const lideres = useMemo(() => lideresDasReferencias(todos, escolhidas), [todos, escolhidas]);
  const grupos = useMemo(() => agruparPorReferencia(lideres), [lideres]);
  const visiveis = useMemo(() => {
    const termo = normalizeSearch(busca.trim());
    return termo ? opcoes.filter((o) => normalizeSearch(o.rotulo).includes(termo)) : opcoes;
  }, [opcoes, busca]);
  const maior = Math.max(1, ...opcoes.map((o) => o.quantidade));

  /** A previa: as primeiras linhas, como o PDF vai trazer. */
  const previa =
    forma === 'lista'
      ? lideres.slice(0, NA_PREVIA).map((l, i) => ({ l, n: i + 1, grupo: null as string | null }))
      : grupos
          .flatMap((g) => g.lideres.map((l, i) => ({ l, n: i + 1, grupo: i === 0 ? g.rotulo : null })))
          .slice(0, NA_PREVIA);

  function alternar(valor: string) {
    setDesmarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(valor)) nova.delete(valor);
      else nova.add(valor);
      return nova;
    });
  }
  function marcarVisiveis(marcar: boolean) {
    setDesmarcadas((atual) => {
      const nova = new Set(atual);
      for (const o of visiveis) {
        if (marcar) nova.delete(o.valor);
        else nova.add(o.valor);
      }
      return nova;
    });
  }

  async function baixar() {
    if (lideres.length === 0 || gerando) return;
    setGerando(true);
    try {
      const referencias = opcoes.filter((o) => escolhidas.has(o.valor)).map((o) => ({ rotulo: o.rotulo, quantidade: o.quantidade }));
      const { gerarPdfDeLideres } = await import('@/components/neo/LideresPorReferenciaPdf');
      const blob = await gerarPdfDeLideres({ lideres, grupos, referencias, forma, geradoEm: new Date().toISOString() });
      baixarArquivo(nomeDoPdfDeLideres(referencias.map((r) => r.rotulo)), blob);
      toast.success(lideres.length === 1 ? 'PDF baixado com 1 líder.' : `PDF baixado com ${lideres.length} líderes.`);
      onClose();
    } catch {
      toast.error('Não foi possível gerar o PDF. Tente de novo.');
    } finally {
      setGerando(false);
    }
  }

  const todasMarcadas = visiveis.every((o) => escolhidas.has(o.valor));
  const nenhumaMarcada = visiveis.every((o) => !escolhidas.has(o.valor));

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={gerando}
      size="lg"
      title="PDF dos líderes por referência"
      header={
        <div className="relative -mx-1 overflow-hidden rounded-card bg-gradient-to-br from-navy-900 via-navy-800 to-[#1e3a8a] p-4 text-white">
          <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0" />
          <span aria-hidden="true" className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-gold-400/20 blur-3xl" />
          <div className="relative flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-gold-400 text-navy-900 shadow-card">
              <FileText aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.6875rem] font-semibold tracking-[0.16em] text-gold-400 uppercase">PDF</p>
              <h2 className="text-lg leading-tight font-bold sm:text-xl">Líderes por referência</h2>
              <p className="mt-0.5 text-sm text-white/70">Uma coluna com o Líder, outra com a referência, em ordem alfabética.</p>
            </div>
          </div>
          <dl className="relative mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-control border border-white/15 bg-white/10 px-3 py-2">
              <dt className="text-[0.6875rem] font-semibold tracking-wide text-white/70 uppercase">Líderes no PDF</dt>
              <dd className="text-2xl leading-tight font-bold tabular-nums">
                <Contador valor={lideres.length} />
                <span className="ml-1 text-xs font-medium text-white/60">de {formatNumber(todos.length)}</span>
              </dd>
            </div>
            <div className="rounded-control border border-white/15 bg-white/10 px-3 py-2">
              <dt className="text-[0.6875rem] font-semibold tracking-wide text-white/70 uppercase">Referências</dt>
              <dd className="text-2xl leading-tight font-bold text-gold-400 tabular-nums">
                <Contador valor={escolhidas.size} />
                <span className="ml-1 text-xs font-medium text-white/60">de {formatNumber(opcoes.length)}</span>
              </dd>
            </div>
          </dl>
        </div>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={gerando}>
            Cancelar
          </Button>
          <Button onClick={baixar} loading={gerando} disabled={lideres.length === 0}>
            {gerando ? null : <Download aria-hidden="true" className="size-4" />}
            {gerando
              ? 'Gerando o PDF…'
              : lideres.length === 1
                ? 'Baixar PDF com 1 líder'
                : `Baixar PDF com ${formatNumber(lideres.length)} líderes`}
          </Button>
        </>
      }
    >
      {opcoes.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-500">O time ainda não tem Líderes cadastrados.</p>
      ) : (
        <div className="space-y-5">
          {/* 1. AS REFERENCIAS */}
          <section aria-labelledby="pdf-lideres-referencias">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 id="pdf-lideres-referencias" className="text-sm font-semibold text-ink-900">
                  1. Quais referências entram
                </h3>
                <p className="text-xs text-ink-500">Toque para marcar ou desmarcar. Todas começam marcadas.</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => marcarVisiveis(true)}
                  disabled={todasMarcadas}
                  className="min-h-8 rounded-pill border border-line bg-surface px-3 text-xs font-semibold text-brand-800 hover:bg-brand-50 disabled:opacity-40"
                >
                  Marcar {busca.trim() ? 'estas' : 'todas'}
                </button>
                <button
                  type="button"
                  onClick={() => marcarVisiveis(false)}
                  disabled={nenhumaMarcada}
                  className="min-h-8 rounded-pill border border-line bg-surface px-3 text-xs font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-40"
                >
                  Desmarcar {busca.trim() ? 'estas' : 'todas'}
                </button>
              </div>
            </div>

            {opcoes.length > 6 ? (
              <label className="relative mb-2 flex items-center">
                <span className="sr-only">Buscar referência</span>
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-ink-400" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar referência"
                  className="min-h-10 w-full rounded-pill border border-line bg-surface pr-3 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:border-accent-600 focus:outline-none"
                />
              </label>
            ) : null}

            <ul className="grid gap-2 sm:grid-cols-2">
              {visiveis.map((o, i) => {
                const marcada = escolhidas.has(o.valor);
                return (
                  <li key={o.valor} className="cmd-cascata" style={{ '--cmd-atraso': `${Math.min(i, 10) * 35}ms` } as CSSProperties}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={marcada}
                      onClick={() => alternar(o.valor)}
                      className={cn(
                        'group flex w-full items-start gap-3 rounded-card border p-3 text-left transition-all duration-200 hover:-translate-y-0.5',
                        marcada
                          ? 'border-navy-900 bg-gradient-to-br from-brand-50 to-surface shadow-card'
                          : 'border-line bg-surface opacity-70 hover:opacity-100',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200',
                          marcada ? 'scale-100 border-navy-900 bg-navy-900 text-gold-400' : 'border-ink-200 bg-surface text-transparent',
                        )}
                      >
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            'block text-sm leading-snug font-semibold wrap-break-word',
                            o.valor === SEM_REFERENCIA ? 'text-ink-500 italic' : 'text-ink-900',
                          )}
                        >
                          {o.rotulo}
                        </span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-ink-100">
                            <span
                              className="block h-full rounded-pill transition-all duration-500"
                              style={{
                                width: `${Math.max(6, (o.quantidade / maior) * 100)}%`,
                                background: marcada ? 'linear-gradient(90deg, var(--color-navy-900), var(--color-gold-500))' : 'var(--color-ink-200)',
                              }}
                            />
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-ink-700 tabular-nums">
                            <Users aria-hidden="true" className="size-3" />
                            {formatNumber(o.quantidade)} {o.quantidade === 1 ? 'líder' : 'líderes'}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {visiveis.length === 0 ? <p className="py-4 text-center text-sm text-ink-500">Nenhuma referência com esse nome.</p> : null}
          </section>

          {/* 2. A FORMA */}
          <section aria-labelledby="pdf-lideres-forma">
            <h3 id="pdf-lideres-forma" className="mb-2 text-sm font-semibold text-ink-900">
              2. Como organizar
            </h3>
            <div role="radiogroup" aria-labelledby="pdf-lideres-forma" className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  { id: 'lista', titulo: 'Lista única de A a Z', texto: 'Todos os Líderes juntos, pelo nome.', icone: LayoutList },
                  { id: 'grupos', titulo: 'Um bloco por referência', texto: 'Referências de A a Z, e os Líderes de cada uma de A a Z.', icone: Layers },
                ] as const
              ).map((f) => {
                const ligada = forma === f.id;
                const Icone = f.icone;
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={ligada}
                    onClick={() => setForma(f.id)}
                    className={cn(
                      'flex items-start gap-3 rounded-card border p-3 text-left transition-all duration-200',
                      ligada ? 'border-gold-500 bg-gold-50 shadow-card ring-2 ring-gold-400/40' : 'border-line bg-surface hover:bg-ink-50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-control transition-colors',
                        ligada ? 'bg-navy-900 text-gold-400' : 'bg-ink-100 text-ink-500',
                      )}
                    >
                      <Icone aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink-900">{f.titulo}</span>
                      <span className="block text-xs text-ink-500">{f.texto}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3. A PREVIA */}
          <section aria-labelledby="pdf-lideres-previa">
            <h3 id="pdf-lideres-previa" className="mb-2 text-sm font-semibold text-ink-900">
              3. Prévia do PDF
            </h3>
            <div className="rounded-card border border-line bg-ink-50 p-3 sm:p-4">
              <div className="mx-auto max-w-xl overflow-hidden rounded-md bg-white shadow-card ring-1 ring-ink-900/5">
                <div className="h-1.5 bg-gradient-to-r from-navy-900 via-navy-800 to-gold-500" />
                {lideres.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-ink-500">Marque ao menos uma referência para ver os Líderes.</p>
                ) : (
                  <div className="relative">
                    <div className="grid grid-cols-[2.75rem_minmax(0,1.4fr)_minmax(0,1fr)] bg-navy-900 px-3 py-2 text-[0.625rem] font-bold tracking-wide text-white uppercase">
                      <span>Nº</span>
                      <span>Líder</span>
                      <span>Referência</span>
                    </div>
                    <ol key={`${forma}:${[...escolhidas].join('|')}`}>
                      {previa.map(({ l, n, grupo }, i) => (
                        <li key={l.id} className="cmd-cascata" style={{ '--cmd-atraso': `${i * 40}ms` } as CSSProperties}>
                          {grupo ? (
                            <p className="flex items-center gap-2 border-b border-line bg-brand-50 px-3 py-1.5 text-xs font-bold text-navy-900">
                              <span aria-hidden="true" className="h-3.5 w-0.5 rounded bg-gold-500" />
                              <span className="wrap-break-word">{grupo}</span>
                            </p>
                          ) : null}
                          <div
                            className={cn(
                              'grid grid-cols-[2.75rem_minmax(0,1.4fr)_minmax(0,1fr)] items-center border-b border-line/70 px-3 py-2 text-xs',
                              n % 2 === 0 && 'bg-ink-50/70',
                            )}
                          >
                            <span>
                              <span className="rounded-pill bg-gold-50 px-1.5 py-0.5 text-[0.625rem] font-bold text-gold-700 tabular-nums">{n}</span>
                            </span>
                            <span className="pr-2 font-semibold wrap-break-word text-ink-900">{l.nome}</span>
                            <span className={cn('flex items-center gap-1.5 wrap-break-word', l.referencia ? 'text-ink-700' : 'text-ink-400 italic')}>
                              <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', l.referencia ? 'bg-gold-500' : 'bg-ink-200')} />
                              {l.referencia ?? 'Sem referência'}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ol>
                    {lideres.length > previa.length ? (
                      <p className="bg-gradient-to-b from-white/0 to-white px-3 pt-2 pb-3 text-center text-xs font-semibold text-ink-500">
                        + {formatNumber(lideres.length - previa.length)} {lideres.length - previa.length === 1 ? 'líder' : 'líderes'} no PDF
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}
