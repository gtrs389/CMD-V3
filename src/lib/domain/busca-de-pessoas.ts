import type { Member } from '@/lib/types';
import { normalizeSearch } from '@/lib/utils/text';
import { recruiterText } from './recruitment';
import { tagDaPessoa } from './tag-do-lider';

/**
 * A busca da lista do time: uma caixa so, que acha por qualquer dado.
 *
 * Nome, telefone, CPF, titulo, bairro, rua, municipio, zona/secao, quem
 * cadastrou e a tag do Lider. Numero e comparado SO PELOS DIGITOS — "529.982.247-25",
 * "52998224725" e "529982" acham a mesma pessoa, com ou sem mascara.
 *
 * Varias palavras se somam: "maria centro" e a Maria que mora no Centro, e
 * nao todas as Marias mais todo o Centro. Cada palavra precisa bater em
 * ALGUM campo da pessoa.
 *
 * Devolve tambem ONDE achou: a lista mostra "achado no CPF" quando o nome
 * nao explica por que a pessoa apareceu.
 */

export type CampoDaBusca =
  | 'nome'
  | 'telefone'
  | 'CPF'
  | 'título'
  | 'bairro'
  | 'rua'
  | 'município'
  | 'zona/seção'
  | 'responsável'
  | 'tag'
  | 'e-mail';

export interface ResultadoDaBusca {
  achou: boolean;
  /** Campos em que o termo bateu, sem repetir, na ordem acima. */
  campos: CampoDaBusca[];
}

const ORDEM: CampoDaBusca[] = [
  'nome',
  'telefone',
  'CPF',
  'título',
  'bairro',
  'rua',
  'município',
  'zona/seção',
  'responsável',
  'tag',
  'e-mail',
];

const soDigitos = (valor: string | null | undefined) => (valor ?? '').replace(/\D/g, '');

/** As palavras da busca, ja sem acento e sem caixa. */
export function palavrasDaBusca(termo: string): string[] {
  // Numero escrito com mascara e espaco — "(82) 99987-1807", "529 982 247"
  // — e UM numero, e nao varias palavras. Com "/" fica como veio: e zona/secao.
  if (/^[\d\s().-]+$/.test(termo.trim()) && /\d/.test(termo)) {
    return [termo.replace(/\D/g, '')];
  }
  return normalizeSearch(termo)
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function buscarPessoa(member: Member, termo: string): ResultadoDaBusca {
  const palavras = palavrasDaBusca(termo);
  if (palavras.length === 0) return { achou: true, campos: [] };

  const textos: [CampoDaBusca, string][] = [
    ['nome', normalizeSearch(member.name)],
    ['bairro', normalizeSearch(member.district)],
    ['rua', normalizeSearch(member.street)],
    ['município', normalizeSearch(member.city)],
    ['responsável', normalizeSearch(recruiterText(member.recruitedBy))],
    // A tag do Lider acha o Lider e a Equipe inteira dele.
    ['tag', normalizeSearch(tagDaPessoa(member))],
    ['e-mail', normalizeSearch(member.email)],
  ];
  const numeros: [CampoDaBusca, string][] = [
    ['telefone', soDigitos(member.phone)],
    ['CPF', soDigitos(member.cpf)],
    ['título', soDigitos(member.voterId)],
  ];
  const zona = soDigitos(member.zone);
  const secao = soDigitos(member.section);

  const campos = new Set<CampoDaBusca>();

  for (const palavra of palavras) {
    let bateu = false;
    const digitos = soDigitos(palavra);
    const eNumero = digitos.length > 0 && digitos.length === palavra.replace(/[.\-/()]/g, '').length;

    if (eNumero) {
      // Numero curto (1 ou 2 digitos) so vale para zona e secao: "10" nao
      // deveria achar todo telefone que tem um 10 no meio.
      if (digitos.length >= 3) {
        for (const [campo, valor] of numeros) {
          if (valor && valor.includes(digitos)) {
            campos.add(campo);
            bateu = true;
          }
        }
      }
      // "10/147" (zona/secao) ou so a secao ou a zona, por inteiro.
      const [z, s] = palavra.split('/').map(soDigitos);
      if (s !== undefined ? z === zona && s === secao : digitos === zona || digitos === secao) {
        campos.add('zona/seção');
        bateu = true;
      }
    }

    for (const [campo, valor] of textos) {
      if (valor && valor.includes(palavra)) {
        campos.add(campo);
        bateu = true;
      }
    }

    if (!bateu) return { achou: false, campos: [] };
  }

  return { achou: true, campos: ORDEM.filter((c) => campos.has(c)) };
}
