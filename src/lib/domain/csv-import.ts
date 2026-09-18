import { normalizeSection, normalizeVoterId, normalizeZone } from '@/lib/utils/documents';
import { isValidPhone, normalizePhone } from '@/lib/utils/phone';

/**
 * Cadastro de muita gente de uma vez, por planilha.
 *
 * Quem recebe uma lista pronta — de um mutirao, de outro sistema, de um
 * caderno digitado — nao vai redigitar noventa pessoas em noventa fichas. A
 * planilha entra, vira uma tabela na tela, e SO E GRAVADA quando quem subiu
 * conferir e mandar cadastrar.
 *
 * CINCO colunas sao lidas, e nenhuma outra:
 *
 *   Nome completo, Telefone, Titulo de eleitor, Zona e Secao.
 *
 * O ENDERECO NAO VEM DA PLANILHA, de proposito. Ele nao e um texto: e uma
 * escolha encadeada — Estado, depois Municipio, depois Bairro, depois Rua —,
 * e cada passo so existe dentro do anterior. Um texto solto vindo de
 * planilha nao se encaixa nessa cadeia, e gravar "Rua Brasil" sem saber de
 * qual municipio nao localiza ninguem no mapa. Na conferencia, o endereco e
 * escolhido nas mesmas listas do formulario.
 *
 * As colunas sao achadas PELO NOME, sem depender da ordem, e acento, caixa e
 * pontuacao nao atrapalham. Coluna a mais na planilha e ignorada em silencio:
 * a lista veio de outro lugar, e nao cabe exigir que ela tenha exatamente
 * este formato.
 *
 * Nada aqui fala com servidor nenhum: e leitura de texto, e roda no proprio
 * navegador de quem subiu o arquivo.
 */

export interface LinhaImportada {
  /** Identificador so desta tela, para a tabela nao se perder ao editar. */
  id: string;
  /** Numero da linha na planilha, como o editor mostra. */
  linha: number;
  name: string;
  phone: string;
  voterId: string;
  zone: string;
  section: string;
}

export interface LeituraDaPlanilha {
  linhas: LinhaImportada[];
  /** Colunas que a planilha tinha e nao foram usadas. */
  ignoradas: string[];
  /** Linhas vazias, puladas sem alarde. */
  vazias: number;
}

/** Sem acento e em minusculas: o cabecalho casa escrito de qualquer jeito. */
function chave(texto: string): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Nomes aceitos para cada coluna, do mais explicito ao mais curto. */
const COLUNAS: Record<keyof Omit<LinhaImportada, 'id' | 'linha'>, string[]> = {
  name: ['nome completo', 'nome', 'nome do integrante', 'integrante'],
  phone: ['telefone', 'celular', 'whatsapp', 'whats', 'fone', 'contato'],
  voterId: ['titulo de eleitor', 'titulo', 'inscricao', 'inscricao eleitoral'],
  zone: ['zona eleitoral', 'zona'],
  section: ['secao eleitoral', 'secao', 'sessao eleitoral', 'sessao'],
};

/**
 * Separador da planilha, decidido pela PRIMEIRA linha.
 *
 * Um endereco costuma ter virgula dentro ("Rua das Flores, 100"), entao
 * contar virgulas no arquivo inteiro enganaria. O cabecalho nao tem esse
 * problema.
 */
function detectarSeparador(primeiraLinha: string): string {
  const virgulas = (primeiraLinha.match(/,/g) ?? []).length;
  const pontoEVirgula = (primeiraLinha.match(/;/g) ?? []).length;
  const tabulacoes = (primeiraLinha.match(/\t/g) ?? []).length;

  if (tabulacoes > virgulas && tabulacoes > pontoEVirgula) return '\t';
  return pontoEVirgula > virgulas ? ';' : ',';
}

/**
 * CSV completo: aspas, aspas duplicadas dentro do campo e quebra de linha
 * dentro de campo entre aspas.
 */
export function parseCsv(texto: string, separador: string): string[][] {
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const char = texto[i];

    if (dentroDeAspas) {
      if (char === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += char;
      }
      continue;
    }

    if (char === '"') {
      dentroDeAspas = true;
    } else if (char === separador) {
      linha.push(campo);
      campo = '';
    } else if (char === '\n') {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else if (char !== '\r') {
      campo += char;
    }
  }

  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  return linhas;
}

function limpo(valor: string | undefined, limite: number): string {
  return (valor ?? '').replace(/\s+/g, ' ').trim().slice(0, limite);
}

let contador = 0;

/**
 * Le a planilha inteira.
 *
 * Os valores ja saem NORMALIZADOS, do mesmo jeito que sairiam se tivessem
 * sido digitados na ficha: telefone sem mascara, titulo so com digitos, zona
 * e secao sem o zero a frente. A planilha nao e um caminho paralelo — ela
 * entra pela mesma porta.
 */
export function lerPlanilha(conteudo: string): LeituraDaPlanilha {
  let texto = conteudo ?? '';
  // BOM do Excel: invisivel, mas quebraria o nome da primeira coluna.
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  if (!texto.trim()) return { linhas: [], ignoradas: [], vazias: 0 };

  // "sep=;" na primeira linha e uma instrucao para o Excel, nao um dado.
  // Alguns programas a escrevem ao exportar; ler isso como cabecalho
  // deixaria a planilha inteira sem coluna nenhuma reconhecida.
  texto = texto.replace(/^sep=.\r?\n/i, '');

  const quebra = texto.indexOf('\n');
  const separador = detectarSeparador(quebra === -1 ? texto : texto.slice(0, quebra));
  const grade = parseCsv(texto, separador);
  if (grade.length === 0) return { linhas: [], ignoradas: [], vazias: 0 };

  const cabecalho = grade[0].map(chave);
  const indices: Partial<Record<keyof typeof COLUNAS, number>> = {};
  const usadas = new Set<number>();

  for (const [campo, aceitos] of Object.entries(COLUNAS) as [keyof typeof COLUNAS, string[]][]) {
    for (const aceito of aceitos) {
      const posicao = cabecalho.indexOf(aceito);
      if (posicao !== -1) {
        indices[campo] = posicao;
        usadas.add(posicao);
        break;
      }
    }
  }

  const ignoradas = grade[0]
    .map((nome, posicao) => (usadas.has(posicao) || !nome.trim() ? null : nome.trim()))
    .filter((nome): nome is string => nome !== null);

  const valor = (linha: string[], campo: keyof typeof COLUNAS): string => {
    const posicao = indices[campo];
    return posicao === undefined ? '' : (linha[posicao] ?? '');
  };

  const linhas: LinhaImportada[] = [];
  let vazias = 0;

  for (let i = 1; i < grade.length; i += 1) {
    const bruta = grade[i];
    if (bruta.every((celula) => (celula ?? '').trim() === '')) {
      vazias += 1;
      continue;
    }

    contador += 1;
    linhas.push({
      id: `csv-${contador}`,
      linha: i + 1,
      name: limpo(valor(bruta, 'name'), 120),
      // Normalizados aqui, como se tivessem sido digitados na ficha.
      phone: normalizePhone(valor(bruta, 'phone')),
      voterId: normalizeVoterId(valor(bruta, 'voterId')),
      zone: normalizeZone(valor(bruta, 'zone')),
      section: normalizeSection(valor(bruta, 'section')),
    });
  }

  return { linhas, ignoradas, vazias };
}

/**
 * O que impede ESTA linha de ser cadastrada.
 *
 * Vazio quer dizer pronta. As duas unicas exigencias sao as mesmas da ficha:
 * nome e telefone — o telefone porque e ele que identifica a pessoa no time,
 * e sem ele o servidor recusaria de qualquer jeito. O resto pode faltar.
 */
export function problemasDaLinha(linha: LinhaImportada): string[] {
  const problemas: string[] = [];

  if (linha.name.trim().length < 2) problemas.push('nome');
  if (!isValidPhone(linha.phone)) problemas.push('telefone');

  return problemas;
}

/**
 * Modelo para baixar: cabecalho e duas linhas de exemplo.
 *
 * Separado por PONTO E VIRGULA, e isso nao e detalhe. O Excel em portugues
 * usa o ponto e virgula como separador de lista, e um arquivo separado por
 * VIRGULA abre nele com tudo empilhado em UMA coluna so — a planilha chega
 * inutil na mao de quem ia preenche-la. Com ponto e virgula ela abre em
 * colunas, que e como uma planilha tem de chegar.
 *
 * Quem usa outro programa nao perde nada: a leitura aqui aceita ponto e
 * virgula, virgula e tabulacao, decidindo pelo proprio arquivo.
 */
export const MODELO_SEPARADOR = ';';

export const EXEMPLO_CSV = [
  'Nome completo;Telefone;Título de eleitor;Zona eleitoral;Seção eleitoral',
  'Maria da Silva Souza;82999990001;100000002720;44;3',
  'João Pedro Alves;82988887777;;12;45',
].join('\r\n');
