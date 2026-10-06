'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownToLine,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Eye,
  File as FileIcon,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FolderOpen,
  HardDrive,
  LayoutGrid,
  List,
  Music,
  Pencil,
  Play,
  Presentation,
  RotateCcw,
  Search,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  ARQUIVOS_POR_VEZ,
  ROTULO_DO_TIPO,
  familiaDoDocumento,
  formatarTamanho,
  resumoDoRepositorio,
  tipoDoArquivo,
  validarArquivo,
  type ArquivoDoTime,
  type FamiliaDoDocumento,
  type TipoDeArquivo,
} from '@/lib/domain/arquivos';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { cn } from '@/lib/utils/cn';
import { formatLastActivity } from '@/lib/utils/date';
import { formatNumber } from '@/lib/utils/text';
import { Contador } from '@/components/ui/Contador';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Menu } from '@/components/ui/Menu';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

/**
 * Repositorio de Arquivos do time (migration 059).
 *
 * Imagens, documentos, videos e audios, quantos quiser de uma vez. Arrastar
 * para cima do painel ja abre a area de soltar; cada arquivo entra numa fila
 * com previa, barra de progresso e velocidade, e vai direto para o
 * armazenamento privado por uma URL assinada (ver `arquivos.service.ts`).
 *
 * A galeria mostra cada tipo do seu jeito — a foto, o quadro do video com o
 * botao de play, o icone colorido do documento — e o visualizador abre tudo
 * em tela cheia, com setas, zoom na imagem, video e PDF ali mesmo.
 */

type Filtro = 'TODOS' | TipoDeArquivo;
type Ordem = 'recentes' | 'antigos' | 'nome' | 'maiores';
type Visao = 'galeria' | 'lista';

const ORDENS: { id: Ordem; label: string }[] = [
  { id: 'recentes', label: 'Mais recentes' },
  { id: 'antigos', label: 'Mais antigos' },
  { id: 'nome', label: 'Nome (A–Z)' },
  { id: 'maiores', label: 'Maiores primeiro' },
];

/** Cor e icone de cada tipo (e de cada familia de documento). */
const ESTILO_DO_TIPO: Record<TipoDeArquivo, { cor: string; fundo: string; icone: ReactNode }> = {
  IMAGEM: { cor: '#2a78d6', fundo: '#eaf1fe', icone: <FileImage className="size-full" /> },
  VIDEO: { cor: '#7c62d6', fundo: '#f0ecfd', icone: <FileVideo className="size-full" /> },
  DOCUMENTO: { cor: '#1f4e6d', fundo: '#eef3f7', icone: <FileText className="size-full" /> },
  AUDIO: { cor: '#1baf7a', fundo: '#e7f8f1', icone: <Music className="size-full" /> },
  OUTRO: { cor: '#4b5967', fundo: '#f2f5f8', icone: <FileIcon className="size-full" /> },
};

const ESTILO_DA_FAMILIA: Record<FamiliaDoDocumento, { cor: string; fundo: string; icone: ReactNode }> = {
  pdf: { cor: '#d9362b', fundo: '#fdecea', icone: <FileText className="size-full" /> },
  texto: { cor: '#2a5bd7', fundo: '#e9effd', icone: <FileText className="size-full" /> },
  planilha: { cor: '#16803c', fundo: '#e6f5ec', icone: <FileSpreadsheet className="size-full" /> },
  apresentacao: { cor: '#d9661f', fundo: '#fdf0e6', icone: <Presentation className="size-full" /> },
  compactado: { cor: '#8a5a00', fundo: '#fbf3e4', icone: <FileArchive className="size-full" /> },
  outro: { cor: '#1f4e6d', fundo: '#eef3f7', icone: <FileText className="size-full" /> },
};

function estiloDe(a: Pick<ArquivoDoTime, 'tipo' | 'nome'>) {
  return a.tipo === 'DOCUMENTO' ? ESTILO_DA_FAMILIA[familiaDoDocumento(a.nome)] : ESTILO_DO_TIPO[a.tipo];
}

const extensao = (nome: string) => (nome.includes('.') ? nome.slice(nome.lastIndexOf('.') + 1).toUpperCase() : '');
const ehPdf = (a: Pick<ArquivoDoTime, 'nome' | 'mime'>) => a.mime === 'application/pdf' || /\.pdf$/i.test(a.nome);

/* -------------------------------------------------------------------------
   Fila de envio
   ------------------------------------------------------------------------- */

type EstadoDoEnvio = 'na-fila' | 'preparando' | 'enviando' | 'confirmando' | 'pronto' | 'erro' | 'cancelado';

interface ItemDaFila {
  id: string;
  arquivo: File;
  previa: string | null;
  tipo: TipoDeArquivo;
  estado: EstadoDoEnvio;
  progresso: number;
  /** Bytes por segundo, para a velocidade e o tempo restante. */
  velocidade: number;
  erro: string | null;
}

const SIMULTANEOS = 3;

/** Envia o arquivo para a URL assinada, com progresso e cancelamento. */
function enviarParaUrl(
  url: string,
  arquivo: File,
  mime: string,
  aoProgredir: (enviado: number, velocidade: number) => void,
  sinal: { xhr: XMLHttpRequest | null },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    sinal.xhr = xhr;
    const inicio = performance.now();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mime);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const segundos = Math.max(0.2, (performance.now() - inicio) / 1000);
      aoProgredir(e.loaded, e.loaded / segundos);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else if (xhr.status === 413) reject(new Error('O arquivo passa do limite do armazenamento.'));
      else reject(new Error('O armazenamento recusou o arquivo. Tente de novo.'));
    };
    xhr.onerror = () => reject(new Error('Falha de conexão durante o envio.'));
    xhr.onabort = () => reject(new Error('cancelado'));
    xhr.send(arquivo);
  });
}

export function RepositorioPanel({
  clientId,
  clientName,
  podeGerenciar,
}: {
  clientId: string;
  clientName: string;
  podeGerenciar: boolean;
}) {
  const toast = useToast();
  const loader = useCallback(
    () => api<{ arquivos: ArquivoDoTime[] }>(`/api/clients/${clientId}/arquivos`).then((r) => r.arquivos),
    [clientId],
  );
  const { data, loading, error, reload } = useRepositoryQuery(loader);
  const arquivos = useMemo(() => data ?? [], [data]);
  const resumo = useMemo(() => resumoDoRepositorio(arquivos), [arquivos]);

  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('recentes');
  const [visao, setVisao] = useState<Visao>('galeria');
  const [aberto, setAberto] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<ArquivoDoTime | null>(null);
  const [renomeando, setRenomeando] = useState<ArquivoDoTime | null>(null);

  const visiveis = useMemo(() => {
    const termo = busca
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
    const lista = arquivos.filter(
      (a) =>
        (filtro === 'TODOS' || a.tipo === filtro) &&
        (!termo ||
          a.nome
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .includes(termo)),
    );
    return [...lista].sort((a, b) =>
      ordem === 'recentes'
        ? b.criadoEm.localeCompare(a.criadoEm)
        : ordem === 'antigos'
          ? a.criadoEm.localeCompare(b.criadoEm)
          : ordem === 'nome'
            ? a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })
            : b.tamanho - a.tamanho,
    );
  }, [arquivos, filtro, busca, ordem]);

  /* --- Fila ------------------------------------------------------------ */

  const [fila, setFila] = useState<ItemDaFila[]>([]);
  const sinais = useRef(new Map<string, { xhr: XMLHttpRequest | null; cancelado: boolean }>());
  const atualizar = (id: string, parte: Partial<ItemDaFila>) =>
    setFila((atual) => atual.map((item) => (item.id === id ? { ...item, ...parte } : item)));

  function adicionar(lista: FileList | File[]) {
    const novos: ItemDaFila[] = [];
    for (const arquivo of Array.from(lista).slice(0, ARQUIVOS_POR_VEZ)) {
      const validado = validarArquivo({ nome: arquivo.name, tamanho: arquivo.size, mime: arquivo.type });
      const tipo = tipoDoArquivo(arquivo.name, arquivo.type);
      const previa = validado.ok && (tipo === 'IMAGEM' || tipo === 'VIDEO') ? URL.createObjectURL(arquivo) : null;
      novos.push({
        id: crypto.randomUUID(),
        arquivo,
        previa,
        tipo,
        estado: validado.ok ? 'na-fila' : 'erro',
        progresso: 0,
        velocidade: 0,
        erro: validado.ok ? null : validado.motivo,
      });
    }
    if (lista.length > ARQUIVOS_POR_VEZ) toast.error(`Até ${ARQUIVOS_POR_VEZ} arquivos por vez: os primeiros entraram na fila.`);
    setFila((atual) => [...novos, ...atual]);
  }

  // A fila anda sozinha: ate tres envios ao mesmo tempo.
  const filaRef = useRef(fila);
  useEffect(() => {
    filaRef.current = fila;
  }, [fila]);
  const enviar = useCallback(
    async (item: ItemDaFila) => {
      const sinal = { xhr: null as XMLHttpRequest | null, cancelado: false };
      sinais.current.set(item.id, sinal);
      try {
        atualizar(item.id, { estado: 'preparando', erro: null, progresso: 0 });
        const { envio } = await api<{ envio: { caminho: string; urlDeEnvio: string; nome: string; mime: string } }>(
          `/api/clients/${clientId}/arquivos/envio`,
          { method: 'POST', body: { nome: item.arquivo.name, tamanho: item.arquivo.size, mime: item.arquivo.type } },
        );
        if (sinal.cancelado) throw new Error('cancelado');
        atualizar(item.id, { estado: 'enviando' });
        await enviarParaUrl(
          envio.urlDeEnvio,
          item.arquivo,
          envio.mime,
          (enviado, velocidade) => atualizar(item.id, { progresso: enviado / item.arquivo.size, velocidade }),
          sinal,
        );
        atualizar(item.id, { estado: 'confirmando', progresso: 1 });
        await api(`/api/clients/${clientId}/arquivos`, {
          method: 'POST',
          body: { caminho: envio.caminho, nome: envio.nome, mime: envio.mime },
        });
        atualizar(item.id, { estado: 'pronto' });
        reload();
      } catch (e) {
        const mensagem = e instanceof Error ? e.message : 'Não foi possível enviar.';
        atualizar(item.id, mensagem === 'cancelado' ? { estado: 'cancelado' } : { estado: 'erro', erro: mensagem });
      } finally {
        sinais.current.delete(item.id);
      }
    },
    [clientId, reload],
  );
  useEffect(() => {
    const andando = fila.filter((i) => ['preparando', 'enviando', 'confirmando'].includes(i.estado)).length;
    const proximos = fila.filter((i) => i.estado === 'na-fila').slice(0, Math.max(0, SIMULTANEOS - andando));
    if (proximos.length === 0) return;
    // Marca antes de enviar: o efeito roda de novo a cada progresso.
    const quadro = requestAnimationFrame(() => {
      for (const item of proximos) {
        if (filaRef.current.find((i) => i.id === item.id)?.estado !== 'na-fila') continue;
        filaRef.current = filaRef.current.map((i) => (i.id === item.id ? { ...i, estado: 'preparando' } : i));
        void enviar(item);
      }
    });
    return () => cancelAnimationFrame(quadro);
  }, [fila, enviar]);

  function cancelar(id: string) {
    const sinal = sinais.current.get(id);
    if (sinal) {
      sinal.cancelado = true;
      sinal.xhr?.abort();
    } else {
      atualizar(id, { estado: 'cancelado' });
    }
  }
  function tentarDeNovo(id: string) {
    atualizar(id, { estado: 'na-fila', erro: null, progresso: 0 });
  }
  function limparConcluidos() {
    setFila((atual) => {
      for (const i of atual) if (['pronto', 'cancelado', 'erro'].includes(i.estado) && i.previa) URL.revokeObjectURL(i.previa);
      return atual.filter((i) => !['pronto', 'cancelado', 'erro'].includes(i.estado));
    });
  }

  // Sair da pagina com envio no meio: o navegador pergunta antes.
  const enviando = fila.some((i) => ['na-fila', 'preparando', 'enviando', 'confirmando'].includes(i.estado));
  useEffect(() => {
    if (!enviando) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [enviando]);

  /* --- Arrastar e soltar em cima do painel ------------------------------ */

  const [arrastando, setArrastando] = useState(false);
  const contador = useRef(0);
  const temArquivos = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const aoEntrar = (e: DragEvent) => {
    if (!podeGerenciar || !temArquivos(e)) return;
    e.preventDefault();
    contador.current += 1;
    setArrastando(true);
  };
  const aoSair = (e: DragEvent) => {
    if (!podeGerenciar || !temArquivos(e)) return;
    contador.current = Math.max(0, contador.current - 1);
    if (contador.current === 0) setArrastando(false);
  };
  const aoSoltar = (e: DragEvent) => {
    if (!podeGerenciar || !temArquivos(e)) return;
    e.preventDefault();
    contador.current = 0;
    setArrastando(false);
    if (e.dataTransfer.files.length) adicionar(e.dataTransfer.files);
  };

  const campo = useRef<HTMLInputElement>(null);
  const escolher = () => campo.current?.click();

  const indiceAberto = aberto ? visiveis.findIndex((a) => a.id === aberto) : -1;

  async function excluir() {
    if (!excluindo) return;
    try {
      await api(`/api/clients/${clientId}/arquivos/${excluindo.id}`, { method: 'DELETE' });
      toast.success(`"${excluindo.nome}" foi excluído.`);
      if (aberto === excluindo.id) setAberto(null);
      setExcluindo(null);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível excluir.');
    }
  }

  return (
    <div
      className="relative space-y-4"
      onDragEnter={aoEntrar}
      onDragOver={(e) => podeGerenciar && temArquivos(e) && e.preventDefault()}
      onDragLeave={aoSair}
      onDrop={aoSoltar}
    >
      {/* HEROI */}
      <header className="relative overflow-hidden rounded-card bg-gradient-to-br from-navy-900 via-navy-800 to-[#1e3a8a] p-5 text-white shadow-overlay sm:p-6">
        <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0" />
        <span aria-hidden="true" className="cmd-orbe pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-accent-500/30 blur-3xl" />
        <span aria-hidden="true" className="cmd-orbe cmd-orbe--b pointer-events-none absolute -bottom-28 left-1/3 size-72 rounded-full bg-gold-500/15 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.16em] text-white/70 uppercase">
              <FolderOpen aria-hidden="true" className="size-3.5 text-gold-400" />
              Repositório de Arquivos
            </p>
            <h2 className="mt-1 text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl">Os arquivos do {clientName}</h2>
            <p className="mt-1 max-w-xl text-sm text-white/70">
              Imagens, vídeos, áudios e documentos do time, guardados num armazenamento privado. Envie quantos quiser de uma vez.
            </p>
          </div>
          {podeGerenciar ? (
            <button
              type="button"
              onClick={escolher}
              className="group inline-flex min-h-11 items-center gap-2 rounded-pill bg-gradient-to-r from-gold-400 to-gold-500 px-5 text-sm font-bold text-navy-900 shadow-[0_12px_28px_-10px_rgba(242,193,78,0.9)] transition-all duration-200 hover:-translate-y-0.5"
            >
              <CloudUpload aria-hidden="true" className="size-5 transition-transform group-hover:-translate-y-0.5" />
              Enviar arquivos
            </button>
          ) : null}
        </div>

        <dl className="relative mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {[
            { rotulo: 'Arquivos', valor: resumo.quantidade, icone: <FolderOpen className="size-4" />, forte: true },
            { rotulo: 'Imagens', valor: resumo.porTipo.IMAGEM, icone: <FileImage className="size-4" /> },
            { rotulo: 'Vídeos', valor: resumo.porTipo.VIDEO, icone: <FileVideo className="size-4" /> },
            { rotulo: 'Documentos', valor: resumo.porTipo.DOCUMENTO, icone: <FileText className="size-4" /> },
          ].map((k, i) => (
            <div
              key={k.rotulo}
              className={cn(
                'cmd-cascata rounded-control border px-3 py-2.5',
                k.forte ? 'border-white/25 bg-white/15' : 'border-white/10 bg-white/5',
              )}
              style={{ '--cmd-atraso': `${120 + i * 70}ms` } as CSSProperties}
            >
              <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide text-white/70 uppercase">
                <span className="text-accent-400">{k.icone}</span>
                {k.rotulo}
              </dt>
              <dd className="mt-1 text-2xl leading-none font-bold">
                <Contador valor={k.valor} />
              </dd>
            </div>
          ))}
          <div
            className="cmd-cascata col-span-2 rounded-control border border-white/10 bg-white/5 px-3 py-2.5 sm:col-span-1"
            style={{ '--cmd-atraso': '400ms' } as CSSProperties}
          >
            <dt className="flex items-center gap-1.5 text-[0.6875rem] font-semibold tracking-wide text-white/70 uppercase">
              <HardDrive aria-hidden="true" className="size-4 text-accent-400" />
              Espaço usado
            </dt>
            <dd className="mt-1 text-2xl leading-none font-bold">{formatarTamanho(resumo.tamanho)}</dd>
          </div>
        </dl>
      </header>

      <input
        ref={campo}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.odt,.rtf,.txt,.md,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp,.zip,.rar,.7z"
        onChange={(e) => {
          if (e.target.files?.length) adicionar(e.target.files);
          e.target.value = '';
        }}
      />

      {/* AREA DE SOLTAR */}
      {podeGerenciar ? (
        <button
          type="button"
          onClick={escolher}
          className={cn(
            'group relative flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-card border-2 border-dashed px-6 py-8 text-center transition-all duration-300',
            arrastando ? 'scale-[1.01] border-accent-600 bg-accent-50' : 'border-line bg-surface hover:border-accent-400 hover:bg-accent-50/50',
          )}
        >
          <span aria-hidden="true" className="relative flex h-16 w-40 items-end justify-center">
            {/* Tres arquivos que sobem quando o mouse chega. */}
            <span className="absolute left-4 flex size-12 -rotate-12 items-center justify-center rounded-xl bg-[#eaf1fe] p-2.5 text-[#2a78d6] shadow-card transition-transform duration-300 group-hover:-translate-y-2 group-hover:-rotate-[18deg]">
              <FileImage className="size-full" />
            </span>
            <span className="absolute right-4 flex size-12 rotate-12 items-center justify-center rounded-xl bg-[#f0ecfd] p-2.5 text-[#7c62d6] shadow-card transition-transform duration-300 group-hover:-translate-y-2 group-hover:rotate-[18deg]">
              <FileVideo className="size-full" />
            </span>
            <span className="relative z-10 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 p-3 text-white shadow-raised transition-transform duration-300 group-hover:-translate-y-3">
              <CloudUpload className="size-full" />
            </span>
          </span>
          <span>
            <span className="block text-base font-semibold text-ink-900">
              {arrastando ? 'Solte para enviar' : 'Arraste os arquivos para cá ou clique para escolher'}
            </span>
            <span className="mt-1 block text-sm text-ink-500">
              Imagens, vídeos, áudios, PDF, Word, Excel, PowerPoint e compactados · até {ARQUIVOS_POR_VEZ} por vez · até 500 MB cada
            </span>
          </span>
        </button>
      ) : null}

      {/* Arrastando em cima do painel: a area cobre tudo. */}
      {arrastando ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex animate-fade-in items-center justify-center rounded-card border-4 border-dashed border-accent-600 bg-accent-50/85 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-accent-700">
            <span className="relative flex size-20 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-accent-400/30" />
              <CloudUpload aria-hidden="true" className="relative size-12" />
            </span>
            <p className="text-xl font-bold">Solte para enviar ao repositório</p>
          </div>
        </div>
      ) : null}

      {fila.length > 0 ? (
        <FilaDeEnvio fila={fila} onCancelar={cancelar} onTentar={tentarDeNovo} onLimpar={limparConcluidos} />
      ) : null}

      {/* BARRA */}
      <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-2 shadow-card">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex min-w-0 flex-1 items-center">
            <span className="sr-only">Buscar arquivo</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-ink-400" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pelo nome do arquivo"
              className="min-h-11 w-full rounded-control bg-ink-50 pr-3 pl-9 text-sm text-ink-900 placeholder:text-ink-400 focus:bg-surface focus:ring-2 focus:ring-accent-100 focus:outline-none"
            />
          </label>
          <div className="flex items-center gap-2">
            <select
              aria-label="Ordem"
              value={ordem}
              onChange={(e) => setOrdem(e.target.value as Ordem)}
              className="min-h-10 rounded-control border border-line bg-surface px-3 text-sm font-medium text-ink-700"
            >
              {ORDENS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <div role="group" aria-label="Visualização" className="flex rounded-control border border-line bg-ink-50 p-0.5">
              {(
                [
                  { id: 'galeria', label: 'Galeria', icone: <LayoutGrid className="size-4" /> },
                  { id: 'lista', label: 'Lista', icone: <List className="size-4" /> },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={visao === v.id}
                  aria-label={`Ver em ${v.label.toLowerCase()}`}
                  title={v.label}
                  onClick={() => setVisao(v.id)}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-[0.5rem] transition-all',
                    visao === v.id ? 'bg-surface text-accent-600 shadow-card' : 'text-ink-500 hover:text-ink-900',
                  )}
                >
                  {v.icone}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div role="group" aria-label="Tipo de arquivo" className="-mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-0.5">
          {(['TODOS', 'IMAGEM', 'VIDEO', 'DOCUMENTO', 'AUDIO', 'OUTRO'] as Filtro[])
            .filter((f) => f === 'TODOS' || f === 'IMAGEM' || f === 'VIDEO' || f === 'DOCUMENTO' || resumo.porTipo[f] > 0)
            .map((f) => {
              const ligado = filtro === f;
              const quantos = f === 'TODOS' ? resumo.quantidade : resumo.porTipo[f];
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={ligado}
                  onClick={() => setFiltro(f)}
                  className={cn(
                    'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold transition-all',
                    ligado
                      ? 'border-accent-600 bg-accent-600 text-white shadow-[0_6px_16px_-8px_rgba(37,99,235,0.8)]'
                      : 'border-line bg-surface text-ink-700 hover:bg-accent-50',
                  )}
                >
                  {f === 'TODOS' ? 'Todos' : ROTULO_DO_TIPO[f].varios}
                  <span className={cn('rounded-pill px-1.5 py-0.5 text-[0.625rem] tabular-nums', ligado ? 'bg-white/20' : 'bg-ink-100 text-ink-500')}>
                    {formatNumber(quantos)}
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {/* LISTA */}
      {error ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-card border border-danger-200 bg-danger-50 px-5 py-8 text-center">
          <p className="text-sm font-semibold text-danger-700">Não foi possível carregar os arquivos. {error}</p>
          <Button variant="secondary" onClick={reload}>
            Tentar novamente
          </Button>
        </div>
      ) : loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="animate-shimmer overflow-hidden rounded-card border border-line bg-surface" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="aspect-[4/3] bg-ink-100" />
              <div className="space-y-2 p-3">
                <div className="h-3.5 w-3/4 rounded bg-ink-100" />
                <div className="h-3 w-1/2 rounded bg-ink-100" />
              </div>
            </div>
          ))}
        </div>
      ) : arquivos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-12 text-center shadow-card">
          <span className="flex size-16 items-center justify-center rounded-full bg-accent-50 text-accent-600">
            <FolderOpen aria-hidden="true" className="size-8" />
          </span>
          <p className="text-lg font-semibold text-ink-900">O repositório ainda está vazio</p>
          <p className="max-w-md text-sm text-ink-500">
            {podeGerenciar
              ? 'Envie as fotos dos eventos, os vídeos, os materiais de campanha e os documentos do time. Tudo fica guardado aqui, num lugar só.'
              : 'Quando o time enviar arquivos, eles aparecem aqui.'}
          </p>
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-card border-2 border-dashed border-line px-6 py-10 text-center text-sm text-ink-500">
          Nenhum arquivo neste filtro{busca ? ` para "${busca}"` : ''}.
        </div>
      ) : visao === 'galeria' ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visiveis.map((a, i) => (
            <CartaoDoArquivo
              key={a.id}
              a={a}
              indice={i}
              podeGerenciar={podeGerenciar}
              onAbrir={() => setAberto(a.id)}
              onRenomear={() => setRenomeando(a)}
              onExcluir={() => setExcluindo(a)}
            />
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {visiveis.map((a, i) => (
            <LinhaDoArquivo
              key={a.id}
              a={a}
              indice={i}
              podeGerenciar={podeGerenciar}
              onAbrir={() => setAberto(a.id)}
              onRenomear={() => setRenomeando(a)}
              onExcluir={() => setExcluindo(a)}
            />
          ))}
        </ul>
      )}

      {indiceAberto >= 0 ? (
        <Visualizador
          arquivos={visiveis}
          indice={indiceAberto}
          onTrocar={(i) => setAberto(visiveis[i]?.id ?? null)}
          onFechar={() => setAberto(null)}
        />
      ) : null}

      <ConfirmDialog
        open={excluindo !== null}
        title="Excluir este arquivo?"
        description={excluindo ? `"${excluindo.nome}" sai do repositório e do armazenamento. Não dá para desfazer.` : undefined}
        confirmLabel="Excluir arquivo"
        tone="danger"
        onConfirm={excluir}
        onCancel={() => setExcluindo(null)}
      />

      {renomeando ? (
        <Renomear
          arquivo={renomeando}
          clientId={clientId}
          onFechar={() => setRenomeando(null)}
          onFeito={() => {
            setRenomeando(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
   Pecas
   ------------------------------------------------------------------------- */

function Miniatura({ a, grande = false }: { a: ArquivoDoTime; grande?: boolean }) {
  const estilo = estiloDe(a);
  const [falhou, setFalhou] = useState(false);
  if (a.tipo === 'IMAGEM' && a.url && !falhou) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={a.url}
        alt=""
        loading="lazy"
        onError={() => setFalhou(true)}
        className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
    );
  }
  if (a.tipo === 'VIDEO' && a.url && !falhou) {
    return (
      <span className="relative block size-full bg-navy-900">
        <video
          src={`${a.url}#t=0.5`}
          preload="metadata"
          muted
          playsInline
          onError={() => setFalhou(true)}
          className="size-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-navy-900 shadow-overlay transition-transform duration-300 group-hover:scale-110">
            <Play aria-hidden="true" className="ml-0.5 size-5 fill-current" />
          </span>
        </span>
      </span>
    );
  }
  return (
    <span className="flex size-full flex-col items-center justify-center gap-2" style={{ background: estilo.fundo, color: estilo.cor }}>
      <span className={cn('transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-110', grande ? 'size-24' : 'size-12')}>
        {estilo.icone}
      </span>
      {extensao(a.nome) ? (
        <span className="rounded-pill px-2 py-0.5 text-[0.6875rem] font-black tracking-wider text-white" style={{ background: estilo.cor }}>
          {extensao(a.nome)}
        </span>
      ) : null}
    </span>
  );
}

function acoes(a: ArquivoDoTime, podeGerenciar: boolean, onAbrir: () => void, onRenomear: () => void, onExcluir: () => void) {
  return [
    { id: 'ver', label: 'Abrir', icon: <Eye className="size-4" />, onSelect: onAbrir },
    {
      id: 'baixar',
      label: 'Baixar',
      icon: <ArrowDownToLine className="size-4" />,
      disabled: !a.download,
      onSelect: () => a.download && window.open(a.download, '_blank', 'noopener'),
    },
    ...(podeGerenciar
      ? [
          { id: 'renomear', label: 'Renomear', icon: <Pencil className="size-4" />, onSelect: onRenomear },
          { id: 'excluir', label: 'Excluir', icon: <Trash2 className="size-4" />, tone: 'danger' as const, onSelect: onExcluir },
        ]
      : []),
  ];
}

interface PropsDoItem {
  a: ArquivoDoTime;
  indice: number;
  podeGerenciar: boolean;
  onAbrir: () => void;
  onRenomear: () => void;
  onExcluir: () => void;
}

function CartaoDoArquivo({ a, indice, podeGerenciar, onAbrir, onRenomear, onExcluir }: PropsDoItem) {
  const estilo = estiloDe(a);
  return (
    <li className="cmd-cascata" style={{ '--cmd-atraso': `${Math.min(indice, 12) * 40}ms` } as CSSProperties}>
      <article className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(15,30,53,0.35)]">
        <button type="button" onClick={onAbrir} className="relative block aspect-[4/3] overflow-hidden" aria-label={`Abrir ${a.nome}`}>
          <Miniatura a={a} />
          <span
            className="absolute top-2 left-2 rounded-pill px-2 py-0.5 text-[0.625rem] font-bold tracking-wide text-white shadow-card"
            style={{ background: estilo.cor }}
          >
            {ROTULO_DO_TIPO[a.tipo].um}
          </span>
        </button>
        <div className="flex flex-1 items-start gap-2 p-3">
          <div className="min-w-0 flex-1">
            <button type="button" onClick={onAbrir} className="block text-left text-sm leading-snug font-semibold wrap-break-word text-ink-900 hover:text-accent-700">
              {a.nome}
            </button>
            <p className="mt-1 text-xs text-ink-500">
              {formatarTamanho(a.tamanho)} · {formatLastActivity(a.criadoEm)}
            </p>
            {a.enviadoPor ? <p className="mt-0.5 text-[0.6875rem] wrap-break-word text-ink-400">por {a.enviadoPor}</p> : null}
          </div>
          <Menu label={`Ações de ${a.nome}`} actions={acoes(a, podeGerenciar, onAbrir, onRenomear, onExcluir)} />
        </div>
      </article>
    </li>
  );
}

function LinhaDoArquivo({ a, indice, podeGerenciar, onAbrir, onRenomear, onExcluir }: PropsDoItem) {
  return (
    <li className="cmd-cascata group flex items-center gap-3 px-3 py-2.5 hover:bg-accent-50/50" style={{ '--cmd-atraso': `${Math.min(indice, 14) * 30}ms` } as CSSProperties}>
      <button type="button" onClick={onAbrir} className="relative size-14 shrink-0 overflow-hidden rounded-control" aria-label={`Abrir ${a.nome}`}>
        <Miniatura a={a} />
      </button>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onAbrir} className="block text-left text-sm font-semibold wrap-break-word text-ink-900 hover:text-accent-700">
          {a.nome}
        </button>
        <p className="text-xs text-ink-500">
          {ROTULO_DO_TIPO[a.tipo].um} · {formatarTamanho(a.tamanho)} · {formatLastActivity(a.criadoEm)}
          {a.enviadoPor ? ` · por ${a.enviadoPor}` : ''}
        </p>
      </div>
      {a.download ? (
        <a
          href={a.download}
          target="_blank"
          rel="noopener"
          className="hidden min-h-9 items-center gap-1.5 rounded-pill border border-line px-3 text-xs font-semibold text-accent-700 hover:bg-accent-50 sm:inline-flex"
        >
          <ArrowDownToLine aria-hidden="true" className="size-3.5" /> Baixar
        </a>
      ) : null}
      <Menu label={`Ações de ${a.nome}`} actions={acoes(a, podeGerenciar, onAbrir, onRenomear, onExcluir)} />
    </li>
  );
}

function FilaDeEnvio({
  fila,
  onCancelar,
  onTentar,
  onLimpar,
}: {
  fila: ItemDaFila[];
  onCancelar: (id: string) => void;
  onTentar: (id: string) => void;
  onLimpar: () => void;
}) {
  const prontos = fila.filter((i) => i.estado === 'pronto').length;
  const total = fila.filter((i) => i.estado !== 'cancelado').length;
  const terminou = fila.every((i) => ['pronto', 'erro', 'cancelado'].includes(i.estado));
  const geral = total ? fila.filter((i) => i.estado !== 'cancelado').reduce((s, i) => s + (i.estado === 'pronto' ? 1 : i.progresso), 0) / total : 0;
  return (
    <section aria-label="Envios" className="cmd-bandeja overflow-hidden rounded-card border border-line bg-surface shadow-raised">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <span className={cn('flex size-9 items-center justify-center rounded-full', terminou ? 'bg-success-50 text-success-600' : 'bg-accent-50 text-accent-600')}>
          {terminou ? <CheckCircle2 aria-hidden="true" className="cmd-chip-entra size-5" /> : <CloudUpload aria-hidden="true" className="size-5 animate-pulse" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900">
            {terminou ? `${prontos} de ${total} ${total === 1 ? 'arquivo enviado' : 'arquivos enviados'}` : `Enviando ${prontos} de ${total}…`}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-ink-100">
            <div className="h-full rounded-pill bg-gradient-to-r from-accent-500 to-accent-600 transition-[width] duration-300" style={{ width: `${Math.round(geral * 100)}%` }} />
          </div>
        </div>
        {terminou ? (
          <button type="button" onClick={onLimpar} className="inline-flex min-h-9 items-center rounded-pill px-3 text-xs font-semibold text-ink-500 hover:bg-ink-100 hover:text-ink-900">
            Limpar lista
          </button>
        ) : null}
      </header>
      <ul className="scrollbar-slim max-h-80 divide-y divide-line overflow-y-auto">
        {fila.map((item) => {
          const estilo = ESTILO_DO_TIPO[item.tipo];
          const restante = item.velocidade > 0 ? (item.arquivo.size * (1 - item.progresso)) / item.velocidade : null;
          return (
            <li key={item.id} className="cmd-chip-entra flex items-center gap-3 px-4 py-2.5">
              <span className="relative size-11 shrink-0 overflow-hidden rounded-control" style={{ background: estilo.fundo, color: estilo.cor }}>
                {item.previa && item.tipo === 'IMAGEM' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.previa} alt="" className="size-full object-cover" />
                ) : item.previa && item.tipo === 'VIDEO' ? (
                  <video src={item.previa} muted className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center p-2.5">{estilo.icone}</span>
                )}
                {item.estado === 'pronto' ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-success-600/80 text-white">
                    <CheckCircle2 aria-hidden="true" className="cmd-chip-entra size-6" />
                  </span>
                ) : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold wrap-break-word text-ink-900">{item.arquivo.name}</p>
                <p className={cn('text-xs', item.estado === 'erro' ? 'text-danger-700' : 'text-ink-500')}>
                  {item.estado === 'erro'
                    ? item.erro
                    : item.estado === 'cancelado'
                      ? 'Cancelado'
                      : item.estado === 'pronto'
                        ? `${formatarTamanho(item.arquivo.size)} · enviado`
                        : item.estado === 'na-fila'
                          ? `${formatarTamanho(item.arquivo.size)} · na fila`
                          : item.estado === 'preparando'
                            ? 'Preparando o envio…'
                            : item.estado === 'confirmando'
                              ? 'Conferindo no armazenamento…'
                              : `${formatarTamanho(item.arquivo.size * item.progresso)} de ${formatarTamanho(item.arquivo.size)} · ${formatarTamanho(item.velocidade)}/s${restante !== null ? ` · ${restante < 60 ? `${Math.ceil(restante)} s` : `${Math.ceil(restante / 60)} min`}` : ''}`}
                </p>
                {['enviando', 'preparando', 'confirmando'].includes(item.estado) ? (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-ink-100">
                    {item.estado === 'enviando' ? (
                      <div className="h-full rounded-pill transition-[width] duration-200" style={{ width: `${Math.round(item.progresso * 100)}%`, background: estilo.cor }} />
                    ) : (
                      <div className="cmd-barra-indeterminada h-full w-1/3 rounded-pill" style={{ background: estilo.cor }} />
                    )}
                  </div>
                ) : null}
              </div>
              {item.estado === 'enviando' ? (
                <span className="w-10 shrink-0 text-right text-xs font-bold text-ink-900 tabular-nums">{Math.round(item.progresso * 100)}%</span>
              ) : null}
              {['na-fila', 'preparando', 'enviando'].includes(item.estado) ? (
                <button
                  type="button"
                  onClick={() => onCancelar(item.id)}
                  aria-label={`Cancelar ${item.arquivo.name}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-danger-50 hover:text-danger-600"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              ) : item.estado === 'erro' && validarArquivo({ nome: item.arquivo.name, tamanho: item.arquivo.size, mime: item.arquivo.type }).ok ? (
                <button
                  type="button"
                  onClick={() => onTentar(item.id)}
                  aria-label={`Tentar de novo ${item.arquivo.name}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-accent-600 hover:bg-accent-50"
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Tela cheia: imagem com zoom, video, audio e PDF; setas e teclado. */
function Visualizador({
  arquivos,
  indice,
  onTrocar,
  onFechar,
}: {
  arquivos: ArquivoDoTime[];
  indice: number;
  onTrocar: (i: number) => void;
  onFechar: () => void;
}) {
  const a = arquivos[indice];
  const [zoom, setZoom] = useState({ id: '', ligado: false });
  const ampliado = zoom.id === a?.id && zoom.ligado;
  const anterior = useCallback(() => onTrocar((indice - 1 + arquivos.length) % arquivos.length), [indice, arquivos.length, onTrocar]);
  const proximo = useCallback(() => onTrocar((indice + 1) % arquivos.length), [indice, arquivos.length, onTrocar]);

  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const teclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onFechar();
      } else if (e.key === 'ArrowLeft') anterior();
      else if (e.key === 'ArrowRight') proximo();
    };
    document.addEventListener('keydown', teclar, true);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', teclar, true);
    };
  }, [onFechar, anterior, proximo]);

  if (!a) return null;
  const estilo = estiloDe(a);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Visualizar ${a.nome}`} className="fixed inset-0 z-[60] flex animate-fade-in flex-col bg-navy-900/95 text-white backdrop-blur">
      <header className="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control p-2" style={{ background: estilo.fundo, color: estilo.cor }}>
          {estilo.icone}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold wrap-break-word">{a.nome}</p>
          <p className="text-xs text-white/60">
            {ROTULO_DO_TIPO[a.tipo].um} · {formatarTamanho(a.tamanho)} · {formatLastActivity(a.criadoEm)}
            {a.enviadoPor ? ` · por ${a.enviadoPor}` : ''} · {indice + 1} de {arquivos.length}
          </p>
        </div>
        {a.tipo === 'IMAGEM' ? (
          <button
            type="button"
            onClick={() => setZoom({ id: a.id, ligado: !ampliado })}
            aria-label={ampliado ? 'Diminuir' : 'Ampliar'}
            className="hidden size-10 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white sm:flex"
          >
            {ampliado ? <ZoomOut aria-hidden="true" className="size-5" /> : <ZoomIn aria-hidden="true" className="size-5" />}
          </button>
        ) : null}
        {a.download ? (
          <a
            href={a.download}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-pill bg-gold-400 px-4 text-sm font-bold text-navy-900 hover:bg-gold-500"
          >
            <ArrowDownToLine aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Baixar</span>
          </a>
        ) : null}
        <button type="button" onClick={onFechar} aria-label="Fechar" className="flex size-10 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white">
          <X aria-hidden="true" className="size-6" />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-16">
        {arquivos.length > 1 ? (
          <>
            <button
              type="button"
              onClick={anterior}
              aria-label="Anterior"
              className="absolute left-2 z-10 flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-4"
            >
              <ChevronLeft aria-hidden="true" className="size-6" />
            </button>
            <button
              type="button"
              onClick={proximo}
              aria-label="Próximo"
              className="absolute right-2 z-10 flex size-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-4"
            >
              <ChevronRight aria-hidden="true" className="size-6" />
            </button>
          </>
        ) : null}

        <div key={a.id} className="flex size-full animate-scale-in items-center justify-center">
          {!a.url ? (
            <p className="text-sm text-white/70">Não foi possível abrir este arquivo agora. Tente baixar.</p>
          ) : a.tipo === 'IMAGEM' ? (
            <div className={cn('size-full', ampliado ? 'overflow-auto' : 'flex items-center justify-center')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.nome}
                onClick={() => setZoom({ id: a.id, ligado: !ampliado })}
                className={cn(
                  'rounded-control shadow-overlay transition-transform duration-300',
                  ampliado ? 'max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain',
                )}
              />
            </div>
          ) : a.tipo === 'VIDEO' ? (
            <video src={a.url} controls autoPlay playsInline className="max-h-full max-w-full rounded-control bg-black shadow-overlay" />
          ) : a.tipo === 'AUDIO' ? (
            <div className="flex w-full max-w-lg flex-col items-center gap-5 rounded-card bg-white/5 p-8">
              <span className="flex size-24 items-center justify-center rounded-full p-5" style={{ background: estilo.fundo, color: estilo.cor }}>
                {estilo.icone}
              </span>
              <audio src={a.url} controls autoPlay className="w-full" />
            </div>
          ) : ehPdf(a) ? (
            <iframe src={a.url} title={a.nome} className="size-full rounded-control bg-white shadow-overlay" />
          ) : (
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="flex size-32 items-center justify-center rounded-card p-7" style={{ background: estilo.fundo, color: estilo.cor }}>
                {estilo.icone}
              </span>
              <p className="max-w-md text-sm text-white/75">Este tipo de arquivo não abre aqui. Baixe para ver no seu aparelho.</p>
              {a.download ? (
                <a href={a.download} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-2 rounded-pill bg-gold-400 px-5 text-sm font-bold text-navy-900 hover:bg-gold-500">
                  <ArrowDownToLine aria-hidden="true" className="size-4" /> Baixar {extensao(a.nome)}
                </a>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Renomear({ arquivo, clientId, onFechar, onFeito }: { arquivo: ArquivoDoTime; clientId: string; onFechar: () => void; onFeito: () => void }) {
  const toast = useToast();
  const ext = arquivo.nome.includes('.') ? arquivo.nome.slice(arquivo.nome.lastIndexOf('.')) : '';
  const [nome, setNome] = useState(ext ? arquivo.nome.slice(0, -ext.length) : arquivo.nome);
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    try {
      await api(`/api/clients/${clientId}/arquivos/${arquivo.id}`, { method: 'PATCH', body: { nome: nome.trim() } });
      toast.success('Arquivo renomeado.');
      onFeito();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível renomear.');
      setSalvando(false);
    }
  }
  return (
    <Modal
      open
      onClose={onFechar}
      busy={salvando}
      size="sm"
      title="Renomear arquivo"
      footer={
        <>
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} loading={salvando} disabled={!nome.trim()}>
            Salvar
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
        className="space-y-2"
      >
        <label htmlFor="novo-nome" className="text-sm font-medium text-ink-900">
          Novo nome
        </label>
        <div className="flex items-center gap-2">
          <Input id="novo-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus maxLength={190} />
          {ext ? <span className="shrink-0 text-sm font-semibold text-ink-500">{ext}</span> : null}
        </div>
        <p className="text-xs text-ink-500">A extensão continua a mesma: renomear não muda o tipo do arquivo.</p>
      </form>
    </Modal>
  );
}
