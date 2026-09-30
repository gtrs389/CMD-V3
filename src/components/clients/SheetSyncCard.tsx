'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw } from 'lucide-react';
import type { Client } from '@/lib/types';
import { COLUNAS_DO_SHEETS, type RelatorioDaPlanilha } from '@/lib/domain/planilha-do-sheets';
import { api } from '@/lib/repositories/http/api';
import { notifyDataChanged } from '@/lib/repositories';
import { formatDateTime } from '@/lib/utils/date';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';

/** Ao abrir o time, a planilha e lida de novo se a ultima leitura for mais velha que isto. */
const LER_SOZINHO_APOS_MS = 5 * 60_000;

/**
 * Planilha do Google Sheets do time duplicado (migration 052).
 *
 * Ligada, a Equipe de cada Lider desta copia vem da planilha — uma aba por
 * Lider. Desligada, a copia volta a mostrar o que estava no banco. Ligar e
 * desligar nunca apaga nada.
 *
 * Ao abrir a pagina com a planilha ligada, ela e lida de novo sozinha quando
 * a ultima leitura passou de cinco minutos; "Ler agora" le na hora.
 */
export function SheetSyncCard({ client }: { client: Client }) {
  const toast = useToast();
  const config = client.sheetSync;
  const [ligada, setLigada] = useState(config?.enabled ?? false);
  const [link, setLink] = useState(config?.url ?? '');
  const [salvando, setSalvando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const leuSozinho = useRef(false);

  const relatorio: RelatorioDaPlanilha | null = config?.report ?? null;
  const mudou = ligada !== (config?.enabled ?? false) || link.trim() !== (config?.url ?? '');

  async function salvar(proximo = ligada) {
    setSalvando(true);
    try {
      const { erro } = await api<{ erro: string | null }>(`/api/clients/${client.id}/planilha`, {
        method: 'PATCH',
        body: { enabled: proximo, url: link.trim() },
      });
      if (erro) toast.error(erro);
      else toast.success(proximo ? 'Planilha ligada e lida.' : 'Planilha desligada. A Equipe do banco voltou.');
      notifyDataChanged();
    } catch (falha) {
      setLigada(config?.enabled ?? false);
      toast.error(falha instanceof Error ? falha.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function ler(silencioso = false) {
    setLendo(true);
    try {
      const { report } = await api<{ report: RelatorioDaPlanilha }>(`/api/clients/${client.id}/planilha`, {
        method: 'POST',
      });
      if (!silencioso) {
        toast.success(`Planilha lida: ${report.pessoas} ${report.pessoas === 1 ? 'pessoa' : 'pessoas'}.`);
      }
      notifyDataChanged();
    } catch (falha) {
      if (!silencioso) toast.error(falha instanceof Error ? falha.message : 'Não foi possível ler a planilha.');
      else notifyDataChanged();
    } finally {
      setLendo(false);
    }
  }

  // Leitura sozinha ao abrir, uma vez por visita, quando a ultima ficou velha.
  useEffect(() => {
    if (leuSozinho.current || !config?.enabled || !config.url) return;
    const ultima = config.syncedAt ? new Date(config.syncedAt).getTime() : 0;
    if (Date.now() - ultima < LER_SOZINHO_APOS_MS) return;
    // Fora do efeito, num temporizador: a marca de "ja li" so vale quando a
    // leitura de fato comeca — no modo estrito o efeito roda duas vezes, e a
    // primeira e desfeita antes de disparar.
    const disparo = window.setTimeout(() => {
      leuSozinho.current = true;
      void ler(true);
    }, 0);
    return () => window.clearTimeout(disparo);
    // `ler` e estavel o bastante: a leitura sozinha acontece uma vez so.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.enabled, config?.url, config?.syncedAt]);

  if (!config) return null;

  return (
    <section
      aria-labelledby="planilha-do-sheets"
      className="mb-3 rounded-card border border-line bg-surface p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="planilha-do-sheets" className="flex items-center gap-2 text-base font-semibold text-ink-900">
            <FileSpreadsheet aria-hidden="true" className="size-4 text-success-600" />
            Planilha do Google Sheets
          </h2>
          <p className="mt-1 max-w-2xl text-[0.8125rem] leading-relaxed text-ink-500">
            Ligada, a Equipe de cada Líder desta cópia vem da planilha — <strong>uma aba por Líder</strong>,
            reconhecido pelo nome da aba. A Equipe que estava no banco fica escondida e volta ao desligar.
            O time oficial não é tocado.
          </p>
        </div>

        <Switch
          id="planilha-ligada"
          label={ligada ? 'Ligada' : 'Desligada'}
          checked={ligada}
          disabled={salvando || lendo}
          onChange={(valor) => {
            setLigada(valor);
            // Desligar vale na hora; ligar precisa do link, e salva junto.
            if (!valor || link.trim()) void salvar(valor);
          }}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field id="link-da-planilha" label="Link da planilha" className="flex-1">
          <Input
            id="link-da-planilha"
            type="url"
            inputMode="url"
            placeholder="https://docs.google.com/spreadsheets/d/…"
            value={link}
            disabled={salvando}
            onChange={(event) => setLink(event.target.value)}
          />
        </Field>
        <div className="flex gap-2">
          {mudou ? (
            <Button onClick={() => salvar()} loading={salvando} disabled={lendo}>
              Salvar
            </Button>
          ) : null}
          {config.enabled && config.url ? (
            <Button variant="secondary" onClick={() => ler()} loading={lendo} disabled={salvando}>
              {!lendo ? <RefreshCw aria-hidden="true" className="size-4" /> : null}
              Ler agora
            </Button>
          ) : null}
        </div>
      </div>

      {/* Ultima leitura: o que entrou, o que ficou de fora e por que. */}
      {relatorio ? (
        relatorio.ok ? (
          <div className="mt-3 rounded-control bg-success-50 px-3 py-2.5 text-[0.8125rem] text-ink-700">
            <p className="flex items-center gap-1.5 font-medium text-success-700">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Lida em {formatDateTime(relatorio.em)}: {relatorio.pessoas}{' '}
              {relatorio.pessoas === 1 ? 'pessoa' : 'pessoas'} em {relatorio.abas}{' '}
              {relatorio.abas === 1 ? 'aba' : 'abas'}.
            </p>
            {relatorio.lideresEncontrados.length > 0 ? (
              <p className="mt-1">
                <strong>Líderes reconhecidos:</strong> {relatorio.lideresEncontrados.join(', ')}.
              </p>
            ) : null}
            {relatorio.lideresCriados.length > 0 ? (
              <p className="mt-1">
                <strong>Líderes novos, criados pela planilha:</strong> {relatorio.lideresCriados.join(', ')}.
              </p>
            ) : null}
            {relatorio.abasIgnoradas.length > 0 ? (
              <p className="mt-1 text-warning-600">
                <strong>Abas ignoradas:</strong>{' '}
                {relatorio.abasIgnoradas.map((aba) => `${aba.aba} (${aba.motivo})`).join('; ')}.
              </p>
            ) : null}
            {relatorio.linhasIgnoradas > 0 ? (
              <p className="mt-1 text-warning-600">
                {relatorio.linhasIgnoradas}{' '}
                {relatorio.linhasIgnoradas === 1 ? 'linha sem nome ficou' : 'linhas sem nome ficaram'} de fora.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 flex items-start gap-1.5 rounded-control bg-danger-50 px-3 py-2.5 text-[0.8125rem] text-danger-700">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Última tentativa ({formatDateTime(relatorio.em)}): {relatorio.erro}
          </p>
        )
      ) : null}

      <details className="mt-3 text-[0.8125rem] text-ink-500">
        <summary className="cursor-pointer font-medium text-ink-700">Como montar a planilha</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Compartilhe como <strong>“Qualquer pessoa com o link” — Leitor</strong>.
          </li>
          <li>
            <strong>Uma aba por Líder</strong>, com o nome dele. O nome é comparado sem diferença de
            maiúscula ou acento. Aba sem Líder com esse nome no time cria um Líder novo, com o nome
            completo da coluna LÍDER.
          </li>
          <li>
            Colunas, nesta ordem: <strong>{COLUNAS_DO_SHEETS.join(', ')}</strong>.
          </li>
          <li>Aba oculta e linha sem nome ficam de fora.</li>
        </ul>
      </details>
    </section>
  );
}
