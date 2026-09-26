import { normalizeSection, normalizeVoterId, normalizeZone } from '@/lib/utils/documents';
import { isUsablePhone, normalizePhone } from '@/lib/utils/phone';

/**
 * Cadastro de muita gente de uma vez, por planilha.
 *
 * Quem recebe uma lista pronta — de um mutirao, de outro sistema, de um
 * caderno digitado — nao vai redigitar noventa pessoas em noventa fichas. A
 * planilha entra, vira uma tabela na tela, e SO E GRAVADA quando quem subiu
 * conferir e mandar cadastrar.
 *
 * SEIS colunas sao lidas, e nenhuma outra:
 *
 *   Nome completo, Telefone, Titulo de eleitor, Zona, Secao e Endereco.
 *
 * O ENDERECO VEM EM UMA COLUNA SO, escrito como as pessoas escrevem:
 *
 *   "Rua Brasil Novo, Nº 269 – Jardim Brasil"
 *   "Aldeia, Fazenda Canto"
 *   "Conjunto Brivaldo Medeiros, QJ Nº 11"
 *
 * A ficha, porem, guarda bairro e rua separados. `separarEndereco` faz essa
 * separacao, e o ESTADO e o MUNICIPIO nao vem da planilha: toda planilha e
 * de Alagoas, do municipio de Palmeira dos Indios. Os dois entram prontos na
 * conferencia, onde podem ser trocados como qualquer outro campo.
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
  /** Bairro e rua, ja separados do texto da coluna Endereco. */
  district: string;
  street: string;
  /** O texto da planilha, como veio. Guardado para quem for conferir. */
  address: string;
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
const COLUNAS: Record<'name' | 'phone' | 'voterId' | 'zone' | 'section' | 'address', string[]> = {
  name: ['nome completo', 'nome', 'nome do integrante', 'integrante'],
  phone: ['telefone', 'celular', 'whatsapp', 'whats', 'fone', 'contato'],
  voterId: ['titulo de eleitor', 'titulo', 'inscricao', 'inscricao eleitoral'],
  zone: ['zona eleitoral', 'zona'],
  section: ['secao eleitoral', 'secao', 'sessao eleitoral', 'sessao'],
  address: ['endereco', 'endereco completo', 'logradouro', 'rua'],
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

/**
 * Telefone da planilha, sem consertar o que nao da para consertar.
 *
 * Numero com digito a mais e comum em lista digitada a mao — "829999493112"
 * tem doze. Cortar o ultimo daria um telefone que PARECE certo e liga para
 * outra pessoa, e ninguem descobriria. Aqui ele volta como veio: fica
 * invalido, aparece destacado na conferencia, e quem subiu decide qual
 * digito sobra.
 *
 * O unico acerto automatico e o codigo do pais, que nao e digito a mais:
 * "5582..." e o mesmo numero escrito para fora do Brasil.
 */
function telefoneDaPlanilha(valor: string | undefined): string {
  const digitos = (valor ?? '').replace(/\D/g, '');
  if (digitos.length > 11 && !digitos.startsWith('55')) return digitos.slice(0, 15);
  return normalizePhone(digitos);
}

function limpo(valor: string | undefined, limite: number): string {
  return (valor ?? '').replace(/\s+/g, ' ').trim().slice(0, limite);
}

/** Toda planilha e de Alagoas, do municipio de Palmeira dos Indios. */
export const UF_PADRAO = 'AL';
export const MUNICIPIO_PADRAO = 'Palmeira dos Índios';

/**
 * Comecos que indicam LOGRADOURO: o texto todo e a rua.
 *
 * "Rua Padre Cícero, Nº 14" e uma rua com numero, e nao uma rua chamada
 * "Rua Padre Cícero" em um bairro chamado "Nº 14" — a virgula ali separa o
 * numero, nao o bairro.
 */
const COMECO_DE_RUA =
  /^(rua|r\.|av|av\.|avenida|travessa|tv\.|praca|praça|pça|alameda|al\.|estrada|rodovia|rod\.|beco|ladeira|largo|via)\b/i;

/**
 * Comecos que indicam LOCALIDADE: o primeiro pedaco e o bairro.
 *
 * "Conjunto Brivaldo Medeiros, QJ Nº 11" e o conjunto (bairro) e a quadra
 * (rua). "Aldeia, Fazenda Canto" e a mesma coisa em zona rural.
 */
const COMECO_DE_BAIRRO =
  /^(aldeia|conjunto|cj|alto|povoado|sitio|sítio|fazenda|loteamento|lot\.|vila|distrito|granja|assentamento|colonia|colônia|quadra|qd)\b/i;

function arrumado(texto: string, limite = 120): string {
  return (texto ?? '').replace(/\s+/g, ' ').trim().slice(0, limite);
}

/**
 * Separa bairro e rua do endereco escrito em uma linha so.
 *
 * Tres formas, na ordem em que sao reconhecidas:
 *
 *   1. com TRAVESSAO — "Rua Brasil Novo, Nº 269 – Jardim Brasil": antes e a
 *      rua, depois e o bairro. E a forma mais explicita, e por isso vem
 *      primeiro. Um "Bairro" escrito no comeco do pedaco sai fora, que e
 *      rotulo e nao nome;
 *   2. comecando por LOCALIDADE — "Alto do Cruzeiro, Rua Santa Isabel, Nº 7":
 *      o primeiro pedaco e o bairro e o resto e a rua, cortando na PRIMEIRA
 *      virgula — senao o numero da casa viraria outro campo;
 *   3. qualquer outra coisa vira RUA inteira. Sem certeza, o texto fica onde
 *      da para ler, e nao repartido no palpite errado.
 */
export function separarEndereco(texto: string): {
  district: string;
  street: string;
  address: string;
} {
  const original = arrumado(texto, 200);
  if (!original) return { district: '', street: '', address: '' };

  // Travessao, meia-risca e hifen cercado de espacos sao o mesmo separador.
  const comTravessao = original.split(/\s+[–—-]\s+/);

  if (comTravessao.length >= 2) {
    const rua = arrumado(comTravessao[0]);
    const bairro = arrumado(comTravessao.slice(1).join(' - ')).replace(/^bairro\s+/i, '');
    return { district: arrumado(bairro), street: rua, address: original };
  }

  if (COMECO_DE_BAIRRO.test(original) && !COMECO_DE_RUA.test(original)) {
    const virgula = original.indexOf(',');
    if (virgula > 0) {
      return {
        district: arrumado(original.slice(0, virgula)),
        street: arrumado(original.slice(virgula + 1)),
        address: original,
      };
    }
    // Localidade sem virgula ("Fazenda Canto") e o bairro inteiro.
    return { district: arrumado(original), street: '', address: original };
  }

  return { district: '', street: arrumado(original), address: original };
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
      phone: telefoneDaPlanilha(valor(bruta, 'phone')),
      voterId: normalizeVoterId(valor(bruta, 'voterId')),
      zone: normalizeZone(valor(bruta, 'zone')),
      section: normalizeSection(valor(bruta, 'section')),
      ...separarEndereco(valor(bruta, 'address')),
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

  // Numero incompleto passa, como no formulario: a planilha vem do mundo
  // real e um digito faltando nao pode custar a pessoa inteira.
  //
  // O que continua sendo recusado e o numero LONGO DEMAIS: a normalizacao
  // corta o que passa de onze digitos, entao "829999493112" viraria um
  // numero que parece certo e liga para outra pessoa. Comparar com a forma
  // normalizada denuncia o corte.
  if (!isUsablePhone(linha.phone) || normalizePhone(linha.phone) !== linha.phone) {
    problemas.push('telefone');
  }

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
  'Nome completo;Telefone;Título de eleitor;Zona eleitoral;Seção eleitoral;Endereço',
  'Maria da Silva Souza;82999990001;100000002720;10;147;Rua Brasil Novo, Nº 269 – Jardim Brasil',
  'João Pedro Alves;82988887777;;10;146;Conjunto Brivaldo Medeiros, QJ Nº 11',
  'Ana Beatriz Lima;82996013641;;10;326;Aldeia, Fazenda Canto',
].join('\r\n');
