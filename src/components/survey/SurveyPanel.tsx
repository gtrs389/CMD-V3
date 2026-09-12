'use client';

import { useCallback, useState } from 'react';
import type { SurveyConfig, SurveyResponse } from '@/lib/types';
import { fetchOwnSurvey, fetchSurvey, fetchSurveyResponses } from '@/lib/repositories';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useRepositoryQuery } from '@/hooks/use-repository-query';
import { GenerateSurveyLinkButton } from './GenerateSurveyLinkButton';
import { SurveyBuilderPanel, SurveySummaryCard } from './SurveyBuilderPanel';
import { SurveyResponsesList } from './SurveyResponsesList';

/**
 * Area do questionario no painel.
 *
 * A mesma tela serve aos tres perfis, e cada um ve o que lhe cabe:
 *
 *  - ADMIN geral          monta as perguntas e ve todas as respostas do time;
 *  - Administrador do time envia o link e ve todas as respostas do time;
 *  - EQUIPE               envia o link e ve somente as respostas que chegaram
 *                         pelos PROPRIOS links.
 *
 * O recorte nao e decidido aqui: quem decide e o servidor, em cada rota.
 * Esconder um painel nao protege nada.
 */

interface SurveyPanelProps {
  /**
   * Time exibido. Ausente significa "o meu": a rota resolve o time pela
   * sessao, e nenhum identificador vem da tela.
   */
  clientId?: string;
  /** Libera o construtor de perguntas. Exclusivo do ADMIN geral. */
  canManage?: boolean;
}

interface SurveyData {
  survey: SurveyConfig;
  responses: SurveyResponse[];
}

export function SurveyPanel({ clientId, canManage = false }: SurveyPanelProps) {
  const loader = useCallback(async (): Promise<SurveyData> => {
    if (!clientId) return fetchOwnSurvey();
    const [survey, responses] = await Promise.all([
      fetchSurvey(clientId),
      fetchSurveyResponses(clientId),
    ]);
    return { survey, responses };
  }, [clientId]);

  const { data, loading, error, reload } = useRepositoryQuery(loader);

  // Edicao local: gravar uma pergunta nao precisa esperar a releitura inteira
  // para a lista aparecer atualizada.
  const [draft, setDraft] = useState<SurveyConfig | null>(null);
  const survey = draft ?? data?.survey ?? null;

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }

  if (error || !survey || !data) {
    return (
      <div
        role="alert"
        className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
      >
        <p>{error ?? 'Não foi possível carregar o questionário.'}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <GenerateSurveyLinkButton clientId={clientId} />
      </div>

      {canManage && clientId ? (
        <SurveyBuilderPanel clientId={clientId} survey={survey} onChange={setDraft} />
      ) : (
        <SurveySummaryCard survey={survey} />
      )}

      <SurveyResponsesList responses={data.responses} />
    </div>
  );
}
