import { contandoUmaVez } from './inconsistencias';
import type { Member } from '@/lib/types';
import { normalizeSearch } from '@/lib/utils/text';
import { camposFaltantes } from './member-completeness';
import { dadosParaConferir } from './conferencia';
import { recruiterText } from './recruitment';
import type { GrupoRepetido } from './inconsistencias';

/**
 * Tudo o que se sabe de UM Lider, calculado da lista do time.
 *
 * E o painel que abre quando se clica em um Lider: quanto ele trouxe, em
 * que ritmo, onde, e em que estado estao os cadastros da Equipe dele. Nada
 * aqui e consultado a parte: sai da mesma lista que a pagina ja tem, com o
 * mesmo recorte de hierarquia.
 */

export type Selo = 'Motor' | 'Constante' | 'Esfriando' | 'Parado' | 'Sem Equipe';

export const SELO_EXPLICACAO: Record<Selo, string> = {
  Motor: 'Cadastrou nos últimos 7 dias e está entre os que mais trazem gente.',
  Constante: 'Cadastrou nos últimos 7 dias.',
  Esfriando: 'Cadastrou nos últimos 30 dias, mas não nesta semana.',
  Parado: 'Tem Equipe, mas não cadastra ninguém há mais de 30 dias.',
  'Sem Equipe': 'Ainda não cadastrou ninguém.',
};

export interface Contagem {
  rotulo: string;
  quantidade: number;
}

export interface PerfilDoLider {
  lider: Member;
  equipe: Member[];
  selo: Selo;
  total: number;
  hoje: number;
  ultimos7: number;
  ultimos30: number;
  /** Variacao dos ultimos 7 dias contra os 7 anteriores, em %. */
  variacao7: number;
  /** Posicao no ranking de Lideres do time (1 = quem mais trouxe). */
  posicao: number;
  totalDeLideres: number;
  /** Parte dos cadastros de Lideres que e dele, de 0 a 100. */
  participacao: number;
  /** Tamanho medio da Equipe entre os Lideres que ja trouxeram alguem. */
  mediaDoTime: number;
  ultimoCadastro: string | null;
  diasSemCadastrar: number | null;
  /** 12 semanas, da mais antiga para a atual. */
  semanas: { inicio: string; quantidade: number }[];
  /** Parte da Equipe sem nada faltando e nada para conferir, de 0 a 100. */
  saude: number;
  incompletos: { member: Member; faltas: string[] }[];
  paraConferir: { member: Member; motivos: string[] }[];
  /** Pessoas da Equipe que estao em algum grupo de repetidos. */
  repetidos: { member: Member; outrosResponsaveis: string[] }[];
  faltasPorCampo: Contagem[];
  bairros: Contagem[];
  viaLink: number;
  viaPainel: number;
}

const DIA = 86_400_000;

/**
 * O selo de um Lider, pela mesma regra em todo lugar (o painel dele e o
 * relatorio do NEO): Motor e quem esta cadastrando agora E esta no terco de
 * cima do ranking dos Lideres que ja trouxeram alguem.
 */
export function seloDoLider(x: {
  equipe: number;
  ultimos7: number;
  ultimos30: number;
  /** Posicao no ranking, 1 = quem mais trouxe. */
  posicao: number;
  /** Lideres que ja trouxeram alguem. */
  ativos: number;
}): Selo {
  if (x.equipe === 0) return 'Sem Equipe';
  const tercoDeCima = Math.max(1, Math.ceil(x.ativos / 3));
  if (x.ultimos7 > 0) return x.posicao <= tercoDeCima ? 'Motor' : 'Constante';
  return x.ultimos30 > 0 ? 'Esfriando' : 'Parado';
}

function contar(valores: string[], limite: number): Contagem[] {
  const mapa = new Map<string, Contagem>();
  for (const valor of valores) {
    const rotulo = valor.trim();
    if (!rotulo) continue;
    const chave = normalizeSearch(rotulo);
    const atual = mapa.get(chave);
    if (atual) atual.quantidade += 1;
    else mapa.set(chave, { rotulo, quantidade: 1 });
  }
  return [...mapa.values()].sort((a, b) => b.quantidade - a.quantidade).slice(0, limite);
}

function inicioDaSemana(data: Date): number {
  const dia = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  return dia.getTime() - ((dia.getDay() + 6) % 7) * DIA;
}

export function perfilDoLider(
  lider: Member,
  todos: readonly Member[],
  repetidos: readonly GrupoRepetido[] = [],
  agora: Date = new Date(),
): PerfilDoLider {
  // A mesma pessoa cadastrada duas vezes por este Lider conta uma vez.
  const members = contandoUmaVez(todos);
  // Sem "DATA DE CADASTRO" na planilha: fora de todo recorte por periodo.
  const t = (m: Member) => (m.semDataDeCadastro ? -Infinity : new Date(m.createdAt).getTime());
  const equipeDe = (id: string | null) =>
    id ? members.filter((m) => m.recruitedBy?.userId === id) : [];

  const equipe = equipeDe(lider.userId).sort((a, b) => t(b) - t(a));
  const agoraMs = agora.getTime();
  const hoje0 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();

  const ultimos7 = equipe.filter((m) => t(m) > agoraMs - 7 * DIA).length;
  const anteriores7 = equipe.filter((m) => t(m) <= agoraMs - 7 * DIA && t(m) > agoraMs - 14 * DIA).length;
  const ultimos30 = equipe.filter((m) => t(m) > agoraMs - 30 * DIA).length;

  // Ranking: todos os Lideres do time, pelo tamanho da Equipe.
  const lideres = members.filter((m) => m.tier === 'LIDER');
  const tamanhos = lideres
    .map((l) => ({ id: l.id, equipe: equipeDe(l.userId).length }))
    .sort((a, b) => b.equipe - a.equipe);
  const posicao = Math.max(1, tamanhos.findIndex((x) => x.id === lider.id) + 1);
  const somaDeLideres = tamanhos.reduce((soma, x) => soma + x.equipe, 0);
  const ativos = tamanhos.filter((x) => x.equipe > 0);

  const ultimoCadastro = equipe.find((m) => !m.semDataDeCadastro)?.createdAt ?? null;
  const diasSemCadastrar = ultimoCadastro
    ? Math.max(0, Math.floor((agoraMs - new Date(ultimoCadastro).getTime()) / DIA))
    : null;

  const selo = seloDoLider({ equipe: equipe.length, ultimos7, ultimos30, posicao, ativos: ativos.length });

  const semanaAtual = inicioDaSemana(agora);
  const semanas = Array.from({ length: 12 }, (_, i) => {
    const inicio = semanaAtual - (11 - i) * 7 * DIA;
    return {
      inicio: new Date(inicio).toISOString(),
      quantidade: equipe.filter((m) => t(m) >= inicio && t(m) < inicio + 7 * DIA).length,
    };
  });

  const incompletos = equipe
    .map((member) => ({ member, faltas: camposFaltantes(member) }))
    .filter((x) => x.faltas.length > 0);
  const paraConferir = equipe
    .map((member) => ({ member, motivos: dadosParaConferir(member) }))
    .filter((x) => x.motivos.length > 0);
  const comProblema = new Set([...incompletos, ...paraConferir].map((x) => x.member.id));

  const idsDaEquipe = new Set(equipe.map((m) => m.id));
  const meuResponsavel = recruiterText({
    userId: lider.userId,
    name: lider.name,
    role: 'EQUIPE',
    tier: 'LIDER',
    photo: null,
  });
  const repetidosDaEquipe: PerfilDoLider['repetidos'] = [];
  for (const grupo of repetidos) {
    if (grupo.certeza === 'possivel') continue;
    for (const registro of grupo.registros) {
      if (!idsDaEquipe.has(registro.member.id)) continue;
      repetidosDaEquipe.push({
        member: registro.member,
        outrosResponsaveis: grupo.responsaveis.filter((r) => r !== meuResponsavel),
      });
    }
  }

  return {
    lider,
    equipe,
    selo,
    total: equipe.length,
    hoje: equipe.filter((m) => t(m) >= hoje0).length,
    ultimos7,
    ultimos30,
    variacao7:
      anteriores7 === 0 ? (ultimos7 > 0 ? 100 : 0) : Math.round(((ultimos7 - anteriores7) / anteriores7) * 100),
    posicao,
    totalDeLideres: lideres.length,
    participacao: somaDeLideres ? Math.round((equipe.length / somaDeLideres) * 1000) / 10 : 0,
    mediaDoTime: ativos.length ? Math.round((somaDeLideres / ativos.length) * 10) / 10 : 0,
    ultimoCadastro,
    diasSemCadastrar,
    semanas,
    saude: equipe.length ? Math.round(((equipe.length - comProblema.size) / equipe.length) * 100) : 100,
    incompletos,
    paraConferir,
    repetidos: repetidosDaEquipe,
    faltasPorCampo: contar(incompletos.flatMap((x) => x.faltas), 8),
    bairros: contar(equipe.map((m) => m.district ?? ''), 5),
    viaLink: equipe.filter((m) => m.source === 'invite').length,
    viaPainel: equipe.filter((m) => m.source !== 'invite').length,
  };
}
