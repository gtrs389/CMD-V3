import type { Member } from '@/lib/types';
import { problemaDoCpf, problemaDoTelefone, problemaDoTitulo } from './conferencia';

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
}

const vazio = (valor: string | null | undefined) => !valor || !valor.trim();
const digitos = (valor: string | null | undefined) => (valor ?? '').replace(/\D/g, '');

export const FILTROS_DE_DADOS: readonly FiltroDeDado[] = [
  {
    id: 'sem-cpf',
    grupo: 'CPF',
    rotulo: 'Sem CPF',
    motivo: (m) => (vazio(m.cpf) ? 'sem CPF' : null),
  },
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
    id: 'telefone-errado',
    grupo: 'Telefone',
    rotulo: 'Telefone incompleto ou errado',
    motivo: (m) => problemaDoTelefone(m.phone),
  },
  {
    id: 'telefone-repetido',
    grupo: 'Telefone',
    rotulo: 'Telefone repetido no time',
    motivo: (m) => (m.access === 'DUPLICATE_PHONE' ? 'telefone repetido no time' : null),
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
    const motivos = filtros
      .map((f) => f.motivo(member, contexto))
      .filter((m): m is string => Boolean(m));
    if (motivos.length) resultado.push({ member, motivos });
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
