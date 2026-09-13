'use client';

import { useState } from 'react';
import { Copy, Lock } from 'lucide-react';
import type { CustomField, FieldType, SurveyConfig, SurveyConfigInput } from '@/lib/types';
import { FIELD_TYPES } from '@/lib/types';
import { updateSurvey } from '@/lib/repositories';
import {
  copyFromRegistration,
  SURVEY_IDENTITY_FIELDS,
  toSurveyFormConfig,
} from '@/lib/domain/survey-config';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { FieldsBuilder } from '@/components/fields/FieldsBuilder';
import { FormPreview } from '@/components/fields/FormPreview';
import { SurveySettingsCard } from './SurveySettingsCard';

/**
 * Construtor do questionario do time.
 *
 * EXCLUSIVO DO ADMIN GERAL. A rota confere `survey.manage`, que nenhum outro
 * perfil tem: esconder o painel nao protegeria nada sozinho.
 *
 * A edicao e literalmente a mesma do formulario de cadastro: `FieldsBuilder`
 * traz as abas, a lista, o arrastar e soltar, as setas do celular, o editor
 * de campo, a duplicacao e a confirmacao de exclusao; `FormPreview` traz a
 * previa, desenhada com os mesmos componentes da tela publica. Nao existe um
 * segundo construtor.
 *
 * O que e proprio daqui: as perguntas sao todas livres — o questionario nao
 * pede CPF, titulo nem endereco e nao aciona verificacao nenhuma — e envio
 * de imagem fica de fora, porque o questionario nao recebe arquivo.
 */

/** Tudo menos `photo`: o questionario nao recebe arquivo. */
const SURVEY_FIELD_TYPES: readonly FieldType[] = FIELD_TYPES.filter((type) => type !== 'photo');

interface SurveyBuilderPanelProps {
  clientId: string;
  teamName: string;
  teamPhoto: string | null;
  /** Campos do Formulario 1, para copiar de la como ponto de partida. */
  registrationFields: readonly CustomField[];
  survey: SurveyConfig;
  /** Chamado depois de cada gravacao, com a configuracao ja atualizada. */
  onChange: (survey: SurveyConfig) => void;
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
}

export function SurveyBuilderPanel({
  clientId,
  teamName,
  teamPhoto,
  registrationFields,
  survey,
  onChange,
  saving,
  onSavingChange,
}: SurveyBuilderPanelProps) {
  const toast = useToast();
  const [copiando, setCopiando] = useState(false);

  async function persist(changes: SurveyConfigInput, message: string) {
    onSavingChange(true);
    try {
      onChange(await updateSurvey(clientId, changes));
      toast.success(message);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível salvar o Formulário 2.',
      );
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <FieldsBuilder
      fields={survey.fields}
      busy={saving}
      allowedTypes={SURVEY_FIELD_TYPES}
      onPersist={(next: CustomField[], message) => void persist({ fields: next }, message)}
      lockedNotice={
        <>
          <IdentityNotice />
          <CopyFromRegistration
            total={registrationFields.filter((field) => field.enabled).length}
            atual={survey.fields.length}
            saving={saving}
            open={copiando}
            onAsk={() => setCopiando(true)}
            onCancel={() => setCopiando(false)}
            onConfirm={() => {
              setCopiando(false);
              void persist(
                { fields: copyFromRegistration(registrationFields) },
                'Campos copiados do Formulário 1.',
              );
            }}
          />
        </>
      }
      preview={
        <FormPreview
          config={toSurveyFormConfig(survey)}
          teamName={teamName}
          photo={teamPhoto}
          subtitle={survey.title}
          submitLabel="Enviar resposta"
        />
      }
      settings={
        <SurveySettingsCard
          // Remonta a cada gravacao: o rascunho dos textos recomeca do que
          // acabou de ser salvo, sem efeito de sincronizacao.
          key={survey.updatedAt}
          survey={survey}
          saving={saving}
          onSave={(changes, message) => void persist(changes, message)}
        />
      }
      texts={{
        noun: 'campo',
        nounPlural: 'campos',
        cardTitle: 'Campos do Formulário 2',
        cardDescription: 'Arraste para reordenar no computador ou use as setas no celular.',
        emptyTitle: 'Nenhum campo ainda',
        emptyDescription:
          'Sem pelo menos um campo ativo, o link do Formulário 2 não pode ser gerado.',
        removeDescription: (label) =>
          `O campo "${label}" sai do Formulário 2. As respostas já recebidas continuam guardadas.`,
      }}
      removeDetails={() => (
        <p className="rounded-control bg-ink-50 p-3 text-sm text-ink-700">
          Cada resposta guarda a própria cópia do texto do campo: excluir aqui não apaga nem
          altera nada do que já foi respondido.
        </p>
      )}
    />
  );
}

/**
 * Copia os campos do Formulario 1 como ponto de partida.
 *
 * Copiar NAO liga os dois formularios: depois disso, mexer em um nao toca no
 * outro. Nome, telefone e foto nao vem junto — os dois primeiros ja sao
 * campos fixos aqui, e o Formulario 2 nao recebe arquivo.
 */
function CopyFromRegistration({
  total,
  atual,
  saving,
  open,
  onAsk,
  onCancel,
  onConfirm,
}: {
  total: number;
  atual: number;
  saving: boolean;
  open: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Começar a partir do Formulário 1</CardTitle>
            <CardDescription>
              Traz os campos ativos do Formulário 1 para cá. É só um ponto de partida: depois da
              cópia, mexer em um não altera o outro.
            </CardDescription>
          </div>
          <Button variant="secondary" onClick={onAsk} disabled={saving || total === 0}>
            <Copy aria-hidden="true" className="size-4" />
            Copiar campos do Formulário 1
          </Button>
        </CardHeader>
      </Card>

      <ConfirmDialog
        open={open}
        title="Copiar campos do Formulário 1"
        description={
          atual > 0
            ? `Os ${atual} ${atual === 1 ? 'campo atual' : 'campos atuais'} do Formulário 2 serão substituídos pelos do Formulário 1.`
            : 'Os campos ativos do Formulário 1 serão copiados para o Formulário 2.'
        }
        confirmLabel="Copiar campos"
        onCancel={onCancel}
        onConfirm={onConfirm}
        details={
          <div className="space-y-2">
            <p className="rounded-control bg-ink-50 p-3 text-sm text-ink-700">
              Nome e telefone não vêm junto: o Formulário 2 já pede os dois como campos fixos.
              Foto também não, porque ele não recebe arquivo.
            </p>
            <p className="rounded-control bg-warning-50 p-3 text-sm text-warning-600">
              CPF, título de eleitor e endereço viram campos de texto comuns. O Formulário 2 não
              faz consulta: não há verificação de CPF, preenchimento automático de zona e seção
              nem lista encadeada de município e bairro.
            </p>
          </div>
        }
      />
    </>
  );
}

/**
 * Os dois campos que sempre existem.
 *
 * Nome e telefone identificam a resposta e nao sao perguntas do ADMIN: nao
 * ficam na lista, nao se excluem e nao se reordenam. Mostra-los assim evita
 * a duvida de "por que nao consigo apagar" e de "preciso criar um campo de
 * nome?".
 */
function IdentityNotice() {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Campos fixos</CardTitle>
          <CardDescription>
            Sempre aparecem primeiro, em toda resposta. Não podem ser editados nem excluídos.
          </CardDescription>
        </div>
      </CardHeader>
      <CardBody>
        <ul className="flex flex-wrap gap-2">
          {SURVEY_IDENTITY_FIELDS.map((field) => (
            <li
              key={field.id}
              className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-ink-50 px-3 py-1.5 text-[0.8125rem] font-medium text-ink-700"
            >
              <Lock aria-hidden="true" className="size-3.5 text-ink-400" />
              {field.label}
              <span className="text-danger-600">*</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
