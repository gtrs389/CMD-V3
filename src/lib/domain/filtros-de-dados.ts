import type { Member } from '@/lib/types';
import { digitosDoTelefone, normalizePhone } from '@/lib/utils/phone';
import { problemaDoCpf, problemaDoTelefone, problemaDoTitulo } from './conferencia';
import type { GrupoRepetido } from './inconsistencias';

/**
 * Filtros por DADO do quadro de inconsistencias.
 *
 * Responde a pergunta "quem esta assim?": sem CPF, com CPF incompleto, com
 * titulo que nao confere... Marcar varios filtros SOMA as listas (quem tem
 * qualquer um dos problemas marcados), e cada pessoa vem com o motivo de
 * cada filtro em que caiu — e isso que vai para o PDF.
 *
 * As regras sao as MESMAS da etiqueta "Conferir" e da "Incompleto": um
 * filtro que discordasse da ficha mostraria uma pessoa que a ficha diz estar
 * em ordem.
 */

export interface FiltroDeDado {
  id: string;
  rotulo: string;
  grupo: 'CPF' | 'Título' | 'Telefone' | 'Endereço e votação' | 'Cadastro';
  /** Motivo, em uma linha, quando a pessoa cai no filtro; nulo quando nao. */
  motivo: (member: Member, contexto: ContextoDosFiltros) => string | null;
}

export interface ContextoDosFiltros {
  /** Quem esta em algum grupo de cadastro repetido (certo ou provavel). */
  repetidos: ReadonlySet<string>;
  /**
   * Em quantas fichas do time aparece o telefone de cada pessoa — so para
   * quem divide o numero com pelo menos mais uma ficha.
   *
   * Contado pelos NUMEROS, e nao pelo estado do acesso: o acesso so diz
   * "telefone repetido" em um caso estreito (quem entrou depois, sem
   * usuario), e o filtro chegava a mostrar zero com o time cheio de numero
   * repetido.
   */
  telefones: ReadonlyMap<string, number>;
}

/** Quem divide o telefone com outra ficha do time, e com quantas no total. */
export function fichasPorTelefone(members: readonly Member[]): Map<string, number> {
  const porNumero = new Map<string, string[]>();
  for (const member of members) {
    const numero = normalizePhone(member.phone ?? '');
    if (numero.length < 10) continue;
    porNumero.set(numero, [...(porNumero.get(numero) ?? []), member.id]);
  }
  const resultado = new Map<string, number>();
  for (const ids of porNumero.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) resultado.set(id, ids.length);
  }
  return resultado;
}

/**
 * O contexto dos filtros, montado do time INTEIRO — mesmo quando a tela
 * esta recortada por um responsavel: o numero de um Lider pode estar
 * repetido justamente na ficha de outro.
 */
export function contextoDosFiltros(
  members: readonly Member[],
  repetidos: readonly GrupoRepetido[],
): ContextoDosFiltros {
  return {
    repetidos: new Set(
      repetidos
        .filter((grupo) => grupo.certeza !== 'possivel')
        .flatMap((grupo) => grupo.registros.map((r) => r.member.id)),
    ),
    telefones: fichasPorTelefone(members),
  };
}

const vazio = (valor: string | null | undefined) => !valor || !valor.trim();
const digitos = (valor: string | null | undefined) => (valor ?? '').replace(/\D/g, '');

export const FILTROS_DE_DADOS: readonly FiltroDeDado[] = [
  // Nao ha filtro "Sem CPF": CPF nao e obrigatorio, e a lista so enchia de
  // gente em ordem. Os filtros de CPF olham o CPF PREENCHIDO errado.
  {
    id: 'cpf-incompleto',
    grupo: 'CPF',
    rotulo: 'CPF incompleto',
    motivo: (m) => (digitos(m.cpf) && digitos(m.cpf).length !== 11 ? problemaDoCpf(m.cpf) : null),
  },
  {
    id: 'cpf-errado',
    grupo: 'CPF',
    rotulo: 'CPF que não confere',
    motivo: (m) => (problemaDoCpf(m.cpf) === 'CPF não confere' ? 'CPF não confere' : null),
  },
  {
    id: 'sem-titulo',
    grupo: 'Título',
    rotulo: 'Sem título',
    motivo: (m) => (vazio(m.voterId) ? 'sem título' : null),
  },
  {
    id: 'titulo-incompleto',
    grupo: 'Título',
    rotulo: 'Título incompleto',
    motivo: (m) =>
      digitos(m.voterId) && digitos(m.voterId).length !== 12 ? problemaDoTitulo(m.voterId) : null,
  },
  {
    id: 'titulo-errado',
    grupo: 'Título',
    rotulo: 'Título que não confere',
    motivo: (m) => (problemaDoTitulo(m.voterId) === 'título não confere' ? 'título não confere' : null),
  },
  {
    id: 'sem-telefone',
    grupo: 'Telefone',
    rotulo: 'Sem telefone',
    motivo: (m) => (vazio(m.phone) ? 'sem telefone' : null),
  },
  {
    // Faltando digito: o numero que nao pode faltar. Separado do "nao
    // confere", como no CPF e no titulo — sao correcoes diferentes.
    id: 'telefone-incompleto',
    grupo: 'Telefone',
    rotulo: 'Telefone incompleto',
    motivo: (m) => {
      const n = digitosDoTelefone(m.phone ?? '').length;
      if (n === 0 || n >= 10) return null;
      return `telefone com ${n === 1 ? '1 dígito' : `${n} dígitos`}`;
    },
  },
  {
    // Tem digitos de sobra, DDD que nao existe, celular sem o 9...
    id: 'telefone-errado',
    grupo: 'Telefone',
    rotulo: 'Telefone que não confere',
    motivo: (m) => {
      const n = digitosDoTelefone(m.phone ?? '').length;
      if (n < 10) return null;
      const problema = problemaDoTelefone(m.phone);
      return problema ? (n > 11 ? `telefone com ${n} dígitos` : 'telefone não confere') : null;
    },
  },
  {
    id: 'telefone-repetido',
    grupo: 'Telefone',
    rotulo: 'Telefone compartilhado',
    motivo: (m, c) => {
      const fichas = c.telefones.get(m.id);
      return fichas ? `telefone compartilhado (${fichas} fichas)` : null;
    },
  },
  {
    id: 'sem-zona-secao',
    grupo: 'Endereço e votação',
    rotulo: 'Sem zona ou seção',
    motivo: (m) =>
      vazio(m.zone) && vazio(m.section)
        ? 'sem zona e seção'
        : vazio(m.zone)
          ? 'sem zona'
          : vazio(m.section)
            ? 'sem seção'
            : null,
  },
  {
    id: 'sem-bairro',
    grupo: 'Endereço e votação',
    rotulo: 'Sem bairro',
    motivo: (m) => (vazio(m.district) ? 'sem bairro' : null),
  },
  {
    id: 'sem-rua',
    grupo: 'Endereço e votação',
    rotulo: 'Sem rua',
    motivo: (m) => (vazio(m.street) ? 'sem rua' : null),
  },
  {
    id: 'repetido',
    grupo: 'Cadastro',
    rotulo: 'Cadastrado mais de uma vez',
    motivo: (m, c) => (c.repetidos.has(m.id) ? 'cadastrado mais de uma vez' : null),
  },
  {
    id: 'sem-origem',
    grupo: 'Cadastro',
    rotulo: 'Sem quem cadastrou',
    motivo: (m) => (m.recruitedBy ? null : 'origem desconhecida'),
  },
];

export interface PessoaFiltrada {
  member: Member;
  motivos: string[];
  /** Os filtros marcados em que a pessoa caiu, na ordem da tela. */
  filtros: string[];
}

/**
 * O NOME do problema, para a coluna "Problema" dos PDFs: "Número
 * compartilhado", "Título incompleto", "Sem zona e seção". O detalhe
 * ("título com 10 dígitos") fica na tela; no documento vai o nome, igual
 * para todo mundo que tem o mesmo problema.
 */
export function nomeDoProblema(filtroId: string, motivo: string): string {
  if (filtroId === 'telefone-repetido') return 'Número compartilhado';
  if (filtroId === 'repetido') return 'Cadastrado mais de uma vez';
  // "sem zona", "sem seção" ou "sem zona e seção": o motivo ja e o nome certo.
  if (filtroId === 'sem-zona-secao') return motivo.charAt(0).toUpperCase() + motivo.slice(1);
  return FILTROS_DE_DADOS.find((f) => f.id === filtroId)?.rotulo ?? motivo;
}

/** Quem cai em QUALQUER um dos filtros marcados, com todos os motivos. */
export function aplicarFiltros(
  members: readonly Member[],
  ids: readonly string[],
  contexto: ContextoDosFiltros,
): PessoaFiltrada[] {
  const filtros = FILTROS_DE_DADOS.filter((f) => ids.includes(f.id));
  if (filtros.length === 0) return [];

  const resultado: PessoaFiltrada[] = [];
  for (const member of members) {
    const achados = filtros
      .map((f) => ({ id: f.id, motivo: f.motivo(member, contexto) }))
      .filter((x): x is { id: string; motivo: string } => Boolean(x.motivo));
    if (achados.length) {
      resultado.push({ member, motivos: achados.map((x) => x.motivo), filtros: achados.map((x) => x.id) });
    }
  }
  return resultado.sort((a, b) => a.member.name.localeCompare(b.member.name, 'pt-BR'));
}

/** Quantas pessoas caem em cada filtro, para o numero ao lado de cada um. */
export function contarPorFiltro(
  members: readonly Member[],
  contexto: ContextoDosFiltros,
): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const filtro of FILTROS_DE_DADOS) {
    contagem[filtro.id] = members.filter((m) => filtro.motivo(m, contexto)).length;
  }
  return contagem;
}

const FALTA_PARA_NOME: Record<string, string> = {
  telefone: 'Sem telefone',
  'título de eleitor': 'Sem título',
  zona: 'Sem zona',
  seção: 'Sem seção',
  estado: 'Sem estado',
  município: 'Sem município',
  bairro: 'Sem bairro',
  rua: 'Sem rua',
};

/** "falta título de eleitor e rua" vira "Sem título · Sem rua": os nomes, na ordem do cadastro. */
export function nomesDasFaltas(faltas: readonly string[]): string {
  return faltas.map((f) => FALTA_PARA_NOME[f] ?? `Sem ${f}`).join(' · ');
}

/**
 * O nome de uma pendencia a partir do motivo escrito pelas regras
 * ("CPF com 9 dígitos", "telefone repetido no time", "zona sem seção"...):
 * o mesmo vocabulario dos filtros, para o PDF falar uma lingua so.
 */
export function nomeDaPendencia(motivo: string): string {
  const texto = motivo.trim();
  const digitos = /^(CPF|título|telefone) com (\d+) d[ií]gitos?$/i.exec(texto);
  if (digitos) {
    const [, campo, n] = digitos;
    const esperado = /cpf/i.test(campo) ? 11 : /t[ií]tulo/i.test(campo) ? 12 : 10;
    const nome = /cpf/i.test(campo) ? 'CPF' : /t[ií]tulo/i.test(campo) ? 'Título' : 'Telefone';
    return Number(n) < esperado ? `${nome} incompleto` : `${nome} que não confere`;
  }
  const mapa: Record<string, string> = {
    'cpf não confere': 'CPF que não confere',
    'título não confere': 'Título que não confere',
    'telefone não confere': 'Telefone que não confere',
    'telefone repetido no time': 'Número compartilhado',
    'zona sem seção': 'Sem seção',
    'seção sem zona': 'Sem zona',
    'sem telefone válido': 'Sem telefone válido',
    'origem desconhecida': 'Sem origem',
  };
  const chave = texto.toLowerCase();
  if (mapa[chave]) return mapa[chave];
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** O nome do problema de uma ficha do quadro (`problemasDasFichas`), pelo tipo. */
export function nomeDoProblemaDaFicha(tipo: string, detalhe: string): string {
  switch (tipo) {
    case 'invalido':
      return [...new Set(detalhe.split(/,\s*/).filter(Boolean).map(nomeDaPendencia))].join(' · ');
    case 'fora-do-municipio':
      return 'Fora do município';
    case 'terceiro-nivel':
      return 'Cadastrado pela Equipe';
    case 'responsavel-removido':
      return 'Responsável sem acesso';
    case 'sem-origem':
      return 'Sem origem';
    default:
      return nomeDaPendencia(detalhe);
  }
}
