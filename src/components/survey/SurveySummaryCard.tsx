'use client';

import { ClipboardList } from 'lucide-react';
import type { SurveyConfig } from '@/lib/types';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';

/**
 * O questionario para quem NAO o edita.
 *
 * Administrador do time e integrante da equipe apenas enviam o link e leem
 * as respostas: aqui eles veem o que o questionario pergunta, sem nenhuma
 * acao de edicao — que a rota recusaria de qualquer forma.
 */
export function SurveySummaryCard({ survey }: { survey: SurveyConfig }) {
  const perguntas = survey.fields.filter((field) => field.enabled).length;

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{survey.title}</CardTitle>
          <CardDescription>
            {survey.active
              ? `${perguntas} ${perguntas === 1 ? 'pergunta' : 'perguntas'}, além de nome e telefone. Gere um link e envie para quem você quer ouvir.`
              : 'O questionário está desligado. Fale com a administração para ativá-lo.'}
          </CardDescription>
        </div>
      </CardHeader>
      {survey.introText ? (
        <CardBody>
          <p className="flex gap-2 text-sm whitespace-pre-line text-ink-600">
            <ClipboardList aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-400" />
            {survey.introText}
          </p>
        </CardBody>
      ) : null}
    </Card>
  );
}
