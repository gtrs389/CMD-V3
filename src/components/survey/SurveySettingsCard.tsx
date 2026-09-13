'use client';

import { useState } from 'react';
import type { SurveyConfig, SurveyConfigInput } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Textarea } from '@/components/ui/Textarea';

interface SurveySettingsCardProps {
  survey: SurveyConfig;
  saving: boolean;
  onSave: (changes: SurveyConfigInput, message: string) => void;
}

/**
 * Ajustes do questionario: os textos e o interruptor.
 *
 * Mesmo desenho da aba "Ajustes" do formulario de cadastro — os mesmos
 * cartoes, campos e o mesmo par "Descartar alterações / Salvar ajustes". O
 * que muda e o conjunto: o questionario tem titulo proprio e interruptor, e
 * nao tem aviso de privacidade, que pertence ao cadastro por causa do
 * documento e do endereco que ele recolhe.
 *
 * O interruptor grava na hora, como qualquer chave do sistema. Os textos
 * gravam no botao: ninguem quer uma requisicao por tecla digitada.
 *
 * O rascunho e inicializado direto do estado, sem efeito de sincronizacao:
 * quem chama remonta o cartao (via `key`) a cada gravacao, entao depois de
 * salvar o "Descartar alterações" ja volta para o texto novo.
 */
export function SurveySettingsCard({ survey, saving, onSave }: SurveySettingsCardProps) {
  const [title, setTitle] = useState(survey.title);
  const [intro, setIntro] = useState(survey.introText);
  const [success, setSuccess] = useState(survey.successMessage);

  const mudou =
    title !== survey.title || intro !== survey.introText || success !== survey.successMessage;

  function descartar() {
    setTitle(survey.title);
    setIntro(survey.introText);
    setSuccess(survey.successMessage);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Publicação</CardTitle>
            <CardDescription>
              Desligado, nenhum link deste time aceita resposta — nem os que já foram enviados.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <Switch
            label="Formulário 2 ativo"
            description="Enquanto estiver desligado, o link não pode nem ser gerado."
            checked={survey.active}
            disabled={saving}
            onChange={(checked) =>
              onSave(
                { active: checked },
                checked ? 'Formulário 2 ligado.' : 'Formulário 2 desligado.',
              )
            }
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Textos do Formulário 2</CardTitle>
            <CardDescription>Aparecem na página pública de quem responde.</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field
            id="questionario-titulo"
            label="Título"
            required
            help="Aparece no topo da tela de quem responde."
          >
            <Input
              id="questionario-titulo"
              value={title}
              maxLength={120}
              disabled={saving}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>

          <Field
            id="questionario-intro"
            label="Texto de abertura"
            help="Opcional. Explique em uma ou duas frases o que você quer saber."
          >
            <Textarea
              id="questionario-intro"
              rows={3}
              value={intro}
              maxLength={2000}
              disabled={saving}
              placeholder="Ex.: Queremos ouvir o que você acha do bairro."
              onChange={(event) => setIntro(event.target.value)}
            />
          </Field>

          <Field
            id="questionario-sucesso"
            label="Mensagem de agradecimento"
            required
            help="Exibida na tela final, depois do envio."
          >
            <Input
              id="questionario-sucesso"
              value={success}
              maxLength={400}
              disabled={saving}
              onChange={(event) => setSuccess(event.target.value)}
            />
          </Field>
        </CardBody>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={descartar} disabled={!mudou || saving}>
          Descartar alterações
        </Button>
        <Button
          loading={saving}
          disabled={!mudou}
          onClick={() =>
            onSave(
              { title, introText: intro, successMessage: success },
              'Textos do Formulário 2 salvos.',
            )
          }
        >
          Salvar ajustes
        </Button>
      </div>
    </div>
  );
}
