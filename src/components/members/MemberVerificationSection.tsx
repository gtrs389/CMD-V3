'use client';

import { useCallback, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, MinusCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import type { Member } from '@/lib/types';
import type { VerificationStep } from '@/lib/domain/verification';
import {
  compareGender,
  compareValues,
  type MatchState,
  type VerificationView,
} from '@/lib/domain/verification';
import { api } from '@/lib/repositories/http/api';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { formatDateTime } from '@/lib/utils/date';
import { formatCpf, genderLabel } from '@/lib/utils/documents';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Verificacao cadastral na ficha do integrante.
 *
 * Somente o painel do ADMIN mostra estes dados: o formulario publico e a tela
 * de sucesso nunca os recebem. O que a pessoa declarou continua intacto; a
 * consulta aparece ao lado, para comparacao.
 */

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Não consultado',
  RUNNING: 'Consultando',
  COMPLETED: 'Verificado',
  PARTIAL: 'Parcial',
  FAILED: 'Indisponível',
};

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  PENDING: 'neutral',
  RUNNING: 'info',
  COMPLETED: 'success',
  PARTIAL: 'warning',
  FAILED: 'danger',
};

function MatchIcon({ state }: { state: MatchState }) {
  if (state === 'MATCH') {
    return <CheckCircle2 aria-label="Confere" className="size-4 shrink-0 text-success-600" />;
  }
  if (state === 'DIFFERENT') {
    return <AlertTriangle aria-label="Diferente" className="size-4 shrink-0 text-warning-600" />;
  }
  return <MinusCircle aria-label="Sem comparação" className="size-4 shrink-0 text-ink-400" />;
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:gap-3">
      <dt className="text-xs text-ink-500 sm:w-2/5">{label}</dt>
      <dd className="text-sm break-words text-ink-900 sm:flex-1">{value || '--'}</dd>
    </div>
  );
}

function Comparison({
  label,
  declared,
  found,
  state,
}: {
  label: string;
  declared: string | null;
  found: string | null;
  state: MatchState;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <MatchIcon state={state} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-500">{label}</p>
        <p className="text-sm break-words text-ink-900">{declared || '--'}</p>
        <p
          className={cn(
            'text-xs break-words',
            state === 'DIFFERENT' ? 'font-medium text-warning-600' : 'text-ink-500',
          )}
        >
          Consultado: {found || '--'}
        </p>
      </div>
    </div>
  );
}

export function MemberVerificationSection({ member }: { member: Member | null }) {
  const memberId = member?.id ?? null;
  const [retrying, setRetrying] = useState<VerificationStep | null>(null);

  const loader = useCallback(async (): Promise<VerificationView | null> => {
    if (!memberId) return null;
    const { verification } = await api<{ verification: VerificationView | null }>(
      `/api/members/${memberId}/verificacao`,
    );
    return verification;
  }, [memberId]);

  const { data, loading, error, reload } = useRepositoryQuery<VerificationView | null>(loader);

  async function retry(step: VerificationStep) {
    if (!memberId || retrying) return;
    setRetrying(step);
    try {
      await api(`/api/members/${memberId}/verificacao`, { method: 'POST', body: { step } });
      reload();
    } catch {
      reload();
    } finally {
      setRetrying(null);
    }
  }

  if (!member) return null;

  return (
    <section aria-labelledby="verificacao-cadastral" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id="verificacao-cadastral"
          className="flex items-center gap-2 text-sm font-semibold text-ink-900"
        >
          <ShieldCheck aria-hidden="true" className="size-4 text-brand-700" />
          Verificação cadastral
        </h3>

        {data ? (
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[data.status] ?? 'neutral'}>
              {STATUS_LABEL[data.status] ?? data.status}
            </Badge>
            <span className="text-xs text-ink-500">
              {data.status === 'PENDING' ? 'Aguardando' : formatDateTime(data.updatedAt)}
            </span>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <p className="rounded-control border border-line bg-ink-50 p-3 text-sm text-ink-500">
          Não foi possível carregar a verificação.
        </p>
      ) : !data ? (
        <p className="rounded-control border border-line bg-ink-50 p-3 text-sm text-ink-500">
          Este cadastro ainda não passou por verificação.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Comparacao: o declarado nunca e alterado pela consulta. */}
          <div className="rounded-control border border-line p-3">
            <p className="mb-1 text-xs font-semibold text-ink-700">Declarado x consultado</p>
            <Comparison
              label="Nome"
              declared={member.name}
              found={data.cadastro?.nome ?? null}
              state={compareValues(member.name, data.cadastro?.nome)}
            />
            <Comparison
              label="CPF"
              declared={member.cpf ? formatCpf(member.cpf) : null}
              found={data.cadastro?.cpf ? formatCpf(data.cadastro.cpf) : null}
              state={compareValues(member.cpf, data.cadastro?.cpf)}
            />
            <Comparison
              label="Gênero"
              declared={genderLabel(member.gender)}
              found={data.cadastro?.sexo ?? null}
              state={compareGender(member.gender, data.cadastro?.sexo)}
            />
            <Comparison
              label="Localização"
              declared={[member.city, member.state].filter(Boolean).join(' - ') || null}
              found={
                [data.eleitoral?.municipio, data.eleitoral?.uf].filter(Boolean).join(' - ') || null
              }
              state={compareValues(
                [member.city, member.state].filter(Boolean).join(' - '),
                [data.eleitoral?.municipio, data.eleitoral?.uf].filter(Boolean).join(' - '),
              )}
            />
          </div>

          <StepBlock
            title="Dados cadastrais"
            step="cpf"
            status={data.steps.cpf}
            retrying={retrying === 'cpf'}
            onRetry={() => retry('cpf')}
          >
            {data.cadastro ? (
              <dl className="divide-y divide-line">
                <Row label="Nome" value={data.cadastro.nome} />
                <Row label="Nascimento" value={data.cadastro.dataNascimento} />
                <Row label="Idade" value={data.cadastro.idade ? String(data.cadastro.idade) : null} />
                <Row label="Sexo" value={data.cadastro.sexo} />
                <Row label="Nome da mãe" value={data.cadastro.nomeMae} />
                <Row label="Nome do pai" value={data.cadastro.nomePai} />
                <Row label="Situação cadastral" value={data.cadastro.situacaoCadastral} />
                <Row label="Data da situação" value={data.cadastro.dataSituacaoCadastral} />
                <Row
                  label="Óbito"
                  value={data.cadastro.obito === null ? null : data.cadastro.obito ? 'Sim' : 'Não'}
                />
              </dl>
            ) : null}
          </StepBlock>

          <StepBlock
            title="Situação eleitoral"
            step="tse"
            status={data.steps.tse}
            retrying={retrying === 'tse'}
            onRetry={() => retry('tse')}
            /* Cadastro antigo marcado como pulado: o ADMIN pode consultar
               agora, reusando a consulta de CPF ja guardada. */
            allowWhenSkipped={
              data.steps.cpf.status === 'SUCCESS' &&
              Boolean(data.cadastro?.nomeMae) &&
              Boolean(data.cadastro?.dataNascimento)
            }
            skippedLabel="Consultar dados eleitorais"
          >
            {data.eleitoral ? (
              <dl className="divide-y divide-line">
                <Row label="Situação" value={data.eleitoral.status} />
                <Row label="Eleitor" value={data.eleitoral.eleitor} />
                <Row label="Inscrição" value={data.eleitoral.inscricao} />
                <Row
                  label="Biometria"
                  value={
                    data.eleitoral.biometriaColetada === null
                      ? null
                      : data.eleitoral.biometriaColetada
                        ? 'Coletada'
                        : 'Não coletada'
                  }
                />
                <Row label="Zona" value={data.eleitoral.zona} />
                <Row label="Seção" value={data.eleitoral.secao} />
                <Row label="Local de votação" value={data.eleitoral.local} />
                <Row
                  label="Endereço"
                  value={
                    [data.eleitoral.logradouro, data.eleitoral.numero, data.eleitoral.bairro]
                      .filter(Boolean)
                      .join(', ') || null
                  }
                />
                <Row
                  label="Município"
                  value={
                    [data.eleitoral.municipio, data.eleitoral.uf].filter(Boolean).join(' - ') || null
                  }
                />
                <Row label="Próxima eleição" value={data.eleitoral.proximaEleicao} />
              </dl>
            ) : null}
          </StepBlock>
        </div>
      )}
    </section>
  );
}

interface StepBlockProps {
  title: string;
  step: VerificationStep;
  status: VerificationView['steps']['cpf'];
  retrying: boolean;
  onRetry: () => void;
  /** Libera a acao quando a etapa ficou pulada mas ja ha dados para consultar. */
  allowWhenSkipped?: boolean;
  skippedLabel?: string;
  children: React.ReactNode;
}

/**
 * Bloco de uma consulta. A acao aparece em falha e, quando liberado, tambem
 * no estado pulado: em ambos os casos o aviso de cobranca acompanha.
 */
function StepBlock({
  title,
  status,
  retrying,
  onRetry,
  allowWhenSkipped = false,
  skippedLabel = 'Consultar',
  children,
}: StepBlockProps) {
  return (
    <div className="rounded-control border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-700">{title}</p>

        {status.status === 'PENDING' ? (
          <span className="flex items-center gap-1.5 text-xs text-ink-500">
            <Clock3 aria-hidden="true" className="size-3.5" />
            Não consultado
          </span>
        ) : status.status === 'SKIPPED_MISSING_DATA' ? (
          allowWhenSkipped ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              title="Uma nova consulta pode gerar cobrança."
              className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-line-strong bg-surface px-2.5 text-xs font-medium text-ink-900 transition-colors hover:bg-ink-50 disabled:opacity-60"
            >
              {retrying ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
              {skippedLabel}
            </button>
          ) : (
            <span className="text-xs text-ink-500">Sem dados suficientes para consultar</span>
          )
        ) : status.status === 'SUCCESS' ? (
          <span className="text-xs text-ink-500">
            {status.completedAt ? formatDateTime(status.completedAt) : 'Consultado'}
          </span>
        ) : (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            title="Uma nova tentativa pode gerar cobrança."
            className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-line-strong bg-surface px-2.5 text-xs font-medium text-ink-900 transition-colors hover:bg-ink-50 disabled:opacity-60"
          >
            {retrying ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
            Tentar novamente
          </button>
        )}
      </div>

      {status.status === 'FAILED' ? (
        <p className="mt-1.5 text-xs text-danger-700">
          {status.error} Uma nova tentativa pode gerar cobrança.
        </p>
      ) : status.status === 'SKIPPED_MISSING_DATA' && allowWhenSkipped ? (
        <p className="mt-1.5 text-xs text-ink-500">
          Esta consulta não foi feita no cadastro. Uma nova consulta pode gerar cobrança.
        </p>
      ) : null}

      <div className="mt-2">{children}</div>
    </div>
  );
}
