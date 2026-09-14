'use client';

import { useCallback, useState } from 'react';
import { History, KeyRound, Plus, ShieldOff, TriangleAlert } from 'lucide-react';
import type { ApiKeyEvent, ApiKeySummary, CreatedApiKey } from '@/lib/types';
import { API_KEY_NAME_MAX, maskApiKey } from '@/lib/domain/api-key';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { formatDateTime } from '@/lib/utils/date';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { CopyField } from '@/components/common/CopyField';

/**
 * Chaves da API de links de cadastro, em Configuracoes.
 *
 * EXCLUSIVO do ADMIN geral: as rotas exigem `settings.manage` e o perfil
 * ADMIN. O Administrador do time e o integrante da equipe continuam gerando
 * e copiando os proprios links pelo painel — o que eles nao alcancam e esta
 * API e estas chaves.
 *
 * O segredo aparece UMA unica vez, no dialogo que abre logo depois de criar:
 * o banco guarda apenas o SHA-256. Fechado o dialogo, nao ha como recupera-lo
 * — so revogar e criar outra. Por isso o dialogo diz isso com todas as
 * letras, e nao some sozinho.
 */
export function ApiKeysCard() {
  const toast = useToast();
  const loader = useCallback(() => api<{ keys: ApiKeySummary[] }>('/api/configuracoes/chaves'), []);
  const { data, loading, error, reload } = useRepositoryQuery(loader);

  const [nome, setNome] = useState('');
  const [criando, setCriando] = useState(false);
  const [criada, setCriada] = useState<CreatedApiKey | null>(null);
  const [revogando, setRevogando] = useState<ApiKeySummary | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [atividade, setAtividade] = useState<Record<string, ApiKeyEvent[] | 'carregando'>>({});

  const chaves = data?.keys ?? [];
  const ativas = chaves.filter((chave) => chave.active).length;

  async function criar() {
    const apelido = nome.trim();
    if (!apelido || criando) return;

    setCriando(true);
    try {
      const { key } = await api<{ key: CreatedApiKey }>('/api/configuracoes/chaves', {
        method: 'POST',
        body: { name: apelido },
      });
      setCriada(key);
      setNome('');
      reload();
    } catch (falha) {
      toast.error(
        falha instanceof Error && falha.message
          ? falha.message
          : 'Não foi possível criar a chave.',
      );
    } finally {
      setCriando(false);
    }
  }

  /**
   * Atividade da chave, carregada so quando a pessoa abre.
   *
   * Este registro existe porque o historico do LINK e igual ao de um clique
   * do proprio Administrador do time: e aqui que fica escrito que a acao
   * veio da API, e em nome de quem.
   */
  async function abrirAtividade(chave: ApiKeySummary) {
    if (aberta === chave.id) {
      setAberta(null);
      return;
    }

    setAberta(chave.id);
    if (atividade[chave.id]) return;

    setAtividade((atual) => ({ ...atual, [chave.id]: 'carregando' }));
    try {
      const { events } = await api<{ events: ApiKeyEvent[] }>(
        `/api/configuracoes/chaves/${chave.id}/atividade`,
      );
      setAtividade((atual) => ({ ...atual, [chave.id]: events }));
    } catch {
      setAtividade((atual) => ({ ...atual, [chave.id]: [] }));
      toast.error('Não foi possível carregar a atividade desta chave.');
    }
  }

  async function revogar(chave: ApiKeySummary) {
    try {
      await api(`/api/configuracoes/chaves/${chave.id}`, { method: 'DELETE' });
      toast.success('Chave revogada. Ela para de funcionar imediatamente.');
      reload();
    } catch (falha) {
      toast.error(
        falha instanceof Error && falha.message
          ? falha.message
          : 'Não foi possível revogar a chave.',
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>
            <span className="flex items-center gap-2">
              <KeyRound aria-hidden="true" className="size-4 shrink-0 text-brand-700" />
              Chaves da API
            </span>
          </CardTitle>
          <CardDescription>
            Credenciais para gerar links de cadastro por programa. São exclusivas da administração
            geral: cada chave age em nome de quem a criou e para de valer se esse acesso for
            desativado.
          </CardDescription>
        </div>
        {chaves.length > 0 ? (
          <Badge tone={ativas > 0 ? 'success' : 'neutral'}>
            {ativas} {ativas === 1 ? 'chave ativa' : 'chaves ativas'}
          </Badge>
        ) : null}
      </CardHeader>

      <CardBody className="space-y-4">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void criar();
          }}
        >
          <Field
            id="nome-da-chave"
            label="Nome da chave"
            help="Só para você reconhecer a chave nesta lista."
            className="flex-1"
          >
            <Input
              id="nome-da-chave"
              value={nome}
              maxLength={API_KEY_NAME_MAX}
              placeholder="Ex.: Integração WhatsApp"
              onChange={(event) => setNome(event.target.value)}
            />
          </Field>
          <Button type="submit" loading={criando} disabled={!nome.trim()} className="sm:mb-0.5">
            <Plus aria-hidden="true" className="size-4" />
            Criar chave
          </Button>
        </form>

        {error ? (
          <p role="alert" className="text-sm text-danger-700">
            {error}
          </p>
        ) : loading ? (
          <Skeleton className="h-20 rounded-control" />
        ) : chaves.length === 0 ? (
          <p className="rounded-control border border-dashed border-line bg-ink-50 px-3 py-6 text-center text-sm text-ink-500">
            Nenhuma chave criada. Sem chave, a API responde 401 a qualquer chamada.
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-control border border-line">
            {chaves.map((chave) => (
              <li key={chave.id} className="p-3">
                <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-900">
                    {chave.name}
                    {chave.active ? null : <Badge tone="danger">Revogada</Badge>}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-ink-500">
                    {maskApiKey(chave.prefix)}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Criada em {formatDateTime(chave.createdAt)}
                    {chave.createdByName ? ` por ${chave.createdByName}` : ''}
                  </p>
                  <p className="mt-0.5 text-[0.6875rem] text-ink-400">
                    {chave.lastUsedAt
                      ? `Último uso: ${formatDateTime(chave.lastUsedAt)} · ${chave.requestCount} ${
                          chave.requestCount === 1 ? 'chamada' : 'chamadas'
                        }`
                      : 'Nunca usada'}
                    {chave.revokedAt
                      ? ` · Revogada em ${formatDateTime(chave.revokedAt)}${
                          chave.revokedByName ? ` por ${chave.revokedByName}` : ''
                        }`
                      : ''}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={aberta === chave.id}
                    onClick={() => void abrirAtividade(chave)}
                  >
                    <History aria-hidden="true" className="size-4" />
                    Atividade
                  </Button>

                  {chave.active ? (
                    <Button variant="secondary" size="sm" onClick={() => setRevogando(chave)}>
                      <ShieldOff aria-hidden="true" className="size-4" />
                      Revogar
                    </Button>
                  ) : null}
                </div>
                </div>

                {aberta === chave.id ? (
                  <Atividade eventos={atividade[chave.id]} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      {/* O segredo existe apenas aqui, e apenas agora. */}
      <Modal
        open={criada !== null}
        onClose={() => setCriada(null)}
        title="Chave criada"
        description="Copie agora: este valor não aparece de novo."
        footer={
          <Button onClick={() => setCriada(null)}>Já copiei, pode fechar</Button>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-control border border-line bg-warning-50 p-3 text-sm text-warning-600">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p>
              O sistema guarda apenas um resumo criptográfico desta chave. Se você perder o valor,
              não há como recuperá-lo — será preciso revogar esta chave e criar outra.
            </p>
          </div>

          <CopyField
            label={`Chave ${criada?.name ?? ''}`}
            value={criada?.token ?? ''}
            actionLabel="Copiar chave"
          />

          <p className="text-xs text-ink-500">
            Envie no cabeçalho <code className="font-mono">Authorization: Bearer</code> de cada
            chamada. Guarde em variável de ambiente do seu sistema, nunca no código.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={revogando !== null}
        title="Revogar chave"
        description={`"${revogando?.name ?? ''}" para de funcionar imediatamente, e qualquer integração que a use passa a receber erro 401. Os links já gerados por ela continuam valendo.`}
        confirmLabel="Revogar"
        onCancel={() => setRevogando(null)}
        onConfirm={() => {
          if (revogando) void revogar(revogando);
          setRevogando(null);
        }}
      />
    </Card>
  );
}

const ACOES: Record<ApiKeyEvent['action'], string> = {
  LINK_GERADO: 'Gerou link',
  LINK_REVOGADO: 'Revogou link',
};

/**
 * O que a chave fez, do mais recente para o mais antigo.
 *
 * "Em nome de" e a informacao que nao existe no rastreamento do link: la o
 * link aparece gerado pelo proprio Administrador do time, porque a API age
 * como ele. Aqui fica registrado que quem disparou foi a API, com qual
 * chave e sob qual administrador.
 */
function Atividade({ eventos }: { eventos: ApiKeyEvent[] | 'carregando' | undefined }) {
  if (eventos === 'carregando' || eventos === undefined) {
    return <Skeleton className="mt-3 h-16 rounded-control" />;
  }

  if (eventos.length === 0) {
    return (
      <p className="mt-3 rounded-control bg-ink-50 px-3 py-3 text-xs text-ink-500">
        Nenhuma ação registrada para esta chave ainda.
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-1.5 rounded-control bg-ink-50 p-3">
      {eventos.map((evento) => (
        <li key={evento.id} className="text-xs text-ink-700">
          <span className="font-semibold text-ink-900">{ACOES[evento.action]}</span>
          {evento.ownerName ? ` em nome de ${evento.ownerName}` : ''}
          {evento.clientName ? ` · ${evento.clientName}` : ''}
          <span className="text-ink-400"> · {formatDateTime(evento.occurredAt)}</span>
        </li>
      ))}
    </ul>
  );
}
