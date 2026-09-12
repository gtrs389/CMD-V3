'use client';

import { MessageSquareText, Phone } from 'lucide-react';
import type { SurveyAnswer, SurveyResponse } from '@/lib/types';
import { formatPhone } from '@/lib/utils/phone';
import { formatLongDate } from '@/lib/utils/date';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Respostas recebidas pelo questionario.
 *
 * Nenhuma pessoa listada aqui e integrante: sao pessoas que apenas
 * responderam. Por isso nao ha foto, ficha, verificacao, mapa nem qualquer
 * acao de cadastro — so o que foi respondido.
 *
 * O rotulo de cada pergunta vem da propria resposta, copiado no momento do
 * envio: reescrever ou excluir a pergunta depois nao muda o que ja foi
 * respondido.
 */
export function SurveyResponsesList({ responses }: { responses: SurveyResponse[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Respostas recebidas</CardTitle>
          <CardDescription>
            {responses.length === 0
              ? 'Nenhuma resposta até agora.'
              : `${responses.length} ${responses.length === 1 ? 'resposta' : 'respostas'}. Quem respondeu não faz parte da equipe.`}
          </CardDescription>
        </div>
      </CardHeader>
      <CardBody>
        {responses.length === 0 ? (
          <EmptyState
            compact
            icon={<MessageSquareText className="size-5" />}
            title="Nenhuma resposta ainda"
            description="Gere o link do questionário e envie para as pessoas que você quer ouvir."
          />
        ) : (
          <ul className="space-y-3">
            {responses.map((response) => (
              <ResponseCard key={response.id} response={response} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function ResponseCard({ response }: { response: SurveyResponse }) {
  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 font-semibold break-words text-ink-900">{response.name}</p>
        <p className="text-xs whitespace-nowrap text-ink-400">
          {formatLongDate(response.answeredAt)}
        </p>
      </div>

      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-500">
        <Phone aria-hidden="true" className="size-3.5 shrink-0" />
        {formatPhone(response.phone)}
      </p>

      {response.senderName ? (
        <p className="mt-0.5 text-xs text-ink-400">Enviado por {response.senderName}</p>
      ) : null}

      <dl className="mt-3 space-y-2 border-t border-line pt-3">
        {response.answers.map((answer, index) => (
          <div key={`${response.id}-${index}`}>
            <dt className="text-xs font-medium text-ink-500">{answer.label}</dt>
            <dd className="text-sm break-words whitespace-pre-line text-ink-900">
              {readable(answer)}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

/** Texto de leitura de um valor respondido. Vazio vira um traco, nunca "null". */
function readable(answer: SurveyAnswer): string {
  const { value } = answer;
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—';
  if (answer.type === 'phone') return formatPhone(String(value));
  return String(value);
}
