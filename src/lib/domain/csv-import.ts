import { normalizeSection, normalizeVoterId, normalizeZone } from '@/lib/utils/documents';
import { normalizePhone } from '@/lib/utils/phone';
import { dadosParaConferir } from './conferencia';

/**
 * Cadastro de muita gente de uma vez, por planilha.
 *
 * Quem recebe uma lista pronta — de um mutirao, de outro sistema, de um
 * caderno digitado — nao vai redigitar noventa pessoas em noventa fichas. A
 * planilha entra, vira uma tabela na tela, e SO E GRAVADA quando quem subiu
 * conferir e mandar cadastrar.
 *
 * SETE colunas sao lidas, e nenhuma outra:
 *
 *   Nome, Telefone, Titulo, Zona, Secao, Bairro e Rua.
 *
 * O ESTADO e o MUNICIPIO nao vem da planilha: sao fixos, Alagoas e Palmeira
 * dos Indios (`ENDERECO_FIXO`). Entram prontos na conferencia, travados.
 *
 * A planilha ANTIGA, com o endereco inteiro em uma coluna "Endereco", ainda
 * e aceita: sem as colunas Bairro e Rua, o texto e separado nos dois por
 * `separarEndereco`, como antes.
 *
 * NADA DISSO IMPEDE A PESSOA DE ENTRAR. Coluna vazia — ou coluna que nem
 * existe na planilha — vira falta: a pessoa entra e a ficha nasce com a
 * etiqueta de incompleta (`member-completeness.ts`).
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
  /** Bairro e rua: das colunas proprias, ou separados da coluna Endereco. */
  district: string;
  street: string;
  /** A coluna Endereco da planilha antiga, como veio. Vazio na nova. */
  address: string;
  /** Coluna "VERIFICADO POR FOTO": 'SIM', 'NÃO' ou vazio (nao informado). */
  photoVerified: VerificadoPorFoto;
}

export type VerificadoPorFoto = 'SIM' | 'NÃO' | '';

/**
 * "VERIFICADO POR FOTO" como veio escrito: SIM, Sim, S, X, NÃO, Nao, N...
 * Qualquer outra coisa conta como nao informado — nunca como um SIM.
 */
export function lerVerificadoPorFoto(texto: string): VerificadoPorFoto {
  const valor = chave(texto);
  if (['sim', 's', 'x', 'yes', 'y', 'verdadeiro', 'true', '1'].includes(valor)) return 'SIM';
  if (['nao', 'n', 'no', 'falso', 'false', '0'].includes(valor)) return 'NÃO';
  return '';
}

/** O valor que vai para o banco: SIM = true, NÃO = false, vazio = nulo. */
export function verificadoPorFotoParaGravar(valor: VerificadoPorFoto | string): boolean | null {
  if (valor === 'SIM') return true;
  if (valor === 'NÃO') return false;
  return null;
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

/**
 * Nomes aceitos para cada coluna, do mais explicito ao mais curto.
 *
 * `address` e a coluna unica da planilha antiga. So e procurada quando a
 * planilha nao tem nem Bairro nem Rua: com as colunas proprias, um
 * "Endereco" a mais e so mais uma coluna ignorada.
 */
const COLUNAS: Record<
  | 'name'
  | 'phone'
  | 'voterId'
  | 'zone'
  | 'section'
  | 'district'
  | 'street'
  | 'address'
  | 'photoVerified',
  string[]
> = {
  name: ['nome completo', 'nome', 'nome do integrante', 'integrante'],
  phone: ['telefone', 'celular', 'whatsapp', 'whats', 'fone', 'contato'],
  voterId: ['titulo de eleitor', 'titulo', 'inscricao', 'inscricao eleitoral'],
  zone: ['zona eleitoral', 'zona'],
  section: ['secao eleitoral', 'secao', 'sessao eleitoral', 'sessao'],
  district: ['bairro', 'localidade', 'comunidade'],
  street: ['rua', 'logradouro', 'avenida'],
  address: ['endereco', 'endereco completo'],
  photoVerified: ['verificado por foto', 'verificado foto', 'verificacao por foto'],
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

/**
 * Estado e municipio de toda pessoa que entra por planilha.
 *
 * Fixos: a operacao e de Alagoas, do municipio de Palmeira dos Indios. A
 * planilha nem tem essas colunas, e a conferencia os mostra travados. O
 * municipio vai escrito como na lista oficial, com acento: e por ele, junto
 * da UF, que a lista de bairros e buscada.
 */
export const ENDERECO_FIXO = { state: 'AL', city: 'Palmeira dos Índios' } as const;

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
    // A coluna unica de endereco e da planilha antiga: com Bairro ou Rua
    // proprios, ela nao entra.
    if (campo === 'address' && (indices.district !== undefined || indices.street !== undefined)) {
      continue;
    }
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
      ...(indices.address !== undefined
        ? separarEndereco(valor(bruta, 'address'))
        : {
            district: limpo(valor(bruta, 'district'), 120),
            street: limpo(valor(bruta, 'street'), 120),
            address: '',
          }),
      photoVerified: lerVerificadoPorFoto(valor(bruta, 'photoVerified')),
    });
  }

  return { linhas, ignoradas, vazias };
}

/**
 * O que IMPEDE esta linha de ser cadastrada.
 *
 * So o NOME. O banco exige, e sem nome ninguem sabe quem e a pessoa: uma
 * ficha anonima nao e um cadastro incompleto, e um cadastro que nao serve
 * para nada.
 *
 * Todo o resto entra. Dado faltando vira a etiqueta "Incompleto"
 * (`faltasDaLinha`); dado preenchido errado — CPF que nao fecha, titulo com
 * digito a menos, telefone com digito A MAIS — vira a etiqueta "Conferir"
 * (`conferirDaLinha`). O telefone longo, que antes barrava, agora entra
 * INTEIRO: cortar o digito extra daria um numero que parece certo e liga
 * para outra pessoa; guardado como veio, ele fica marcado e quem confere
 * decide qual digito sobra.
 */
export function problemasDaLinha(linha: LinhaImportada): string[] {
  return linha.name.trim().length < 2 ? ['nome'] : [];
}

/** O que esta preenchido mas precisa ser conferido — sem impedir nada. */
export function conferirDaLinha(linha: LinhaImportada): string[] {
  return dadosParaConferir(linha);
}

/**
 * O que FALTA nesta linha — sem impedir nada.
 *
 * Mesma pergunta que a ficha responde depois de gravada, feita antes: quem
 * confere a planilha ve, linha a linha, o que vai entrar pela metade, e
 * decide se completa ali ou se deixa para depois.
 *
 * O telefone entra na conta quando esta vazio E quando esta curto demais
 * para ser um telefone: nos dois casos ele nao identifica ninguem, e a
 * pessoa vai ficar sem acesso ate alguem corrigir.
 */
export function faltasDaLinha(linha: LinhaImportada): string[] {
  const faltas: string[] = [];

  // Telefone pela metade nao e falta: e dado para conferir.
  if (!linha.phone.trim()) faltas.push('telefone');
  if (!linha.voterId.trim()) faltas.push('título de eleitor');
  if (!linha.zone.trim()) faltas.push('zona');
  if (!linha.section.trim()) faltas.push('seção');
  // Um por um, como a etiqueta da ficha conta depois de gravada.
  if (!linha.district.trim()) faltas.push('bairro');
  if (!linha.street.trim()) faltas.push('rua');

  return faltas;
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
  'Nome;Telefone;Título;Zona;Seção;Bairro;Rua;VERIFICADO POR FOTO',
  'Maria da Silva Souza;82999990001;100000002720;10;147;Jardim Brasil;Rua Brasil Novo, Nº 269;SIM',
  'João Pedro Alves;82988887777;;10;146;Conjunto Brivaldo Medeiros;QJ Nº 11;NÃO',
  'Ana Beatriz Lima;82996013641;;10;326;Aldeia;Fazenda Canto;SIM',
].join('\r\n');
