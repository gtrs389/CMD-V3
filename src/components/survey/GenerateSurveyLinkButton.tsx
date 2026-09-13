'use client';

import { generateSurveyLink } from '@/lib/repositories';
import { surveyPath } from '@/lib/utils/url';
import { GenerateLinkButton } from '@/components/clients/GenerateLinkButton';

interface GenerateSurveyLinkButtonProps {
  /**
   * Time do link. Ausente significa o link do PROPRIO usuario — e assim que
   * a equipe envia o questionario. Presente e o ADMIN geral gerando em nome
   * do Administrador do time.
   */
  clientId?: string;
  label?: string;
}

/**
 * Botao "Gerar link do questionário".
 *
 * Mesma mecanica do link de cadastro — gera, revoga o anterior e copia
 * quando a pessoa pedir —, mas aponta para OUTRA tela: quem abre este link
 * responde uma pesquisa e nao vira integrante.
 *
 * O servidor recusa a geracao com o questionario desligado ou sem nenhuma
 * pergunta ativa, e a mensagem chega pronta na tela.
 */
export function GenerateSurveyLinkButton({
  clientId,
  label = 'Copiar link do Formulário 2',
}: GenerateSurveyLinkButtonProps) {
  return (
    <GenerateLinkButton
      label={label}
      buildPath={surveyPath}
      successTitle="Link do Formulário 2 gerado"
      generate={() => generateSurveyLink(clientId)}
    />
  );
}
