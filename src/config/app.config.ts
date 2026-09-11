/**
 * Identidade e configuracoes gerais da aplicacao.
 *
 * Este arquivo concentra nome, logotipo e textos institucionais.
 * Para renomear o sistema ou trocar a marca, altere apenas este arquivo
 * (as cores, fontes, raios e sombras ficam em `src/app/globals.css`,
 * no bloco TOKENS DE IDENTIDADE VISUAL).
 */

export type LogoConfig =
  | { kind: 'monogram'; monogram: string; src?: undefined }
  | { kind: 'image'; src: string; monogram?: undefined };

export const appConfig = {
  /** Nome completo: usado no login e nos titulos principais. */
  name: 'Cadastro Mobilização Digital',
  /** Sigla usada em espacos compactos (menu recolhido, marca, rodapes). */
  shortName: 'CMD',
  tagline: 'Cadastro e gestão de equipes',
  description:
    'Painel administrativo para cadastro de candidatos, montagem de formulários e gestão de equipes.',

  /**
   * Logotipo. Troque para `{ kind: 'image', src: '/logo.svg' }`
   * quando existir um arquivo de marca em `public/`.
   */
  logo: { kind: 'monogram', monogram: 'CMD' } as LogoConfig,

  locale: 'pt-BR',

  /** Prefixo das rotas publicas de convite. */
  invitePath: '/convite',

  /** Limites de upload e de montagem de formulario. */
  limits: {
    /** Tamanho maximo do arquivo escolhido pelo usuario, antes da compressao. */
    maxUploadBytes: 10 * 1024 * 1024,
    /** Maior dimensao da imagem depois do redimensionamento. */
    maxImageEdge: 720,
    /** Alvo de tamanho da imagem ja comprimida, em bytes. */
    targetImageBytes: 160 * 1024,
    /** Teto aceito pelo servidor ao gravar a imagem no Storage privado. */
    maxStoredImageBytes: 2 * 1024 * 1024,
    maxOptionsPerField: 30,
    maxFieldsPerForm: 40,
  },

  /**
   * Aviso de privacidade exibido no formulario publico.
   * O texto abaixo e um marcador operacional: deve ser revisado
   * e substituido por um texto juridico proprio antes do uso real.
   */
  privacy: {
    enabledByDefault: false,
    defaultTitle: 'Aviso de privacidade',
    defaultText:
      'Texto provisório. Descreva aqui quem coleta os dados, com qual finalidade, por quanto tempo serão mantidos e como a pessoa pode solicitar exclusão. Revise com o responsável jurídico antes de publicar.',
    defaultConsentLabel: 'Li e concordo com o aviso de privacidade.',
  },
} as const;

export type AppConfig = typeof appConfig;
