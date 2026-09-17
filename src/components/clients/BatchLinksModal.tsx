'use client';

import { useState } from 'react';
import { Check, Copy, CopyCheck, Layers, Link2 } from 'lucide-react';
import type { Client } from '@/lib/types';
import { issueTeamInviteBatch, type BatchInviteLink } from '@/lib/repositories';
import { copyText } from '@/lib/utils/clipboard';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

interface BatchLinksModalProps {
  open: boolean;
  client: Client;
  onClose: () => void;
}

/**
 * Links de cadastro em lote.
 *
 * Cada link vale para UMA pessoa: ele e reservado pelo primeiro navegador
 * que o abre e consumido quando o cadastro e enviado. Por isso mandar o
 * cadastro para dez pessoas pedia dez idas ao painel — gerar, enviar,
 * esperar, gerar de novo. Aqui os dez saem juntos, e os links que ja
 * existiam continuam valendo: o lote nao revoga nada.
 *
 * A COR DIZ O QUE FALTA. Verde e o link que ainda nao foi copiado; cinza, o
 * que ja foi. Quem esta distribuindo trinta enderecos precisa saber, de
 * relance, onde parou — e essa e a unica informacao que a lista precisa dar.
 *
 * O estado vive so nesta tela, e e disso que se trata: "ja copiei este" e
 * assunto de quem esta copiando agora, nao um dado do cadastro. Fechou,
 * acabou — e os enderecos tambem, porque o banco guarda apenas o hash de
 * cada token. Por isso o aviso antes de fechar com algum ainda por copiar.
 */
export function BatchLinksModal({ open, client, onClose }: BatchLinksModalProps) {
  const toast = useToast();
  const [quantidade, setQuantidade] = useState('10');
  const [gerando, setGerando] = useState(false);
  const [links, setLinks] = useState<BatchInviteLink[]>([]);
  /** Tokens ja copiados nesta tela. */
  const [copiados, setCopiados] = useState<Set<string>>(new Set());
  const [copiouTodos, setCopiouTodos] = useState(false);

  const pedido = Number.parseInt(quantidade.replace(/\D/g, ''), 10);
  const valido = Number.isFinite(pedido) && pedido > 0;
  const faltam = links.filter((link) => !copiados.has(link.token)).length;

  function limpar() {
    setLinks([]);
    setCopiados(new Set());
    setCopiouTodos(false);
  }

  async function gerar() {
    if (!valido || gerando) return;
    setGerando(true);

    try {
      const gerados = await issueTeamInviteBatch(client.id, pedido);
      // Um lote novo comeca do zero: o que foi copiado era do lote anterior.
      setCopiados(new Set());
      setCopiouTodos(false);
      setLinks(gerados);
      toast.success(
        gerados.length === 1 ? '1 link gerado.' : `${gerados.length} links gerados.`,
      );
    } catch (falha) {
      toast.error(
        falha instanceof Error && falha.message
          ? falha.message
          : 'Não foi possível gerar os links.',
      );
    } finally {
      setGerando(false);
    }
  }

  async function copiar(link: BatchInviteLink) {
    const endereco = link.url ?? '';
    if (!endereco) return;

    if (await copyText(endereco)) {
      setCopiados((atual) => new Set(atual).add(link.token));
    } else {
      toast.error('Não foi possível copiar. Copie manualmente pelo endereço exibido.');
    }
  }

  async function copiarTodos() {
    const enderecos = links.map((link) => link.url).filter((url): url is string => Boolean(url));
    if (enderecos.length === 0) return;

    // Um por linha: e o formato que se cola em qualquer lugar — planilha,
    // bloco de notas, conversa.
    if (await copyText(enderecos.join('\n'))) {
      setCopiados(new Set(links.map((link) => link.token)));
      setCopiouTodos(true);
      toast.success(
        enderecos.length === 1
          ? '1 link copiado.'
          : `${enderecos.length} links copiados, um por linha.`,
      );
    } else {
      toast.error('Não foi possível copiar os links.');
    }
  }

  function fechar() {
    // Fechar perde os enderecos: o banco so guarda o hash de cada token.
    if (faltam > 0) {
      const aviso =
        faltam === 1
          ? 'Falta copiar 1 link, e ele não aparece de novo depois que esta tela fechar. Fechar mesmo assim?'
          : `Faltam copiar ${faltam} links, e eles não aparecem de novo depois que esta tela fechar. Fechar mesmo assim?`;
      if (!window.confirm(aviso)) return;
    }
    limpar();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      size="lg"
      title="Gerar links em lote"
      footer={
        <>
          <Button variant="ghost" onClick={fechar} fullWidth>
            Fechar
          </Button>
          {links.length > 0 ? (
            <Button onClick={copiarTodos} fullWidth>
              {copiouTodos ? (
                <CopyCheck aria-hidden="true" className="size-4" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )}
              {copiouTodos ? 'Todos copiados' : 'Copiar todos'}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="sm:w-40">
            <Field id="quantidade-lote" label="Quantos links?">
              <Input
                id="quantidade-lote"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={quantidade}
                disabled={gerando}
                onChange={(event) => setQuantidade(event.target.value.replace(/\D/g, ''))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void gerar();
                  }
                }}
              />
            </Field>
          </div>

          <Button onClick={gerar} loading={gerando} disabled={!valido}>
            {!gerando ? <Layers aria-hidden="true" className="size-4" /> : null}
            Gerar
          </Button>
        </div>

        <p className="text-[0.8125rem] leading-relaxed text-ink-500">
          Cada link vale para <strong>uma pessoa</strong>. Os links que já existiam continuam
          valendo — o lote não revoga nenhum. Os endereços aparecem{' '}
          <strong>uma única vez</strong>: o banco guarda apenas o código de segurança de cada um.
        </p>

        {links.length > 0 ? (
          <>
            <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
              <p className="text-sm font-semibold text-ink-900">
                {links.length === 1 ? '1 link' : `${links.length} links`}
              </p>
              <p aria-live="polite" className="text-[0.8125rem] text-ink-500">
                {faltam === 0
                  ? 'Todos copiados.'
                  : faltam === 1
                    ? 'Falta 1 por copiar.'
                    : `Faltam ${faltam} por copiar.`}
              </p>
            </div>

            <ul className="max-h-[22rem] space-y-2 overflow-y-auto">
              {links.map((link, indice) => {
                const copiado = copiados.has(link.token);

                return (
                  <li key={link.token}>
                    <button
                      type="button"
                      onClick={() => void copiar(link)}
                      aria-label={`Copiar link ${indice + 1}${copiado ? ' (já copiado)' : ''}`}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-control border px-3 py-2.5 text-left transition-colors',
                        copiado
                          ? 'border-line bg-ink-50 text-ink-500 hover:bg-ink-100'
                          : 'border-success-600/40 bg-success-50 text-success-700 hover:border-success-600',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                          copiado ? 'bg-ink-200 text-ink-700' : 'bg-success-600 text-white',
                        )}
                      >
                        {copiado ? <Check className="size-4" /> : indice + 1}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          Link {indice + 1}
                        </span>
                        {/* O endereco fica a vista aqui de proposito: sao
                            varios, e quem distribui precisa distinguir um do
                            outro para saber o que ja mandou. */}
                        <span className="block truncate text-xs text-ink-500">
                          {link.url ?? 'Endereço indisponível'}
                        </span>
                      </span>

                      <span className="shrink-0 text-xs font-medium whitespace-nowrap">
                        {copiado ? 'Copiado' : 'Copiar'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="flex items-center gap-2 rounded-control border border-dashed border-line px-3 py-6 text-sm text-ink-500">
            <Link2 aria-hidden="true" className="size-4 shrink-0" />
            Escolha a quantidade e gere. Os endereços aparecem aqui para copiar.
          </p>
        )}
      </div>
    </Modal>
  );
}
