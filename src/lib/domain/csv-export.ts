import type { Member } from '@/lib/types';
import { recruiterText } from './recruitment';
import { formatPhone } from '@/lib/utils/phone';

/**
 * Exportacao da equipe do time em planilha.
 *
 * O caminho de volta da planilha de cadastro (`csv-import.ts`): la a lista
 * entra, aqui ela sai. TRES colunas, e nenhuma outra:
 *
 *   Nome, Telefone e Cadastrado por.
 *
 * "Cadastrado por" e o MESMO texto que a tela mostra — "José Silva ·
 * Equipe", "Ana · Administração do time", "Cadastro anterior ao
 * rastreamento" —, porque vem da mesma funcao (`recruiterText`). Quem
 * confere a planilha ao lado da tela le a mesma coisa nos dois lugares, e a
 * origem continua correta mesmo depois que o usuario responsavel e
 * excluido: o texto sai do snapshot gravado no cadastro.
 *
 * Nada aqui fala com servidor nenhum: e montagem de texto sobre a lista que
 * a pagina JA recebeu, com o recorte de hierarquia que o servidor aplicou
 * ao enviar. A exportacao nao alcanca uma linha a mais do que a tela.
 */

/** Cabecalho da planilha, na ordem em que as colunas saem. */
export const COLUNAS_EXPORTACAO = ['Nome', 'Telefone', 'Cadastrado por'] as const;

/**
 * Ponto e virgula, como no modelo de importacao.
 *
 * O Excel em portugues abre com virgula tudo em uma coluna so. A planilha
 * exportada precisa chegar EM COLUNAS na mao de quem pediu.
 */
export const SEPARADOR_EXPORTACAO = ';';

/**
 * Comecos que o Excel e o Google Planilhas leem como FORMULA.
 *
 * Nome digitado por quem se cadastrou pelo link publico chega aqui sem
 * passar por ninguem. Um nome comecando por `=` viraria formula na planilha
 * de quem abrir o arquivo — e formula em planilha alheia e execucao de algo
 * que a pessoa nao escreveu.
 */
const COMECO_DE_FORMULA = /^[=+\-@\t\r]/;

/**
 * Uma celula de CSV: aspas ao redor, aspas dobradas dentro.
 *
 * O valor de risco sai com um apostrofo na frente, que e como as planilhas
 * marcam "isto e texto": o conteudo continua legivel e deixa de ser formula.
 */
export function celula(valor: string): string {
  const texto = (valor ?? '').replace(/\r?\n/g, ' ').trim();
  const seguro = COMECO_DE_FORMULA.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
}

/** As tres colunas de uma pessoa, na ordem do cabecalho. */
export function linhaDoIntegrante(member: Member): string[] {
  return [
    member.name,
    // Celula vazia, e nao um tracinho: assim o filtro "vazias" da planilha
    // encontra de uma vez quem esta sem telefone.
    member.phone ? formatPhone(member.phone) : '',
    recruiterText(member.recruitedBy),
  ];
}

/**
 * A planilha inteira, na ordem em que a lista chega.
 *
 * Quebra de linha CRLF por causa do Excel, que e onde este arquivo vai ser
 * aberto. O BOM nao entra aqui: ele pertence ao download, junto do tipo do
 * arquivo — ver `baixarCsv`.
 */
export function montarCsvDaEquipe(members: Member[]): string {
  const linhas = [
    COLUNAS_EXPORTACAO.map(celula).join(SEPARADOR_EXPORTACAO),
    ...members.map((member) => linhaDoIntegrante(member).map(celula).join(SEPARADOR_EXPORTACAO)),
  ];

  return linhas.join('\r\n');
}

/** Pedaco de nome de arquivo: sem acento, sem espaco e sem pontuacao. */
function pedaco(texto: string): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Nome do arquivo: `integrantes-maria-prefeita-2026-09-20.csv`.
 *
 * Com o nome do time e a data, duas exportacoes seguidas nao viram
 * "arquivo (1)" na pasta de downloads, e quem recebe sabe de qual time e de
 * quando e a lista sem abrir.
 */
export function nomeDoArquivo(nomeDoTime: string, referencia: Date = new Date()): string {
  const dia = [
    referencia.getFullYear(),
    String(referencia.getMonth() + 1).padStart(2, '0'),
    String(referencia.getDate()).padStart(2, '0'),
  ].join('-');

  const time = pedaco(nomeDoTime);
  return time ? `integrantes-${time}-${dia}.csv` : `integrantes-${dia}.csv`;
}
