'use client';

import { useCallback, useEffect, useState } from 'react';
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

/**
 * Planilha do Google Sheets do time duplicado (migration 052). Mora numa
 * janela aberta pelo menu de acoes do time ("⋯" > "Planilha do Google
 * Sheets"), e nao na visao geral: e configuracao do time, e nao conteudo.
 *
 * A planilha e LIDA AO VIVO, nunca importada: o banco guarda so o
 * interruptor e o link. Ligada, a Equipe de cada Lider desta copia e a que
 * esta na planilha agora — quem atualiza a planilha ve a mudanca aqui.
 * Desligada, a copia mostra o que tem no banco. Nada e apagado em nenhum dos
 * dois sentidos.
 */
export function SheetSyncCard({ client }: { client: Client }) {
  const toast = useToast();
  const config = client.sheetSync;
  const [ligada, setLigada] = useState(config?.enabled ?? false);
  const [link, setLink] = useState(config?.url ?? '');
  const [salvando, setSalvando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioDaPlanilha | null>(null);

  const ativa = Boolean(config?.enabled && config.url);
  const mudou = ligada !== (config?.enabled ?? false) || link.trim() !== (config?.url ?? '');

  /** O que a planilha tem agora. `naHora` nao pega carona em leitura ja em andamento. */
  const ler = useCallback(
    async (naHora: boolean) => {
      setLendo(true);
      try {
        const { report } = await api<{ report: RelatorioDaPlanilha }>(
          `/api/clients/${client.id}/planilha${naHora ? '?agora=1' : ''}`,
        );
        setRelatorio(report);
        // A lista do time e montada na hora a partir da planilha: recarrega
        // para mostrar o que acabou de ser lido.
        if (naHora) notifyDataChanged();
      } catch (falha) {
        if (naHora) toast.error(falha instanceof Error ? falha.message : 'Não foi possível ler a planilha.');
      } finally {
        setLendo(false);
      }
    },
    [client.id, toast],
  );

  // Ao abrir, mostra o que a planilha tem (a mesma leitura que montou a lista).
  useEffect(() => {
    if (!ativa) return;
    const disparo = window.setTimeout(() => void ler(false), 0);
    return () => window.clearTimeout(disparo);
  }, [ativa, config?.url, ler]);

  async function salvar(proximo = ligada) {
    setSalvando(true);
    try {
      await api(`/api/clients/${client.id}/planilha`, {
        method: 'PATCH',
        body: { enabled: proximo, url: link.trim() },
      });
      if (!proximo) setRelatorio(null);
      toast.success(
        proximo
          ? 'Planilha ligada. A Equipe dos Líderes agora vem dela, ao vivo.'
          : 'Planilha desligada. A cópia voltou a mostrar o banco.',
      );
      notifyDataChanged();
    } catch (falha) {
      setLigada(config?.enabled ?? false);
      toast.error(falha instanceof Error ? falha.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  if (!config) return null;

  return (
    <section aria-label="Planilha do Google Sheets">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <FileSpreadsheet aria-hidden="true" className="size-4 text-success-600" />
            Equipe dos Líderes lida da planilha
          </p>
          <p className="mt-1 max-w-2xl text-[0.8125rem] leading-relaxed text-ink-500">
            Ligada, a Equipe de cada Líder desta cópia é <strong>lida ao vivo da planilha</strong> —{' '}
            <strong>uma aba por Líder</strong>, reconhecido pelo nome da aba. Nada da planilha é
            gravado no sistema: quem atualiza a planilha vê a mudança aqui. A Equipe que estava no
            banco da cópia fica escondida e volta ao desligar. O time oficial não é tocado.
          </p>
        </div>

        <Switch
          id="planilha-ligada"
          label={ligada ? 'Ligada' : 'Desligada'}
          checked={ligada}
          disabled={salvando}
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
            <Button onClick={() => salvar()} loading={salvando}>
              Salvar
            </Button>
          ) : null}
          {ativa ? (
            <Button variant="secondary" onClick={() => ler(true)} loading={lendo} disabled={salvando}>
              {!lendo ? <RefreshCw aria-hidden="true" className="size-4" /> : null}
              Ler agora
            </Button>
          ) : null}
        </div>
      </div>

      {ativa ? (
        <p className="mt-2 text-xs text-ink-500">
          A lista do time lê a planilha do Google toda vez que é aberta: editou a planilha,
          atualize a página. “Ler agora” mostra aqui o resumo da versão atual.
        </p>
      ) : null}

      {/* O que a planilha tem agora: o que entrou, o que ficou de fora e por que. */}
      {ativa && relatorio ? (
        relatorio.ok ? (
          <div className="mt-3 rounded-control bg-success-50 px-3 py-2.5 text-[0.8125rem] text-ink-700">
            <p className="flex items-center gap-1.5 font-medium text-success-700">
              <CheckCircle2 aria-hidden="true" className="size-4" />
              Lida às {formatDateTime(relatorio.em)}: {relatorio.pessoas}{' '}
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
                <strong>Líderes só da planilha:</strong> {relatorio.lideresCriados.join(', ')}.
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
            Não consegui ler a planilha: {relatorio.erro}
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
            maiúscula ou acento. Aba sem Líder com esse nome no time vira um Líder só da planilha, com
            o nome completo da coluna LÍDER.
          </li>
          <li>
            Colunas, nesta ordem: <strong>{COLUNAS_DO_SHEETS.join(', ')}</strong>.
          </li>
          <li>Aba oculta e linha sem nome ficam de fora.</li>
          <li>
            As pessoas da planilha aparecem com o selo <strong>“Da planilha”</strong> e não são
            editadas aqui: para corrigir, corrija na planilha.
          </li>
        </ul>
      </details>
    </section>
  );
}
