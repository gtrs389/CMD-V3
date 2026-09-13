'use client';

import { useState } from 'react';
import { BookOpen, Check, ChevronDown, Copy, Terminal } from 'lucide-react';
import {
  API_AUTH_HEADER,
  API_AUTH_NOTES,
  API_BASE,
  API_ENDPOINTS,
  API_ERRO_EXEMPLO,
  API_ERROS_GERAIS,
  API_ESTADOS,
  API_HOST_NOTE,
  API_REGRAS,
  API_VERSION,
  type DocEndpoint,
  type DocErro,
  type DocField,
} from '@/lib/domain/api-docs';
import { useOrigin } from '@/hooks/use-origin';
import { copyText } from '@/lib/utils/clipboard';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

/**
 * Documentacao da API de links de cadastro, em Configuracoes.
 *
 * A pagina inteira e exclusiva do ADMIN geral (`requireAdminPage`), e as
 * rotas conferem de novo do lado do servidor: esconder tela nunca foi
 * protecao.
 *
 * O conteudo nao mora aqui — vem de `src/lib/domain/api-docs.ts`, que e
 * conferido por teste contra os arquivos de rota. Assim a documentacao nao
 * envelhece em silencio: endpoint documentado que deixa de existir quebra a
 * verificacao.
 */

const METODO_TOM: Record<DocEndpoint['metodo'], string> = {
  GET: 'bg-info-50 text-info-600',
  POST: 'bg-success-50 text-success-700',
  DELETE: 'bg-danger-50 text-danger-700',
};

function MetodoTag({ metodo }: { metodo: DocEndpoint['metodo'] }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-16 justify-center rounded-control px-2 py-1 font-mono text-[0.6875rem] font-bold',
        METODO_TOM[metodo],
      )}
    >
      {metodo}
    </span>
  );
}

/** Bloco de codigo com copia. O conteudo e sempre texto, nunca HTML. */
function CodeBlock({ code, label }: { code: string; label: string }) {
  const toast = useToast();
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const ok = await copyText(code);
    if (!ok) {
      toast.error('Não foi possível copiar. Selecione o texto manualmente.');
      return;
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-control border border-line bg-ink-900 p-3 pr-12 font-mono text-xs leading-relaxed text-ink-50">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={() => void copiar()}
        aria-label={`Copiar ${label}`}
        className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-control bg-ink-700 text-ink-50 transition-colors hover:bg-ink-500"
      >
        {copiado ? (
          <Check aria-hidden="true" className="size-4" />
        ) : (
          <Copy aria-hidden="true" className="size-4" />
        )}
      </button>
    </div>
  );
}

function CamposTable({ titulo, campos }: { titulo: string; campos: readonly DocField[] }) {
  if (campos.length === 0) return null;

  return (
    <div>
      <h5 className="text-xs font-semibold tracking-[0.08em] text-ink-500 uppercase">{titulo}</h5>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-left text-xs">
          <thead>
            <tr className="text-ink-500">
              <th className="border-b border-line py-1.5 pr-3 font-medium">Campo</th>
              <th className="border-b border-line py-1.5 pr-3 font-medium">Tipo</th>
              <th className="border-b border-line py-1.5 font-medium">Descrição</th>
            </tr>
          </thead>
          <tbody>
            {campos.map((campo) => (
              <tr key={campo.nome} className="align-top">
                <td className="border-b border-line py-2 pr-3 font-mono text-ink-900">
                  {campo.nome}
                  {campo.obrigatorio ? (
                    <span className="ml-1 text-danger-600" title="Obrigatório">
                      *
                    </span>
                  ) : null}
                </td>
                <td className="border-b border-line py-2 pr-3 whitespace-nowrap text-ink-500">
                  {campo.tipo}
                </td>
                <td className="border-b border-line py-2 text-ink-700">{campo.descricao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ErrosTable({ erros }: { erros: readonly DocErro[] }) {
  if (erros.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] border-collapse text-left text-xs">
        <thead>
          <tr className="text-ink-500">
            <th className="border-b border-line py-1.5 pr-3 font-medium">HTTP</th>
            <th className="border-b border-line py-1.5 pr-3 font-medium">Código</th>
            <th className="border-b border-line py-1.5 font-medium">Quando acontece</th>
          </tr>
        </thead>
        <tbody>
          {erros.map((erro) => (
            <tr key={`${erro.status}-${erro.codigo}-${erro.quando}`} className="align-top">
              <td className="border-b border-line py-2 pr-3 font-mono text-ink-900">
                {erro.status}
              </td>
              <td className="border-b border-line py-2 pr-3 font-mono whitespace-nowrap text-ink-700">
                {erro.codigo}
              </td>
              <td className="border-b border-line py-2 text-ink-700">{erro.quando}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Um endpoint, fechado por padrao.
 *
 * `<details>` nativo: abre e fecha sem estado em React, funciona com teclado
 * e e encontrado pela busca do proprio navegador.
 */
function EndpointBlock({ endpoint, base }: { endpoint: DocEndpoint; base: string }) {
  return (
    <details className="group rounded-control border border-line bg-surface">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3">
        <MetodoTag metodo={endpoint.metodo} />
        <code className="min-w-0 flex-1 font-mono text-xs break-all text-ink-900 sm:text-sm">
          {endpoint.caminho}
        </code>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-ink-400 transition-transform group-open:rotate-180"
        />
        <p className="w-full text-xs text-ink-500">{endpoint.resumo}</p>
      </summary>

      <div className="space-y-4 border-t border-line p-3">
        <div className="space-y-2">
          {endpoint.descricao.map((paragrafo) => (
            <p key={paragrafo} className="text-sm text-ink-700">
              {paragrafo}
            </p>
          ))}
        </div>

        <CamposTable titulo="Parâmetros" campos={endpoint.parametros} />
        <CamposTable titulo="Corpo (JSON)" campos={endpoint.corpo} />

        <div>
          <h5 className="text-xs font-semibold tracking-[0.08em] text-ink-500 uppercase">
            Requisição
          </h5>
          <div className="mt-2">
            <CodeBlock
              label={`requisição de ${endpoint.titulo}`}
              code={endpoint.requisicao.replaceAll('https://SEU-PAINEL', base || 'https://SEU-PAINEL')}
            />
          </div>
        </div>

        <div>
          <h5 className="flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-ink-500 uppercase">
            Resposta
            <Badge tone={endpoint.respostaStatus < 300 ? 'success' : 'neutral'}>
              {endpoint.respostaStatus}
            </Badge>
          </h5>
          <div className="mt-2">
            <CodeBlock label={`resposta de ${endpoint.titulo}`} code={endpoint.resposta} />
          </div>
        </div>

        {endpoint.erros.length > 0 ? (
          <div>
            <h5 className="text-xs font-semibold tracking-[0.08em] text-ink-500 uppercase">
              Erros deste endpoint
            </h5>
            <div className="mt-2">
              <ErrosTable erros={endpoint.erros} />
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function ApiDocsCard() {
  const origin = useOrigin();
  const base = origin || '';

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>
            <span className="flex items-center gap-2">
              <BookOpen aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
              API de links de cadastro
            </span>
          </CardTitle>
          <CardDescription>
            Como gerar, consultar e revogar por programa o mesmo link que o administrador do time
            envia para as pessoas se cadastrarem.
          </CardDescription>
        </div>
        <Badge tone="brand">{API_VERSION}</Badge>
      </CardHeader>

      <CardBody className="space-y-6">
        {/* Endereco base ------------------------------------------------ */}
        <section className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <Terminal aria-hidden="true" className="size-4 text-ink-400" />
            Endereço base
          </h4>
          <CodeBlock label="endereço base" code={`${base || 'https://SEU-PAINEL'}${API_BASE}`} />
          <p className="text-xs text-ink-500">{API_HOST_NOTE}</p>
        </section>

        {/* Autenticacao ------------------------------------------------- */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-ink-900">Autenticação</h4>
          <CodeBlock label="cabeçalho de autenticação" code={API_AUTH_HEADER} />
          <ul className="space-y-1.5 text-sm text-ink-700">
            {API_AUTH_NOTES.map((nota) => (
              <li key={nota} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-ink-400" />
                <span>{nota}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Endpoints ---------------------------------------------------- */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-ink-900">Endpoints</h4>
          <div className="space-y-2">
            {API_ENDPOINTS.map((endpoint) => (
              <EndpointBlock key={endpoint.id} endpoint={endpoint} base={base} />
            ))}
          </div>
        </section>

        {/* Estados ------------------------------------------------------ */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-ink-900">Estados do link</h4>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] border-collapse text-left text-xs">
              <tbody>
                {API_ESTADOS.map((item) => (
                  <tr key={item.estado} className="align-top">
                    <td className="border-b border-line py-2 pr-3 font-mono whitespace-nowrap text-ink-900">
                      {item.estado}
                    </td>
                    <td className="border-b border-line py-2 text-ink-700">{item.significado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Erros -------------------------------------------------------- */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-ink-900">Erros</h4>
          <p className="text-sm text-ink-700">
            Toda falha responde no mesmo formato. Integre pelo{' '}
            <code className="font-mono text-xs">erro.codigo</code>: ele é estável nesta versão, a
            mensagem é texto para pessoa e pode mudar.
          </p>
          <CodeBlock label="formato de erro" code={API_ERRO_EXEMPLO} />
          <ErrosTable erros={API_ERROS_GERAIS} />
        </section>

        {/* Regras ------------------------------------------------------- */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-ink-900">O que vale para toda a API</h4>
          <ul className="space-y-1.5 text-sm text-ink-700">
            {API_REGRAS.map((regra) => (
              <li key={regra} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-ink-400" />
                <span>{regra}</span>
              </li>
            ))}
          </ul>
        </section>
      </CardBody>
    </Card>
  );
}
