/**
 * Boletim de urna (BU) do TSE, decodificado.
 *
 * O arquivo `.bu` que o TSE publica em resultados.tse.jus.br, secao por
 * secao, durante a apuracao, e binario: ASN.1 em DER, no desenho do
 * `bu.asn1` que o proprio TSE divulga (modulo com IMPLICIT TAGS). Nada aqui
 * depende de biblioteca: o DER e lido a mao, e so o que importa e extraido —
 * a secao e os votos de cada cargo.
 *
 * A leitura e POSICIONAL nos pontos que nao mudaram entre as versoes do
 * formato (2022, 2024, 2026) e por FORMA nos que mudaram: a lista de
 * resultados e achada pelo desenho dos itens, e dentro de cada eleicao a
 * lista de cargos e a primeira SEQUENCE. Assim um campo novo no meio do
 * caminho nao desloca a leitura.
 */

interface No {
  /** Classe: 0 universal, 1 aplicacao, 2 contexto, 3 privada. */
  classe: number;
  construido: boolean;
  tag: number;
  filhos?: No[];
  valor?: Uint8Array;
}

export class BoletimIlegivel extends Error {}

function lerDer(b: Uint8Array, inicio: number, fim: number): No[] {
  const nos: No[] = [];
  let i = inicio;
  while (i < fim) {
    const t = b[i++];
    let tag = t & 0x1f;
    if (tag === 0x1f) {
      tag = 0;
      let x: number;
      do {
        x = b[i++];
        tag = tag * 128 + (x & 0x7f);
      } while (x & 0x80);
    }
    let tam = b[i++];
    if (tam & 0x80) {
      const n = tam & 0x7f;
      tam = 0;
      for (let j = 0; j < n; j += 1) tam = tam * 256 + b[i++];
    }
    if (i + tam > fim) throw new BoletimIlegivel('Boletim de urna truncado.');
    const no: No = { classe: t >> 6, construido: Boolean(t & 0x20), tag };
    if (no.construido) no.filhos = lerDer(b, i, i + tam);
    else no.valor = b.subarray(i, i + tam);
    nos.push(no);
    i += tam;
  }
  return nos;
}

const UNIVERSAL = 0;
const CONTEXTO = 2;
const INTEIRO = 2;
const OCTETOS = 4;
const SEQUENCIA = 16;

function inteiro(no: No | undefined): number {
  if (!no?.valor) throw new BoletimIlegivel('Campo numérico ausente no boletim.');
  let v = 0;
  for (const x of no.valor) v = v * 256 + x;
  if (no.valor.length && no.valor[0] & 0x80) v -= 256 ** no.valor.length;
  return v;
}

const ehSequencia = (no: No) => no.classe === UNIVERSAL && no.construido && no.tag === SEQUENCIA;
const ehInteiro = (no: No) => no.classe === UNIVERSAL && !no.construido && no.tag === INTEIRO;
const filhos = (no: No | undefined) => {
  if (!no?.filhos) throw new BoletimIlegivel('Estrutura inesperada no boletim.');
  return no.filhos;
};

/** Tipo do voto no BU: 1 nominal, 2 branco, 3 nulo, 4 legenda, 5 cargo sem candidato. */
export type TipoNoBoletim = 1 | 2 | 3 | 4 | 5;

export interface VotoNoBoletim {
  tipo: TipoNoBoletim;
  quantidade: number;
  /** Ausentes no branco e no nulo. */
  partido: number | null;
  codigo: number | null;
}

export interface CargoNoBoletim {
  /** Codigo do cargo constitucional: 1 Presidente, 3 Governador, 5 Senador, 6 Dep. Federal, 7 Dep. Estadual... */
  cargo: number;
  comparecimento: number;
  votos: VotoNoBoletim[];
}

export interface BoletimDeUrna {
  municipio: number;
  zona: number;
  /** Numero do local de votacao. */
  local: number;
  secao: number;
  eleicoes: { id: number; aptos: number | null; cargos: CargoNoBoletim[] }[];
}

export function lerBoletimDeUrna(arquivo: Uint8Array): BoletimDeUrna {
  try {
    // O envelope guarda o boletim, cifrado ou nao, no ultimo OCTET STRING.
    const envelope = filhos(lerDer(arquivo, 0, arquivo.length)[0]);
    const conteudo = [...envelope].reverse().find((n) => n.classe === UNIVERSAL && !n.construido && n.tag === OCTETOS);
    if (!conteudo?.valor) throw new BoletimIlegivel('Envelope do boletim sem conteúdo.');
    const bu = filhos(lerDer(conteudo.valor, 0, conteudo.valor.length)[0]);

    // cabecalho, fase, urna, identificacaoSecao, dataHoraEmissao, dadosSecaoSA, comparecimento...
    const secao = filhos(bu[3]);
    const municipioZona = filhos(secao[0]);
    const boletim: BoletimDeUrna = {
      municipio: inteiro(municipioZona[0]),
      zona: inteiro(municipioZona[1]),
      local: inteiro(secao[1]),
      secao: inteiro(secao[2]),
      eleicoes: [],
    };

    // A lista de resultados por eleicao: em 2022 vinha marcada [3]; de 2024
    // em diante e uma SEQUENCE comum. Achada pela forma — cada item e uma
    // SEQUENCE que comeca pelo id da eleicao e traz a lista de cargos.
    const resultados = bu
      .slice(5)
      .find(
        (n) =>
          n.construido &&
          Boolean(n.filhos?.length) &&
          n.filhos!.every((f) => ehSequencia(f) && f.filhos?.[0] !== undefined && ehInteiro(f.filhos[0]) && f.filhos.some(ehSequencia)),
      );
    for (const eleicao of filhos(resultados)) {
      const campos = filhos(eleicao);
      const inteiros = campos.filter(ehInteiro);
      const cargos: CargoNoBoletim[] = [];
      for (const resultado of filhos(campos.find(ehSequencia))) {
        const r = filhos(resultado);
        const comparecimento = inteiro(r[1]);
        for (const total of filhos(r[2])) {
          const t = filhos(total);
          // CHOICE com tag implicita: [1] cargo constitucional, [2] consulta livre.
          const codigo = t[0].construido ? filhos(t[0])[0] : t[0];
          const votos = filhos(t.find(ehSequencia)).map((v) => {
            const porTag = new Map(filhos(v).filter((x) => x.classe === CONTEXTO).map((x) => [x.tag, x]));
            const id = porTag.get(3);
            const [partido, numero] = id ? filhos(id).map(inteiro) : [null, null];
            return {
              tipo: inteiro(porTag.get(1)) as TipoNoBoletim,
              quantidade: inteiro(porTag.get(2)),
              partido: partido ?? null,
              codigo: numero ?? null,
            };
          });
          cargos.push({ cargo: inteiro(codigo), comparecimento, votos });
        }
      }
      boletim.eleicoes.push({ id: inteiro(inteiros[0]), aptos: inteiros[1] ? inteiro(inteiros[1]) : null, cargos });
    }
    return boletim;
  } catch (e) {
    if (e instanceof BoletimIlegivel) throw e;
    throw new BoletimIlegivel('Não foi possível ler o boletim de urna.');
  }
}

/**
 * Os votos do boletim no formato guardado: "cargo:numero" -> quantidade.
 *
 * O numero segue a planilha do TSE: o do candidato no voto nominal, o do
 * partido na legenda, 95 no branco e 96 no nulo. "Cargo sem candidato" nao
 * e voto em ninguem e fica de fora.
 */
export function votosDoBoletim(boletim: BoletimDeUrna): Record<string, number> {
  const votos: Record<string, number> = {};
  for (const eleicao of boletim.eleicoes) {
    for (const { cargo, votos: lista } of eleicao.cargos) {
      for (const v of lista) {
        const numero =
          v.tipo === 2 ? '95' : v.tipo === 3 ? '96' : v.tipo === 1 || v.tipo === 4 ? String(v.codigo ?? v.partido ?? '') : '';
        if (!numero || v.quantidade <= 0) continue;
        const chave = `${cargo}:${numero}`;
        votos[chave] = (votos[chave] ?? 0) + v.quantidade;
      }
    }
  }
  return votos;
}

/** Comparecimento da secao: o maior entre os cargos (todos votam em todos). */
export function comparecimentoDoBoletim(boletim: BoletimDeUrna): number {
  return Math.max(0, ...boletim.eleicoes.flatMap((e) => e.cargos.map((c) => c.comparecimento)));
}
