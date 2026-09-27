'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Download, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Dossie } from '@/lib/domain/dossie';
import type { AnaliseDoNeo } from '@/lib/domain/neo';
import { api } from '@/lib/repositories/http/api';
import { formatNumber } from '@/lib/utils/text';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface Resposta {
  dossie: Dossie;
  neo: AnaliseDoNeo | null;
  neoErro: string | null;
  modelo: string;
}

type Estado =
  | { fase: 'inicio' }
  | { fase: 'lendo' }
  | { fase: 'pronto'; resposta: Resposta }
  | { fase: 'erro'; mensagem: string };

/**
 * O que o NEO faz enquanto a pessoa espera. Nao e enfeite: a chamada leva
 * de 20 segundos a mais de um minuto, e uma tela parada nesse tempo parece
 * travada. As etapas sao as de verdade, na ordem de verdade.
 */
const ETAPAS = [
  'Contando a base e descontando os duplicados',
  'Calculando o Índice de Mobilização',
  'Lendo lideranças, território e integridade',
  'Projetando o cenário de 30, 60 e 90 dias',
  'O NEO está escrevendo o relatório para a direção',
];

/**
 * O relatorio do time, pelo NEO.
 *
 * Tres passos na mesma janela: o que vai acontecer (e o que sai do sistema),
 * o NEO lendo, e o resultado — com o PDF a um clique. O PDF e montado aqui,
 * no navegador, e a biblioteca so e carregada no clique: ela e pesada, e
 * quem nunca abre o relatorio nao a baixa.
 */
export function NeoRelatorioModal({
  open,
  onClose,
  clientId,
  clientName,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
}) {
  const toast = useToast();
  const [estado, setEstado] = useState<Estado>({ fase: 'inicio' });
  const [etapa, setEtapa] = useState(0);
  const [baixando, setBaixando] = useState(false);

  // As etapas andam enquanto o servidor trabalha, e param na ultima: e ela
  // que demora, e ela que fica na tela ate a resposta chegar.
  useEffect(() => {
    if (estado.fase !== 'lendo') return;
    const relogio = window.setInterval(
      () => setEtapa((atual) => Math.min(atual + 1, ETAPAS.length - 1)),
      2200,
    );
    return () => window.clearInterval(relogio);
  }, [estado.fase]);

  async function gerar() {
    setEtapa(0);
    setEstado({ fase: 'lendo' });
    try {
      const resposta = await api<Resposta>(`/api/clients/${clientId}/relatorio`, { method: 'POST' });
      setEstado({ fase: 'pronto', resposta });
    } catch (error) {
      setEstado({
        fase: 'erro',
        mensagem: error instanceof Error ? error.message : 'Não foi possível gerar o relatório.',
      });
    }
  }

  async function baixar(resposta: Resposta) {
    setBaixando(true);
    try {
      const { gerarPdfDoRelatorio, nomeDoPdf } = await import('./RelatorioPdf');
      const blob = await gerarPdfDoRelatorio(resposta);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nomeDoPdf(resposta.dossie);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Um instante para o navegador comecar o download antes de soltar.
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success('Relatório baixado.');
    } catch {
      toast.error('Não foi possível montar o PDF. Tente de novo.');
    } finally {
      setBaixando(false);
    }
  }

  function fechar() {
    if (estado.fase === 'lendo' || baixando) return;
    onClose();
  }

  const pronto = estado.fase === 'pronto' ? estado.resposta : null;

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Relatório do NEO"
      description={clientName}
      size="lg"
      busy={estado.fase === 'lendo' || baixando}
      footer={
        pronto ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={gerar} disabled={baixando}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Gerar de novo
            </Button>
            <Button onClick={() => baixar(pronto)} loading={baixando}>
              <Download aria-hidden="true" className="size-4" />
              {baixando ? 'Montando o PDF...' : 'Baixar PDF'}
            </Button>
          </div>
        ) : estado.fase === 'lendo' ? null : (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={fechar}>
              Cancelar
            </Button>
            <Button onClick={gerar}>
              <FileText aria-hidden="true" className="size-4" />
              {estado.fase === 'erro' ? 'Tentar de novo' : 'Gerar relatório'}
            </Button>
          </div>
        )
      }
    >
      {estado.fase === 'inicio' || estado.fase === 'erro' ? (
        <Inicio erro={estado.fase === 'erro' ? estado.mensagem : null} />
      ) : null}

      {estado.fase === 'lendo' ? <Lendo etapa={etapa} /> : null}

      {pronto ? <Pronto resposta={pronto} /> : null}
    </Modal>
  );
}

function Inicio({ erro }: { erro: string | null }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-card bg-navy-900 text-white">
          <FileText aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink-900">Relatório Estratégico de Mobilização</p>
          <p className="mt-1 text-sm text-ink-500">
            O documento para apresentar à direção: carta executiva, Índice de Mobilização, força da
            rede, lideranças, território, integridade da base e recomendações — com a nominata
            completa em anexo. Sai em PDF.
          </p>
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {[
          ['Números garantidos', 'Toda contagem e o índice são calculados do cadastro. O NEO interpreta, não conta.'],
          ['Escrito para a direção', 'Carta executiva, conclusões-chave, leitura das lideranças e recomendações com prazo.'],
          ['Cenário e território', 'Trajetória de 12 semanas, projeção de 30/60/90 dias, bairros, zonas e seções.'],
          ['Anexos completos', 'Pendências com nome e responsável, e a nominata de cada liderança.'],
        ].map(([titulo, texto]) => (
          <li key={titulo} className="rounded-control border border-line p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              <FileText aria-hidden="true" className="size-4 text-accent-600" />
              {titulo}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">{texto}</p>
          </li>
        ))}
      </ul>

      <p className="flex items-start gap-2 rounded-control bg-ink-50 px-3 py-2 text-xs text-ink-500">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success-600" />
        Para a análise, só vão à OpenAI números do time e os nomes de Administradores e Líderes.
        Telefone, CPF, título e a lista da Equipe não saem do sistema: eles só entram no PDF,
        montado aqui no seu navegador.
      </p>

      {erro ? (
        <p role="alert" className="flex items-start gap-2 rounded-control bg-danger-50 px-3 py-2 text-sm text-danger-700">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {erro}
        </p>
      ) : null}
    </div>
  );
}

function Lendo({ etapa }: { etapa: number }) {
  return (
    <div className="py-2" role="status" aria-live="polite">
      <ol className="space-y-3">
        {ETAPAS.map((texto, i) => {
          const feita = i < etapa;
          const atual = i === etapa;
          return (
            <li key={texto} className="flex items-center gap-3">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  feita && 'bg-success-50 text-success-700',
                  atual && 'bg-accent-600 text-white',
                  !feita && !atual && 'bg-ink-100 text-ink-400',
                )}
              >
                {feita ? <Check aria-hidden="true" className="size-4" /> : i + 1}
              </span>
              <span className={cn('text-sm', atual ? 'font-semibold text-ink-900' : feita ? 'text-ink-500' : 'text-ink-400')}>
                {texto}
                {atual ? <span className="ml-1 inline-block animate-pulse">...</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs text-ink-500">
        A análise leva de 20 segundos a pouco mais de um minuto. Pode deixar esta janela aberta.
      </p>
    </div>
  );
}

function Pronto({ resposta }: { resposta: Resposta }) {
  const { dossie, neo, neoErro } = resposta;
  const e = dossie.estrategia;
  const indicadores: [string, number | string][] = [
    ['base mobilizada', e.baseLiquida],
    ['lideranças', dossie.numeros.lideres],
    ['novos em 30 dias', dossie.numeros.ultimos30],
    ['base íntegra', `${dossie.qualidade.saude}%`],
  ];
  const conclusoes = neo?.conclusoes ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-card bg-navy-900 p-4 text-white">
        <p className="text-[0.6875rem] font-semibold tracking-wide text-navy-300 uppercase">
          Índice de Mobilização · {e.indice.valor} · {e.indice.rotulo}
        </p>
        {neo ? <p className="mt-1 text-base leading-snug font-semibold">“{neo.manchete}”</p> : null}
        {neo ? <p className="mt-2 text-xs text-navy-300">{neo.leituraDoIndice}</p> : null}
      </div>

      {!neo ? (
        <p className="flex items-start gap-2 rounded-control bg-warning-50 px-3 py-2 text-sm text-warning-600">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {neoErro ?? 'A análise escrita não ficou pronta.'} O PDF sai completo, com a leitura automática
          montada dos números.
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {indicadores.map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-control bg-ink-50 p-3">
            <dd className="text-xl font-bold text-ink-900 tabular-nums">
              {typeof valor === 'number' ? formatNumber(valor) : valor}
            </dd>
            <dt className="text-xs text-ink-500">{rotulo}</dt>
          </div>
        ))}
      </dl>

      {conclusoes.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Lista titulo="Forças e oportunidades" itens={conclusoes.filter((c) => c.natureza !== 'atencao').map((c) => c.titulo)} tom="success" />
          <Lista titulo="Pontos de atenção" itens={conclusoes.filter((c) => c.natureza === 'atencao').map((c) => c.titulo)} tom="danger" />
        </div>
      ) : null}

      <p className="text-xs text-ink-500">
        O PDF traz a capa, o sumário executivo, a força da rede, as {formatNumber(dossie.numeros.lideres)} lideranças, o
        território, a integridade da base, as recomendações, as pendências com nome e a nominata com os{' '}
        {formatNumber(dossie.numeros.total)} cadastros.
      </p>
    </div>
  );
}

function Lista({ titulo, itens, tom }: { titulo: string; itens: string[]; tom: 'success' | 'danger' }) {
  return (
    <div className={cn('rounded-control p-3', tom === 'success' ? 'bg-success-50' : 'bg-danger-50')}>
      <p className={cn('text-xs font-semibold', tom === 'success' ? 'text-success-700' : 'text-danger-700')}>
        {titulo}
      </p>
      <ul className="mt-1 space-y-0.5">
        {itens.map((item) => (
          <li key={item} className="text-sm text-ink-700">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
