import { isValidVoterId, normalizeSection, normalizeVoterId, normalizeZone } from '@/lib/utils/documents';
import { isValidPhone, normalizePhone } from '@/lib/utils/phone';

/**
 * Cadastro escrito de uma vez so, como quem manda uma mensagem.
 *
 * Quem cadastra em mutirao nao esta sentado diante de um formulario: esta com
 * o telefone na mao, ouvindo a pessoa falar. Aqui ele escreve do jeito que
 * ouviu — tudo numa linha, em varias, com rotulo ou sem — e os campos se
 * preenchem.
 *
 * SEIS coisas sao reconhecidas, e nenhuma outra:
 *
 *   nome completo, telefone, titulo de eleitor, zona, secao e endereco.
 *
 * CPF, e-mail, genero e vinculo ficam de fora de proposito: o que este
 * modulo nao entende ele devolve intacto em `sobrou`, para a tela dizer o que
 * nao aproveitou. Nada e adivinhado — um numero que nao passa na validacao do
 * titulo nao vira titulo, e um telefone invalido nao vira telefone.
 *
 * Nada aqui fala com servidor nenhum: e leitura de texto, e roda no proprio
 * navegador de quem digitou.
 */

export interface ChatFill {
  name: string | null;
  phone: string | null;
  voterId: string | null;
  zone: string | null;
  section: string | null;
  address: string | null;
  /** Pedacos que o reconhecedor nao soube usar. */
  sobrou: string[];
}

const VAZIO: ChatFill = {
  name: null,
  phone: null,
  voterId: null,
  zone: null,
  section: null,
  address: null,
  sobrou: [],
};

/** Sem acento e em minusculas, para os rotulos casarem escritos de qualquer jeito. */
function chave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Comeco de endereco.
 *
 * Nao e uma lista de tipos de logradouro por capricho: e o que distingue
 * "Rua das Flores 100" de um nome de pessoa — os dois sao palavras soltas, e
 * sem esta pista o endereco viraria nome.
 */
const LOGRADOURO =
  /^(rua|r\.|av|av\.|avenida|travessa|tv\.|praca|pca|alameda|al\.|estrada|rodovia|rod\.|quadra|conjunto|conj|loteamento|sitio|povoado|fazenda|vila|beco|ladeira|largo)\b/;

/** Tem numero de casa, CEP ou "n" de numero: cheira a endereco. */
const TEM_NUMERO_DE_CASA = /\b(n[°ºo]?\.?\s*\d+|\d{1,5})\b/;

/**
 * Os DDDs que existem no Brasil.
 *
 * Servem para UM caso, e ele importa: um CPF tem onze digitos e pode ter a
 * forma exata de um celular — "529.982.247-25" vira 52998224725, que passa
 * em qualquer conferencia generica de telefone. O DDD 52 nao existe, e e so
 * isso que separa os dois.
 *
 * Vale apenas para numero SEM rotulo. Quem escreveu "telefone: ..." disse o
 * que era, e a palavra da pessoa vale mais do que a tabela.
 *
 * Um CPF que comece com DDD de verdade e tenha 9 no terceiro digito continua
 * indistinguivel de um celular — nao ha regra que resolva isso, e por isso o
 * campo preenchido fica a vista para quem cadastrou conferir.
 */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

function temDddDeVerdade(digitos: string): boolean {
  return DDDS.has(Number(digitos.slice(0, 2)));
}

interface Pedaco {
  original: string;
  chave: string;
}

/**
 * Quebra a mensagem em pedacos.
 *
 * Linha, virgula e ponto e virgula separam; o que sobra de cada um e um
 * pedaco. E assim que as pessoas escrevem — "Maria Souza, 82 99999-0000,
 * titulo 1234 5678 9012" —, e cada pedaco vira um campo.
 */
function pedacos(texto: string): Pedaco[] {
  return texto
    .split(/[\n;,]+/)
    .map((parte) => parte.trim())
    .filter((parte) => parte.length > 0)
    .map((parte) => ({ original: parte, chave: chave(parte) }));
}

/** Valor depois de um rotulo escrito: "titulo: 1234", "zona 44". */
function aposRotulo(texto: string, rotulos: string[]): string | null {
  for (const rotulo of rotulos) {
    const achado = new RegExp(`\\b${rotulo}\\b\\s*[:=-]?\\s*(.+)$`).exec(texto);
    if (achado?.[1]?.trim()) return achado[1].trim();
  }
  return null;
}

/** Numero logo depois de um rotulo: "zona 44", "secao: 0003". */
function numeroApos(texto: string, rotulos: string[]): string | null {
  for (const rotulo of rotulos) {
    const achado = new RegExp(`\\b${rotulo}\\b\\s*[:=-]?\\s*(\\d{1,6})\\b`).exec(texto);
    if (achado?.[1]) return achado[1];
  }
  return null;
}

/**
 * Le a mensagem e devolve o que der para aproveitar.
 *
 * A ordem importa: primeiro o que esta ESCRITO com rotulo, que e certeza;
 * depois o que se reconhece pela FORMA (doze digitos validos e um titulo,
 * dez ou onze sao um telefone); e so no fim o que sobrou de texto vira nome
 * ou endereco. Assim um rotulo nunca perde para um palpite.
 */
export function parseChatFill(mensagem: string): ChatFill {
  const texto = (mensagem ?? '').trim();
  if (!texto) return { ...VAZIO };

  const resultado: ChatFill = { ...VAZIO, sobrou: [] };
  const restantes: Pedaco[] = [];

  for (const pedaco of pedacos(texto)) {
    let usado = false;

    // 1. Rotulos escritos. Zona e secao podem vir no MESMO pedaco
    //    ("zona 44 secao 3"), entao as duas sao procuradas antes de qualquer
    //    outra coisa marcar o pedaco como usado.
    const zona = numeroApos(pedaco.chave, ['zona', 'zn']);
    if (zona && !resultado.zone) {
      resultado.zone = normalizeZone(zona);
      usado = true;
    }

    const secao = numeroApos(pedaco.chave, ['secao', 'sessao', 'sec']);
    if (secao && !resultado.section) {
      resultado.section = normalizeSection(secao);
      usado = true;
    }

    const titulo = aposRotulo(pedaco.chave, ['titulo', 'titulo de eleitor', 'tit']);
    if (titulo && !resultado.voterId && isValidVoterId(titulo)) {
      resultado.voterId = normalizeVoterId(titulo);
      usado = true;
    }

    const telefone = aposRotulo(pedaco.chave, ['telefone', 'tel', 'fone', 'whatsapp', 'whats', 'celular', 'zap']);
    if (telefone && !resultado.phone && isValidPhone(telefone)) {
      resultado.phone = normalizePhone(telefone);
      usado = true;
    }

    const nome = aposRotulo(pedaco.original, ['[Nn]ome']);
    if (nome && !resultado.name) {
      resultado.name = limpaNome(nome);
      usado = true;
    }

    const endereco = aposRotulo(pedaco.original, ['[Ee]ndere[çc]o', '[Rr]ua', '[Aa]venida']);
    if (endereco && !resultado.address) {
      // "Rua das Flores 100" perde o rotulo se ele for o proprio logradouro:
      // "Rua" faz parte do endereco, "Endereço:" nao.
      resultado.address = LOGRADOURO.test(pedaco.chave) ? pedaco.original : endereco;
      usado = true;
    }

    if (usado) continue;

    // 2. Sem rotulo: o que a FORMA do numero diz.
    const digitos = pedaco.original.replace(/\D/g, '');
    const soNumero = /^[\d\s.\-/()]+$/.test(pedaco.original);

    if (soNumero && digitos.length === 12 && !resultado.voterId && isValidVoterId(digitos)) {
      resultado.voterId = normalizeVoterId(digitos);
      continue;
    }

    if (
      soNumero &&
      !resultado.phone &&
      isValidPhone(pedaco.original) &&
      temDddDeVerdade(normalizePhone(pedaco.original))
    ) {
      resultado.phone = normalizePhone(pedaco.original);
      continue;
    }

    restantes.push(pedaco);
  }

  // 3. O que sobrou de texto: endereco tem pista (tipo de logradouro ou
  //    numero de casa); o resto, se parecer nome de gente, e o nome.
  for (const pedaco of restantes) {
    if (!resultado.address && (LOGRADOURO.test(pedaco.chave) || temCaraDeEndereco(pedaco))) {
      resultado.address = pedaco.original;
      continue;
    }

    if (!resultado.name && pareceNome(pedaco.original)) {
      resultado.name = limpaNome(pedaco.original);
      continue;
    }

    resultado.sobrou.push(pedaco.original);
  }

  return resultado;
}

/** Texto com letras E numero de casa, sem ser um numero solto. */
function temCaraDeEndereco(pedaco: Pedaco): boolean {
  const temLetra = /[a-z]/.test(pedaco.chave);
  const temNumero = TEM_NUMERO_DE_CASA.test(pedaco.chave);
  return temLetra && temNumero;
}

/**
 * Nome de gente: so letras, e pelo menos duas palavras.
 *
 * Uma palavra so nao basta — "Centro", "Convencional" e meia duzia de
 * pedacos de endereco passariam por nome, e um cadastro com o nome errado e
 * pior do que um cadastro sem nome.
 */
function pareceNome(texto: string): boolean {
  const limpo = texto.trim();
  if (/\d/.test(limpo)) return false;

  const palavras = limpo.split(/\s+/).filter((palavra) => palavra.length > 1);
  return palavras.length >= 2;
}

function limpaNome(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, 120);
}

/** O que foi reconhecido, para a tela dizer em uma linha. */
export function resumoDoPreenchimento(fill: ChatFill): string[] {
  const partes: string[] = [];
  if (fill.name) partes.push('nome');
  if (fill.phone) partes.push('telefone');
  if (fill.voterId) partes.push('título');
  if (fill.zone) partes.push('zona');
  if (fill.section) partes.push('seção');
  if (fill.address) partes.push('endereço');
  return partes;
}
