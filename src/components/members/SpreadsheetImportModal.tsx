'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Check, Download, FileSpreadsheet, Trash2, Upload, UserPlus } from 'lucide-react';
import {
  EXEMPLO_CSV,
  lerPlanilha,
  problemasDaLinha,
  type LinhaImportada,
} from '@/lib/domain/csv-import';
import { maskSection, maskZone, normalizeVoterId } from '@/lib/utils/documents';
import { formatPhone, normalizePhone } from '@/lib/utils/phone';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

/** O que a tela precisa saber fazer com UMA pessoa conferida. */
export type SalvarLinha = (linha: LinhaImportada) => Promise<void>;

interface SpreadsheetImportModalProps {
  open: boolean;
  onClose: () => void;
  salvar: SalvarLinha;
}

/** Resultado de cada linha depois de mandar cadastrar. */
type Situacao = { estado: 'pronta' } | { estado: 'salva' } | { estado: 'falhou'; motivo: string };

/**
 * Cadastro de muita gente de uma vez, por planilha.
 *
 * Tres momentos, e a ordem e o ponto:
 *
 *   1. a planilha e lida NO NAVEGADOR e vira uma tabela. Nada foi gravado;
 *   2. quem subiu confere e CORRIGE ali mesmo — e para isso que a tabela e
 *      editavel. Uma lista que veio de fora sempre tem telefone faltando,
 *      nome pela metade, zona trocada;
 *   3. so entao "Cadastrar" grava, uma pessoa de cada vez, e cada linha diz
 *      o que aconteceu com ela.
 *
 * Gravar de uma vez so, sem esse meio, seria gravar noventa cadastros que
 * ninguem olhou — e desfazer isso depois e trabalho manual de horas.
 *
 * Linha que falhar no servidor (telefone repetido no time, por exemplo) FICA
 * na tela com o motivo, e as outras seguem. Um erro no meio da lista nao
 * pode interromper as oitenta e nove que estavam certas.
 */
export function SpreadsheetImportModal({ open, onClose, salvar }: SpreadsheetImportModalProps) {
  const toast = useToast();
  const entrada = useRef<HTMLInputElement | null>(null);

  const [linhas, setLinhas] = useState<LinhaImportada[]>([]);
  const [situacoes, setSituacoes] = useState<Record<string, Situacao>>({});
  const [ignoradas, setIgnoradas] = useState<string[]>([]);
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState(0);

  const pendentes = linhas.filter((linha) => situacoes[linha.id]?.estado !== 'salva');
  const prontas = pendentes.filter((linha) => problemasDaLinha(linha).length === 0);
  const salvas = linhas.filter((linha) => situacoes[linha.id]?.estado === 'salva').length;

  function limpar() {
    setLinhas([]);
    setSituacoes({});
    setIgnoradas([]);
    setArquivo(null);
    setProgresso(0);
  }

  async function escolher(file: File) {
    const conteudo = await file.text();
    const leitura = lerPlanilha(conteudo);

    if (leitura.linhas.length === 0) {
      toast.error('Não encontrei nenhuma pessoa na planilha. Confira o cabeçalho das colunas.');
      return;
    }

    setLinhas(leitura.linhas);
    setSituacoes({});
    setIgnoradas(leitura.ignoradas);
    setArquivo(file.name);
    setProgresso(0);

    toast.success(
      leitura.linhas.length === 1
        ? '1 pessoa lida. Confira antes de cadastrar.'
        : `${leitura.linhas.length} pessoas lidas. Confira antes de cadastrar.`,
    );
  }

  function editar(id: string, campo: keyof LinhaImportada, valor: string) {
    setLinhas((atual) =>
      atual.map((linha) => (linha.id === id ? { ...linha, [campo]: valor } : linha)),
    );
    // Corrigiu: o erro anterior daquela linha deixa de valer.
    setSituacoes((atual) => {
      if (atual[id]?.estado !== 'falhou') return atual;
      const proximo = { ...atual };
      delete proximo[id];
      return proximo;
    });
  }

  function remover(id: string) {
    setLinhas((atual) => atual.filter((linha) => linha.id !== id));
  }

  function baixarExemplo() {
    // BOM e ponto e virgula: o Excel em portugues precisa dos dois para
    // abrir o arquivo EM COLUNAS e com os acentos certos. Com virgula, ele
    // empilha tudo em uma coluna so, e a planilha chega inutil na mao de
    // quem ia preenche-la.
    const blob = new Blob([`﻿${EXEMPLO_CSV}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo-integrantes.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function cadastrar() {
    if (salvando || prontas.length === 0) return;

    setSalvando(true);
    setProgresso(0);

    let gravadas = 0;
    let falhas = 0;

    // Uma de cada vez, de proposito: o servidor confere telefone repetido
    // contra o que JA esta no time, e duas gravacoes ao mesmo tempo poderiam
    // passar duas pessoas com o mesmo numero.
    for (const linha of prontas) {
      try {
        await salvar(linha);
        gravadas += 1;
        setSituacoes((atual) => ({ ...atual, [linha.id]: { estado: 'salva' } }));
      } catch (falha) {
        falhas += 1;
        setSituacoes((atual) => ({
          ...atual,
          [linha.id]: {
            estado: 'falhou',
            motivo:
              falha instanceof Error && falha.message ? falha.message : 'Não foi possível cadastrar.',
          },
        }));
      }
      setProgresso((valor) => valor + 1);
    }

    setSalvando(false);

    if (gravadas > 0) {
      toast.success(
        gravadas === 1 ? '1 pessoa cadastrada.' : `${gravadas} pessoas cadastradas.`,
      );
    }
    if (falhas > 0) {
      toast.error(
        falhas === 1
          ? '1 linha não foi cadastrada. O motivo está na tabela.'
          : `${falhas} linhas não foram cadastradas. Os motivos estão na tabela.`,
      );
    }
  }

  function fechar() {
    if (salvando) return;
    limpar();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      size="lg"
      title="Cadastrar por planilha"
      description="A planilha vira uma lista aqui. Nada é gravado até você mandar cadastrar."
      footer={
        <>
          <p
            aria-live="polite"
            className={cn(
              'order-last flex-1 text-center text-xs font-medium sm:order-first sm:text-left',
              prontas.length > 0 ? 'text-success-600' : 'text-ink-500',
            )}
          >
            {salvando
              ? `Cadastrando ${progresso} de ${prontas.length}...`
              : linhas.length === 0
                ? 'Nenhuma planilha carregada.'
                : `${prontas.length} ${prontas.length === 1 ? 'pronta' : 'prontas'} para cadastrar` +
                  (pendentes.length - prontas.length > 0
                    ? `, ${pendentes.length - prontas.length} por corrigir`
                    : '') +
                  (salvas > 0 ? ` · ${salvas} já ${salvas === 1 ? 'cadastrada' : 'cadastradas'}` : '')}
          </p>

          <Button variant="secondary" onClick={fechar} disabled={salvando}>
            {salvas > 0 ? 'Concluir' : 'Cancelar'}
          </Button>

          <Button
            variant="accent"
            onClick={cadastrar}
            loading={salvando}
            disabled={salvando || prontas.length === 0}
          >
            {!salvando ? <UserPlus aria-hidden="true" className="size-4" /> : null}
            {prontas.length > 0 ? `Cadastrar ${prontas.length}` : 'Cadastrar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={entrada}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void escolher(file);
              // Permite escolher o MESMO arquivo de novo depois de corrigi-lo.
              event.target.value = '';
            }}
          />

          <Button variant="secondary" onClick={() => entrada.current?.click()} disabled={salvando}>
            <Upload aria-hidden="true" className="size-4" />
            {linhas.length > 0 ? 'Trocar planilha' : 'Escolher planilha'}
          </Button>

          <Button variant="ghost" onClick={baixarExemplo}>
            <Download aria-hidden="true" className="size-4" />
            Baixar modelo
          </Button>

          {arquivo ? (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-500">
              <FileSpreadsheet aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{arquivo}</span>
            </span>
          ) : null}
        </div>

        {linhas.length === 0 ? (
          <div className="rounded-control border border-dashed border-line px-4 py-8 text-center">
            <FileSpreadsheet aria-hidden="true" className="mx-auto mb-3 size-6 text-ink-400" />
            <p className="text-sm text-ink-700">
              Um arquivo <strong>.csv</strong> com uma pessoa por linha.
            </p>
            <p className="mx-auto mt-2 max-w-md text-[0.8125rem] leading-relaxed text-ink-500">
              Uma coluna para cada informação: <strong>Nome completo</strong>,{' '}
              <strong>Telefone</strong>, <strong>Título de eleitor</strong>,{' '}
              <strong>Zona eleitoral</strong>, <strong>Seção eleitoral</strong> e{' '}
              <strong>Endereço</strong>. A ordem não importa, e coluna a mais é ignorada.
            </p>
            <p className="mx-auto mt-2 max-w-md text-[0.8125rem] leading-relaxed text-ink-500">
              O modelo abre direto no Excel, já em colunas. Exportado de outro programa, serve
              separado por ponto e vírgula, vírgula ou tabulação.
            </p>
          </div>
        ) : (
          <>
            {ignoradas.length > 0 ? (
              <p className="rounded-control bg-ink-50 px-3 py-2 text-[0.8125rem] text-ink-500">
                Colunas não usadas: {ignoradas.join(', ')}.
              </p>
            ) : null}

            <div className="max-h-[24rem] overflow-auto rounded-control border border-line">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-line text-left text-[0.6875rem] font-bold tracking-wide text-ink-500 uppercase">
                    <th className="w-10 px-2 py-2">#</th>
                    <th className="px-2 py-2">Nome completo</th>
                    <th className="px-2 py-2">Telefone</th>
                    <th className="px-2 py-2">Título</th>
                    <th className="w-20 px-2 py-2">Zona</th>
                    <th className="w-20 px-2 py-2">Seção</th>
                    <th className="px-2 py-2">Endereço</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>

                <tbody>
                  {linhas.map((linha) => {
                    const situacao = situacoes[linha.id];
                    const salva = situacao?.estado === 'salva';
                    const problemas = salva ? [] : problemasDaLinha(linha);

                    return (
                      <tr
                        key={linha.id}
                        className={cn(
                          'border-b border-line align-top last:border-b-0',
                          salva && 'bg-success-50/60',
                          situacao?.estado === 'falhou' && 'bg-danger-50/60',
                        )}
                      >
                        <td className="px-2 py-1.5 text-xs text-ink-500 tabular-nums">
                          {salva ? (
                            <Check aria-label="Cadastrada" className="size-4 text-success-600" />
                          ) : (
                            linha.linha
                          )}
                        </td>

                        <td className="px-2 py-1.5">
                          <Input
                            aria-label={`Nome, linha ${linha.linha}`}
                            value={linha.name}
                            disabled={salva || salvando}
                            invalid={problemas.includes('nome')}
                            onChange={(event) => editar(linha.id, 'name', event.target.value)}
                          />
                        </td>

                        <td className="px-2 py-1.5">
                          <Input
                            aria-label={`Telefone, linha ${linha.linha}`}
                            inputMode="numeric"
                            value={formatPhone(linha.phone)}
                            disabled={salva || salvando}
                            invalid={problemas.includes('telefone')}
                            onChange={(event) =>
                              editar(linha.id, 'phone', normalizePhone(event.target.value))
                            }
                          />
                        </td>

                        <td className="px-2 py-1.5">
                          <Input
                            aria-label={`Título, linha ${linha.linha}`}
                            inputMode="numeric"
                            value={linha.voterId}
                            disabled={salva || salvando}
                            onChange={(event) =>
                              editar(linha.id, 'voterId', normalizeVoterId(event.target.value))
                            }
                          />
                        </td>

                        <td className="px-2 py-1.5">
                          <Input
                            aria-label={`Zona, linha ${linha.linha}`}
                            inputMode="numeric"
                            value={linha.zone}
                            disabled={salva || salvando}
                            onChange={(event) => editar(linha.id, 'zone', maskZone(event.target.value))}
                          />
                        </td>

                        <td className="px-2 py-1.5">
                          <Input
                            aria-label={`Seção, linha ${linha.linha}`}
                            inputMode="numeric"
                            value={linha.section}
                            disabled={salva || salvando}
                            onChange={(event) =>
                              editar(linha.id, 'section', maskSection(event.target.value))
                            }
                          />
                        </td>

                        <td className="px-2 py-1.5">
                          <Input
                            aria-label={`Endereço, linha ${linha.linha}`}
                            value={linha.address}
                            disabled={salva || salvando}
                            onChange={(event) => editar(linha.id, 'address', event.target.value)}
                          />

                          {situacao?.estado === 'falhou' ? (
                            <span className="mt-1 flex items-start gap-1 text-[0.6875rem] leading-snug text-danger-700">
                              <AlertTriangle aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                              {situacao.motivo}
                            </span>
                          ) : null}
                        </td>

                        <td className="px-2 py-1.5">
                          {!salva ? (
                            <button
                              type="button"
                              onClick={() => remover(linha.id)}
                              disabled={salvando}
                              aria-label={`Tirar a linha ${linha.linha} da lista`}
                              title="Tirar da lista"
                              className="rounded-control p-1.5 text-ink-400 transition-colors hover:bg-danger-50 hover:text-danger-700 disabled:opacity-40"
                            >
                              <Trash2 aria-hidden="true" className="size-4" />
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[0.8125rem] leading-relaxed text-ink-500">
              Corrija o que precisar aqui mesmo — nada foi gravado ainda. Nome e telefone são
              obrigatórios; título, zona, seção e endereço podem ficar em branco. Quem já foi
              cadastrado fica em verde e não é cadastrado de novo.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
