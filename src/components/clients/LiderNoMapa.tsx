'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Star, Users } from 'lucide-react';
import type { Member } from '@/lib/types';
import { entraNasInconsistencias, type Diagnostico } from '@/lib/domain/inconsistencias';
import { recruiterText } from '@/lib/domain/recruitment';
import { nomeDoPdf, nomeDoPdfDeInconsistencia } from '@/lib/domain/nome-do-pdf';
import { baixarArquivo } from '@/lib/utils/download';
import { formatNumber, pluralize } from '@/lib/utils/text';
import { cn } from '@/lib/utils/cn';
import { BotaoDePdf } from '@/components/dashboard/BotaoDePdf';
import { montarPdfDeInconsistencias, recorteDe } from './pdf-de-inconsistencias';

const DIA = 86_400_000;

/**
 * O que o Lider mostra no balao do pino dele, no mapa:
 *
 *   - a Equipe dele (quantos, quantos nesta semana) e o botao para abri-la;
 *   - quantas pessoas da Equipe tem inconsistencia — a MESMA conta do quadro;
 *   - os dois PDFs, baixados como arquivo: a Equipe e as inconsistencias.
 *
 * Tudo sai da lista que a pagina ja tem: nada e pedido ao servidor.
 */
export function LiderNoMapa({
  memberId,
  members,
  diagnostico,
  clientName,
  onVerEquipe,
}: {
  memberId: string;
  /** A lista inteira do time, como a pagina recebeu. */
  members: readonly Member[];
  diagnostico: Diagnostico;
  clientName: string;
  onVerEquipe?: (liderId: string) => void;
}) {
  const lider = members.find((member) => member.id === memberId) ?? null;
  // Instante fixo da abertura do balao: "nesta semana" nao muda no meio.
  const [agora] = useState(() => Date.now());

  const dados = useMemo(() => {
    if (!lider?.userId) return null;
    const equipe = members.filter((member) => member.recruitedBy?.userId === lider.userId);
    const semana = equipe.filter(
      (member) => !member.semDataDeCadastro && agora - new Date(member.createdAt).getTime() <= 7 * DIA,
    ).length;

    // Inconsistencias da Equipe dele: as mesmas do quadro, recortadas por
    // este responsavel. Cada pessoa conta uma vez.
    const recorte = recorteDe(diagnostico, [lider.userId]);
    const pessoas = new Set<string>();
    for (const p of recorte.problemas) pessoas.add(p.member.id);
    for (const i of recorte.incompletos) pessoas.add(i.member.id);
    for (const t of recorte.telefones) for (const m of t.membros) if (recorte.filtra(m)) pessoas.add(m.id);
    for (const g of recorte.certos) for (const r of g.registros) if (!r.primeiro && recorte.filtra(r.member)) pessoas.add(r.member.id);

    return { equipe, semana, comInconsistencia: pessoas.size };
  }, [lider, members, diagnostico, agora]);

  if (!lider || lider.tier !== 'LIDER' || !dados) return null;
  const { equipe, semana, comInconsistencia } = dados;
  const nomes = members.filter((m) => m.tier === 'LIDER').map((m) => m.name);

  async function pdfDaEquipe() {
    const { gerarPdfDaEquipe } = await import('@/components/neo/MapaPdf');
    const blob = await gerarPdfDaEquipe({
      lider: lider!,
      equipe,
      comInconsistencia,
      geradoEm: new Date().toISOString(),
    });
    baixarArquivo(nomeDoPdf('equipe', lider!.name, nomes), blob);
  }

  async function pdfDeInconsistencias() {
    const chave = lider!.userId!;
    const rotulo = recruiterText(equipe[0]?.recruitedBy ?? { userId: chave, name: lider!.name, role: 'EQUIPE', tier: 'LIDER', photo: null });
    const blob = await montarPdfDeInconsistencias({
      clientName,
      members: members.filter(entraNasInconsistencias),
      diagnostico,
      chaves: [chave],
      rotuloDe: () => rotulo,
    });
    baixarArquivo(nomeDoPdfDeInconsistencia(lider!.name, nomes), blob);
  }

  return (
    <div className="mt-2 space-y-2 rounded-control border border-[#e0a426]/40 bg-gradient-to-br from-[#fff8e6] to-surface p-2.5">
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-bold tracking-[0.1em] text-[#8a6100] uppercase">
        <Star aria-hidden="true" className="size-3.5 fill-[#e0a426] text-[#e0a426]" />
        Líder{lider.tag ? ` · ${lider.tag}` : ''}
      </p>

      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-control bg-surface px-2 py-1.5 ring-1 ring-line">
          <p className="flex items-center gap-1 text-[0.625rem] font-semibold tracking-wide text-ink-500 uppercase">
            <Users aria-hidden="true" className="size-3" />
            Equipe
          </p>
          <p className="text-lg leading-tight font-bold text-ink-900 tabular-nums">{formatNumber(equipe.length)}</p>
          <p className="text-[0.625rem] text-ink-500">
            {semana ? `+${formatNumber(semana)} nesta semana` : 'nada nesta semana'}
          </p>
        </div>
        <div
          className={cn(
            'rounded-control px-2 py-1.5 ring-1',
            comInconsistencia ? 'bg-danger-50 ring-danger-200' : 'bg-success-50 ring-success-600/20',
          )}
        >
          <p
            className={cn(
              'flex items-center gap-1 text-[0.625rem] font-semibold tracking-wide uppercase',
              comInconsistencia ? 'text-danger-700' : 'text-success-700',
            )}
          >
            {comInconsistencia ? (
              <AlertTriangle aria-hidden="true" className="size-3" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="size-3" />
            )}
            Para corrigir
          </p>
          <p
            className={cn(
              'text-lg leading-tight font-bold tabular-nums',
              comInconsistencia ? 'text-danger-700' : 'text-success-700',
            )}
          >
            {formatNumber(comInconsistencia)}
          </p>
          <p className="text-[0.625rem] text-ink-500">
            {comInconsistencia
              ? `${pluralize(comInconsistencia, 'pessoa', 'pessoas')} com inconsistência`
              : 'tudo em ordem'}
          </p>
        </div>
      </div>

      {onVerEquipe ? (
        <button
          type="button"
          onClick={() => onVerEquipe(lider.id)}
          className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-control bg-brand-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-800"
        >
          <Users aria-hidden="true" className="size-3.5" />
          Ver a Equipe ({formatNumber(equipe.length)})
        </button>
      ) : null}

      <p className="pt-0.5 text-[0.625rem] font-semibold tracking-wide text-ink-500 uppercase">Baixar em PDF</p>
      <div className="grid grid-cols-2 gap-1.5">
        <BotaoDePdf onClick={pdfDaEquipe} rotulo="Equipe" titulo="Baixar a lista da Equipe em PDF" />
        <BotaoDePdf
          onClick={pdfDeInconsistencias}
          rotulo="Inconsistências"
          titulo="Baixar as inconsistências da Equipe em PDF"
          disabled={comInconsistencia === 0}
        />
      </div>
    </div>
  );
}
