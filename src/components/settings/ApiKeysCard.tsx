'use client';

import { useCallback, useEffect, useState } from 'react';
import { History, KeyRound, Plus, ShieldOff, TriangleAlert } from 'lucide-react';
import type { ApiKeyEvent, ApiKeySummary, BindableTeam, CreatedApiKey } from '@/lib/types';
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
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { CopyField } from '@/components/common/CopyField';

/**
 * Chaves da API de links de cadastro, em Configuracoes.
 *
 * EXCLUSIVO do ADMIN geral: as rotas exigem `settings.manage` e o perfil
 * ADMIN. O Administrador do time nao cria, nao ve, nao vincula e nao revoga
 * chave nenhuma — e tambem nao escolhe em nome de quem a API atua.
 *
 * Toda chave nasce VINCULADA: nome, time e administrador do time sao
 * escolhidos juntos, e o vinculo nao muda mais. Para trocar o administrador,
 * revoga-se a chave e cria-se outra. E desse vinculo que a API tira a
 * identidade do link — a requisicao nao escolhe nada.
 *
 * O segredo aparece UMA unica vez, no dialogo que abre logo depois de criar:
 * o banco guarda apenas o SHA-256. Fechado o dialogo, nao ha como
 * recupera-lo.
 */
export function ApiKeysCard() {
  const toast = useToast();
  const loader = useCallback(() => api<{ keys: ApiKeySummary[] }>('/api/configuracoes/chaves'), []);
  const { data, loading, error, reload } = useRepositoryQuery(loader);

  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [criada, setCriada] = useState<CreatedApiKey | null>(null);
  const [revogando, setRevogando] = useState<ApiKeySummary | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [atividade, setAtividade] = useState<Record<string, ApiKeyEvent[] | 'carregando'>>({});

  // Formulario da nova chave: os tres campos que o vinculo exige.
  const [nome, setNome] = useState('');
  const [timeId, setTimeId] = useState('');
  const [adminId, setAdminId] = useState('');
  const [times, setTimes] = useState<BindableTeam[] | null>(null);

  const chaves = data?.keys ?? [];
  const ativas = chaves.filter((chave) => chave.active).length;
  const timeEscolhido = times?.find((time) => time.id === timeId) ?? null;

  // A lista de times e carregada so quando o diálogo abre: ela nao interessa
  // a quem esta apenas olhando as chaves existentes.
  useEffect(() => {
    if (!criando || times) return;

    let ativo = true;
    void api<{ teams: BindableTeam[] }>('/api/configuracoes/chaves/opcoes')
      .then(({ teams }) => {
        if (ativo) setTimes(teams);
      })
      .catch(() => {
        if (ativo) {
          setTimes([]);
          toast.error('Não foi possível carregar os times.');
        }
      });

    return () => {
      ativo = false;
    };
  }, [criando, times, toast]);

  function abrirCriacao() {
    setNome('');
    setTimeId('');
    setAdminId('');
    setCriando(true);
  }

  async function criar() {
    if (salvando) return;
    if (!nome.trim() || !timeId || !adminId) {
      toast.error('Preencha o nome, o time e o administrador vinculado.');
      return;
    }

    setSalvando(true);
    try {
      const { key } = await api<{ key: CreatedApiKey }>('/api/configuracoes/chaves', {
        method: 'POST',
        body: { name: nome.trim(), clientId: timeId, actingUserId: adminId },
      });
      setCriando(false);
      setCriada(key);
      reload();
    } catch (falha) {
      toast.error(
        falha instanceof Error && falha.message ? falha.message : 'Não foi possível criar a chave.',
      );
    } finally {
      setSalvando(false);
    }
  }

  /**
   * Atividade da chave, carregada so quando a pessoa abre.
   *
   * Este registro existe porque o historico do LINK e igual ao de um clique
   * do proprio Administrador do time: e aqui que fica escrito que a acao veio
   * da API, com qual chave, sob qual ADMIN geral e com que resultado.
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
            Credenciais para gerar links de cadastro por programa. Cada chave pertence a{' '}
            <strong className="font-semibold text-ink-700">um administrador de um time</strong>: o
            link sai em nome dele, como se ele tivesse clicado em &quot;Gerar link&quot; no painel.
            Só a administração geral cria, vê e revoga chaves.
          </CardDescription>
        </div>
        {chaves.length > 0 ? (
          <Badge tone={ativas > 0 ? 'success' : 'neutral'}>
            {ativas} {ativas === 1 ? 'chave ativa' : 'chaves ativas'}
          </Badge>
        ) : null}
      </CardHeader>

      <CardBody className="space-y-4">
        <Button onClick={abrirCriacao}>
          <Plus aria-hidden="true" className="size-4" />
          Criar chave da API
        </Button>

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
                      {/* Chave criada antes do vínculo obrigatório: não
                          autentica mais, e ninguém é escolhido por ela. */}
                      {chave.active && !chave.binding ? (
                        <Badge tone="warning">Vínculo obrigatório</Badge>
                      ) : null}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-ink-500">
                      {maskApiKey(chave.prefix)}
                    </p>

                    {chave.binding ? (
                      <p className="mt-1 text-xs text-ink-700">
                        <span className="text-ink-500">Time:</span> {chave.binding.clientName}
                        <span className="mx-1 text-ink-400">·</span>
                        <span className="text-ink-500">Administrador:</span>{' '}
                        {chave.binding.userName}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-warning-600">
                        Sem vínculo válido — chave antiga, ou administrador/time removidos. Ela
                        não funciona: revogue e crie outra escolhendo o time e o administrador.
                      </p>
                    )}

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
                      Ver atividade
                    </Button>

                    {chave.active ? (
                      <Button variant="secondary" size="sm" onClick={() => setRevogando(chave)}>
                        <ShieldOff aria-hidden="true" className="size-4" />
                        Revogar
                      </Button>
                    ) : null}
                  </div>
                </div>

                {aberta === chave.id ? <Atividade eventos={atividade[chave.id]} /> : null}
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      {/* Criacao: nome, time e administrador, os tres juntos. */}
      <Modal
        open={criando}
        onClose={() => setCriando(false)}
        title="Criar chave da API"
        description="A chave fica permanentemente vinculada ao administrador escolhido."
        busy={salvando}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setCriando(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={() => void criar()}
              loading={salvando}
              disabled={!nome.trim() || !timeId || !adminId}
            >
              Criar chave
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field
            id="nome-da-chave"
            label="Nome da chave"
            help="Só para você reconhecer a chave nesta lista. Ex.: Integração CRM."
            required
          >
            <Input
              id="nome-da-chave"
              value={nome}
              maxLength={API_KEY_NAME_MAX}
              placeholder="Integração CRM"
              onChange={(event) => setNome(event.target.value)}
            />
          </Field>

          <Field id="time-da-chave" label="Time" required>
            <Select
              id="time-da-chave"
              value={timeId}
              disabled={times === null}
              onChange={(event) => {
                setTimeId(event.target.value);
                setAdminId('');
              }}
            >
              <option value="">
                {times === null ? 'Carregando...' : 'Escolha o time'}
              </option>
              {(times ?? []).map((time) => (
                <option key={time.id} value={time.id}>
                  {time.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            id="admin-da-chave"
            label="Administrador vinculado"
            help="Todo link gerado por esta chave sairá em nome desta pessoa, no time acima."
            required
          >
            <Select
              id="admin-da-chave"
              value={adminId}
              disabled={!timeEscolhido}
              onChange={(event) => setAdminId(event.target.value)}
            >
              <option value="">
                {timeEscolhido ? 'Escolha o administrador' : 'Escolha o time primeiro'}
              </option>
              {(timeEscolhido?.admins ?? []).map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.name}
                </option>
              ))}
            </Select>
          </Field>

          {timeEscolhido && timeEscolhido.admins.length === 0 ? (
            <p className="text-xs text-warning-600">
              Este time não tem nenhum administrador ativo. Cadastre um administrador antes de
              criar a chave.
            </p>
          ) : null}

          <p className="text-xs text-ink-500">
            O vínculo não pode ser alterado depois. Para trocar o administrador, revogue esta chave
            e crie outra.
          </p>
        </div>
      </Modal>

      {/* O segredo existe apenas aqui, e apenas agora. */}
      <Modal
        open={criada !== null}
        onClose={() => setCriada(null)}
        title="Chave criada"
        description="Copie agora: este valor não aparece de novo."
        footer={<Button onClick={() => setCriada(null)}>Já copiei, pode fechar</Button>}
      >
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-control border border-line bg-warning-50 p-3 text-sm text-warning-600">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p>
              O sistema guarda apenas um resumo criptográfico desta chave. Se você perder o valor,
              não há como recuperá-lo — será preciso revogar esta chave e criar outra.
            </p>
          </div>

          {criada?.binding ? (
            <p className="text-sm text-ink-700">
              Vinculada a <strong className="font-semibold">{criada.binding.userName}</strong>, do
              time <strong className="font-semibold">{criada.binding.clientName}</strong>. Todo link
              gerado por ela sairá em nome dessa pessoa.
            </p>
          ) : null}

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
  LINK_LISTADO: 'Listou links',
  LINK_CONSULTADO: 'Consultou link',
  CHAVE_RECUSADA: 'Chamada recusada',
};

/**
 * O que a chave fez, do mais recente para o mais antigo.
 *
 * "Em nome de" e a informacao que nao existe no rastreamento do link: la o
 * link aparece gerado pelo proprio Administrador do time, porque a API age
 * como ele. Aqui fica registrado que quem disparou foi a API, com qual
 * chave, sob qual ADMIN geral e com que resultado — inclusive as chamadas
 * RECUSADAS, com o motivo que a resposta da API nunca revela.
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
          <span
            className={
              evento.result === 'RECUSADO'
                ? 'font-semibold text-danger-700'
                : 'font-semibold text-ink-900'
            }
          >
            {ACOES[evento.action]}
          </span>
          {evento.ownerName ? ` em nome de ${evento.ownerName}` : ''}
          {evento.clientName ? ` · ${evento.clientName}` : ''}
          {evento.adminName ? ` · chave de ${evento.adminName}` : ''}
          <span className="text-ink-400"> · {formatDateTime(evento.occurredAt)}</span>
          {evento.result === 'RECUSADO' && evento.detail ? (
            <span className="text-danger-700"> · motivo: {evento.detail}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
