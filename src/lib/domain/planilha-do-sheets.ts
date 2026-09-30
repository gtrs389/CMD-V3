import { normalizeSection, normalizeVoterId, normalizeZone } from '@/lib/utils/documents';
import { lerVerificadoPorFoto, REFERENCIA_MAX, telefoneDaPlanilha, type VerificadoPorFoto } from './csv-import';

/**
 * Planilha do Google Sheets do time duplicado: a regra, sem rede e sem banco.
 *
 * CADA ABA E UM LIDER. O nome da aba e comparado com os Lideres do time sem
 * diferenca de maiuscula, acento ou espaco a mais: "FELIX SILVA TARGINO" na
 * aba e "Félix Silva Targino" no sistema sao a mesma pessoa.
 *
 * Aba que nao bate com ninguem ainda pode bater pela coluna LIDER, que traz
 * o nome completo ("ADALBERTO" na aba, "Adalberto Souza Lima" na coluna).
 * Se nem assim, o Lider e NOVO — com o nome completo da coluna LIDER, ou o
 * da aba quando a coluna vier vazia.
 *
 * As colunas vem nesta ordem: NOME, TITULO, ZONA, SECAO, TELEFONE, LIDER,
 * REFERENCIA, VERIFICADO POR FOTO. Com cabecalho, a leitura vai pelo nome da
 * coluna — trocar a ordem nao quebra nada; sem cabecalho, vai pela ordem.
 */

export const COLUNAS_DO_SHEETS = [
  'NOME',
  'TITULO',
  'ZONA',
  'SEÇÃO',
  'TELEFONE',
  'LÍDER',
  'REFERÊNCIA',
  'VERIFICADO POR FOTO',
] as const;

type Campo =
  | 'name'
  | 'voterId'
  | 'zone'
  | 'section'
  | 'phone'
  | 'leader'
  | 'reference'
  | 'photoVerified';

/** Posicao de cada coluna quando a planilha nao tem cabecalho. */
const ORDEM: Campo[] = ['name', 'voterId', 'zone', 'section', 'phone', 'leader', 'reference', 'photoVerified'];

const CABECALHOS: Record<Campo, string[]> = {
  name: ['nome', 'nome completo'],
  voterId: ['titulo', 'titulo de eleitor'],
  zone: ['zona', 'zona eleitoral'],
  section: ['secao', 'sessao', 'secao eleitoral'],
  phone: ['telefone', 'celular', 'whatsapp'],
  leader: ['lider', 'nome do lider'],
  reference: ['referencia', 'ponto de referencia'],
  photoVerified: ['verificado por foto', 'verificado foto'],
};

/** Sem acento, minusculo, um espaco so: e assim que dois nomes sao comparados. */
export function chaveDoNome(texto: string): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function limpo(texto: string | undefined, limite: number): string {
  return (texto ?? '').replace(/\s+/g, ' ').trim().slice(0, limite);
}

/**
 * Tira o id do endereco da planilha. Aceita o link copiado do navegador,
 * com `/edit`, `#gid=` ou `?usp=sharing` no fim. Qualquer outro endereco e
 * recusado: o servidor so baixa de docs.google.com, nunca de um endereco
 * que veio do navegador.
 */
export function idDaPlanilha(endereco: string): string | null {
  const texto = (endereco ?? '').trim();
  const achado = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{10,})/.exec(texto);
  return achado ? achado[1] : null;
}

/** O endereco guardado: so o essencial, sem aba nem parametro. */
export function enderecoLimpo(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}`;
}

export interface PessoaDaAba {
  name: string;
  phone: string;
  voterId: string;
  zone: string;
  section: string;
  reference: string;
  photoVerified: VerificadoPorFoto;
}

export interface AbaLida {
  titulo: string;
  /** Nome completo da coluna LIDER, o que mais aparece na aba. Vazio: nao veio. */
  lider: string;
  pessoas: PessoaDaAba[];
  /** Linhas com algo escrito, mas sem nome de gente. */
  ignoradas: number;
}

/** Uma aba bruta (linhas de texto) vira Lider + pessoas. */
export function lerAbaDoSheets(titulo: string, linhas: string[][]): AbaLida {
  // Cabecalho: a primeira linha, entre as cinco primeiras, que tenha "NOME".
  let inicio = 0;
  let indices: Record<Campo, number> = Object.fromEntries(ORDEM.map((campo, i) => [campo, i])) as Record<
    Campo,
    number
  >;

  for (let i = 0; i < Math.min(5, linhas.length); i += 1) {
    const chaves = (linhas[i] ?? []).map(chaveDoNome);
    if (!chaves.includes('nome') && !chaves.includes('nome completo')) continue;

    const achados = { ...indices };
    for (const campo of ORDEM) {
      const posicao = chaves.findIndex((chave) => CABECALHOS[campo].includes(chave));
      if (posicao !== -1) achados[campo] = posicao;
    }
    indices = achados;
    inicio = i + 1;
    break;
  }

  const pessoas: PessoaDaAba[] = [];
  const lideres = new Map<string, { nome: string; vezes: number }>();
  let ignoradas = 0;

  for (const linha of linhas.slice(inicio)) {
    const celula = (campo: Campo) => linha?.[indices[campo]] ?? '';
    if (!linha || linha.every((valor) => !(valor ?? '').trim())) continue;

    const lider = limpo(celula('leader'), 120);
    if (lider) {
      const chave = chaveDoNome(lider);
      const atual = lideres.get(chave) ?? { nome: lider, vezes: 0 };
      atual.vezes += 1;
      lideres.set(chave, atual);
    }

    const name = limpo(celula('name'), 120);
    if (name.length < 2) {
      ignoradas += 1;
      continue;
    }

    pessoas.push({
      name,
      phone: telefoneDaPlanilha(celula('phone')),
      voterId: normalizeVoterId(celula('voterId')),
      zone: normalizeZone(celula('zone')),
      section: normalizeSection(celula('section')),
      reference: limpo(celula('reference'), REFERENCIA_MAX),
      photoVerified: lerVerificadoPorFoto(celula('photoVerified')),
    });
  }

  const maisComum = [...lideres.values()].sort((a, b) => b.vezes - a.vezes)[0]?.nome ?? '';
  return { titulo: limpo(titulo, 120), lider: maisComum, pessoas, ignoradas };
}

/* -------------------------------------------------------------------------
   Quem e quem
   ------------------------------------------------------------------------- */

export interface LiderDoTime {
  memberId: string;
  name: string;
}

export type LiderDaAba =
  | { tipo: 'existente'; memberId: string; name: string }
  | { tipo: 'novo'; name: string };

export interface GrupoDoLider {
  lider: LiderDaAba;
  /** Abas que caíram neste Lider (normalmente uma). */
  abas: string[];
  pessoas: PessoaDaAba[];
  /**
   * A linha do PROPRIO Lider na aba dele, quando existe. Nao vira Equipe
   * dele mesmo — vira os dados dele: corrigir o Lider na planilha corrige o
   * Lider na tela.
   */
  linhaDoLider?: PessoaDaAba;
}

export interface PlanoDaPlanilha {
  grupos: GrupoDoLider[];
  abasIgnoradas: { aba: string; motivo: string }[];
  linhasIgnoradas: number;
}

/**
 * Decide o Lider de cada aba e junta as pessoas.
 *
 * Duas abas do mesmo Lider viram um grupo so. A linha em que o proprio
 * Lider aparece na aba dele nao vira Equipe dele mesmo: vira os dados dele.
 */
export function planejarPlanilha(abas: AbaLida[], lideres: LiderDoTime[]): PlanoDaPlanilha {
  const porChave = new Map<string, LiderDoTime>();
  for (const lider of lideres) {
    const chave = chaveDoNome(lider.name);
    if (chave && !porChave.has(chave)) porChave.set(chave, lider);
  }

  const grupos = new Map<string, GrupoDoLider>();
  const abasIgnoradas: PlanoDaPlanilha['abasIgnoradas'] = [];
  let linhasIgnoradas = 0;

  for (const aba of abas) {
    linhasIgnoradas += aba.ignoradas;

    const existente = porChave.get(chaveDoNome(aba.titulo)) ?? porChave.get(chaveDoNome(aba.lider));
    const nomeNovo = aba.lider || aba.titulo;

    if (!existente && aba.pessoas.length === 0) {
      abasIgnoradas.push({
        aba: aba.titulo || '(sem nome)',
        motivo: 'aba vazia e sem Líder com esse nome no time',
      });
      continue;
    }
    if (!existente && chaveDoNome(nomeNovo).length < 2) {
      abasIgnoradas.push({ aba: aba.titulo || '(sem nome)', motivo: 'aba sem nome de Líder' });
      linhasIgnoradas += aba.pessoas.length;
      continue;
    }

    const lider: LiderDaAba = existente
      ? { tipo: 'existente', memberId: existente.memberId, name: existente.name }
      : { tipo: 'novo', name: nomeNovo };
    const chaveDoGrupo = lider.tipo === 'existente' ? `m:${lider.memberId}` : `n:${chaveDoNome(lider.name)}`;

    const grupo = grupos.get(chaveDoGrupo) ?? { lider, abas: [], pessoas: [] };
    grupo.abas.push(aba.titulo);

    const chaveDoLider = chaveDoNome(lider.name);
    for (const pessoa of aba.pessoas) {
      if (chaveDoNome(pessoa.name) === chaveDoLider) {
        grupo.linhaDoLider ??= pessoa;
        continue;
      }
      grupo.pessoas.push(pessoa);
    }
    grupos.set(chaveDoGrupo, grupo);
  }

  return { grupos: [...grupos.values()], abasIgnoradas, linhasIgnoradas };
}

/** O que a tela mostra da ultima leitura. */
export interface RelatorioDaPlanilha {
  ok: boolean;
  erro?: string;
  em: string;
  abas: number;
  lideresEncontrados: string[];
  lideresCriados: string[];
  pessoas: number;
  abasIgnoradas: { aba: string; motivo: string }[];
  linhasIgnoradas: number;
}
