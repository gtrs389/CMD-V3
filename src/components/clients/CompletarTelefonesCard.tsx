'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Phone, Wand2 } from 'lucide-react';
import type { Member } from '@/lib/types';
import { api } from '@/lib/repositories/http/api';
import { notifyDataChanged } from '@/lib/repositories/events';
import {
  DDD_DA_OPERACAO,
  MOTIVO_DA_CORRECAO,
  completarTelefone,
  type Correcao,
} from '@/lib/domain/completar-telefone';
import { recruiterText } from '@/lib/domain/recruitment';
import { formatPhone, normalizePhone } from '@/lib/utils/phone';
import { formatNumber, pluralize } from '@/lib/utils/text';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface Sugestao {
  member: Member;
  correcao: Correcao;
  /** Outras fichas do time que ja usam o numero corrigido. */
  mesmoNumero: string[];
}

/**
 * "Telefones para completar": quem foi cadastrado sem DDD ou sem o 9 do
 * celular, com a correcao pronta (DDD 82 — ver `completar-telefone.ts`).
 *
 * Nada muda sem revisao: a janela mostra antes e depois de cada numero,
 * tudo marcado, e a pessoa desmarca o que nao deve mudar. Quem grava e o
 * servidor, recalculando a partir do numero gravado.
 */
export function CompletarTelefonesCard({
  members,
  todos,
}: {
  /** O recorte da tela (o responsavel escolhido no quadro). */
  members: Member[];
  /** O time inteiro: para avisar quando o numero corrigido ja e de outra ficha. */
  todos: Member[];
}) {
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [gravando, setGravando] = useState(false);

  const sugestoes = useMemo<Sugestao[]>(() => {
    // O numero de cada ficha DEPOIS da correcao: dois numeros que so ficam
    // iguais depois de completados tambem precisam do aviso.
    const porNumero = new Map<string, Member[]>();
    for (const m of todos) {
      const n = completarTelefone(m.phone)?.novo ?? normalizePhone(m.phone ?? '');
      if (n.length >= 10) porNumero.set(n, [...(porNumero.get(n) ?? []), m]);
    }
    return members
      .map((member) => ({ member, correcao: completarTelefone(member.phone) }))
      .filter((x): x is { member: Member; correcao: Correcao } => x.correcao !== null)
      .map(({ member, correcao }) => ({
        member,
        correcao,
        mesmoNumero: (porNumero.get(correcao.novo) ?? []).filter((m) => m.id !== member.id).map((m) => m.name),
      }))
      .sort((a, b) => a.member.name.localeCompare(b.member.name, 'pt-BR'));
  }, [members, todos]);

  if (sugestoes.length === 0) return null;

  const marcadas = sugestoes.filter((x) => !desmarcados.has(x.member.id));
  const porMotivo = Object.entries(
    sugestoes.reduce<Record<string, number>>((acc, x) => {
      acc[x.correcao.motivo] = (acc[x.correcao.motivo] ?? 0) + 1;
      return acc;
    }, {}),
  );

  function alternar(id: string) {
    setDesmarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function corrigir() {
    if (marcadas.length === 0) return;
    setGravando(true);
    try {
      const r = await api<{ corrigidos: number; semMexerNoAcesso: number; pulados: number }>(
        `/api/clients/${members[0]?.clientId ?? todos[0]?.clientId}/telefones`,
        { method: 'POST', body: { memberIds: marcadas.map((x) => x.member.id) } },
      );
      toast.success(
        `${formatNumber(r.corrigidos)} ${pluralize(r.corrigidos, 'telefone completado', 'telefones completados')}.` +
          (r.semMexerNoAcesso
            ? ` ${formatNumber(r.semMexerNoAcesso)} já eram o número de outra pessoa do time: a ficha foi corrigida, o acesso ficou como estava.`
            : ''),
      );
      setAberto(false);
      setDesmarcados(new Set());
      notifyDataChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível corrigir os telefones.');
    } finally {
      setGravando(false);
    }
  }

  return (
    <>
      <section className="flex flex-col gap-3 rounded-card border border-info-600/25 bg-info-50/50 p-4 shadow-card sm:flex-row sm:items-center sm:p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface text-info-600">
          <Phone aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
            Telefones para completar
            <Badge tone="info">{formatNumber(sugestoes.length)}</Badge>
          </h2>
          <p className="mt-0.5 text-[0.8125rem] text-ink-500">
            {formatNumber(sugestoes.length)} {pluralize(sugestoes.length, 'ficha está', 'fichas estão')} sem DDD
            ou sem o 9 do celular. O sistema completa com o DDD {DDD_DA_OPERACAO} — você revisa antes de gravar.
          </p>
        </div>
        <Button onClick={() => setAberto(true)} className="shrink-0 whitespace-nowrap">
          <Wand2 aria-hidden="true" className="size-4" />
          Revisar e corrigir
        </Button>
      </section>

      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        busy={gravando}
        size="lg"
        title="Completar telefones"
        description={`DDD ${DDD_DA_OPERACAO} para quem está sem DDD, e o 9 na frente do celular que está sem ele.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAberto(false)} disabled={gravando}>
              Cancelar
            </Button>
            <Button onClick={corrigir} loading={gravando} disabled={marcadas.length === 0}>
              {gravando
                ? 'Corrigindo...'
                : `Corrigir ${formatNumber(marcadas.length)} ${pluralize(marcadas.length, 'telefone', 'telefones')}`}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {porMotivo.map(([motivo, n]) => (
              <Badge key={motivo} tone="neutral">
                {MOTIVO_DA_CORRECAO[motivo as keyof typeof MOTIVO_DA_CORRECAO]}: {formatNumber(n)}
              </Badge>
            ))}
            <button
              type="button"
              onClick={() =>
                setDesmarcados(marcadas.length === sugestoes.length ? new Set(sugestoes.map((x) => x.member.id)) : new Set())
              }
              className="ml-auto text-xs font-semibold text-brand-700 hover:text-brand-800"
            >
              {marcadas.length === sugestoes.length ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          </div>

          <p className="text-xs text-ink-500">
            Quem já entra no sistema pelo número antigo passa a entrar pelo número corrigido.
          </p>

          <ul className="divide-y divide-line rounded-control border border-line">
            {sugestoes.map(({ member, correcao, mesmoNumero }) => {
              const marcada = !desmarcados.has(member.id);
              return (
                <li key={member.id}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-ink-50">
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={() => alternar(member.id)}
                      className="mt-1 size-4 shrink-0 accent-brand-700"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink-900">{member.name}</span>
                      <span className="block truncate text-xs text-ink-500">por {recruiterText(member.recruitedBy)}</span>
                      {mesmoNumero.length ? (
                        <span className="mt-0.5 flex items-start gap-1 text-xs text-warning-600">
                          <AlertTriangle aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                          Fica igual ao de {mesmoNumero.slice(0, 2).join(' e ')}
                          {mesmoNumero.length > 2 ? ` e mais ${mesmoNumero.length - 2}` : ''}.
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="flex items-center justify-end gap-1.5 text-xs tabular-nums">
                        <span className="text-ink-400 line-through">{member.phone ? formatPhone(member.phone) : '—'}</span>
                        <ArrowRight aria-hidden="true" className="size-3 text-ink-400" />
                        <span className="font-semibold text-ink-900">{formatPhone(correcao.novo)}</span>
                      </span>
                      <span className="mt-0.5 block text-[0.6875rem] text-ink-500">
                        {MOTIVO_DA_CORRECAO[correcao.motivo]}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
    </>
  );
}
