import type { Member } from '@/lib/types';
import { CERTEZA_ROTULO, EVIDENCIA_INFO, type GrupoRepetido } from './inconsistencias';
import { resumoDasFaltas } from './member-completeness';
import { recruiterText } from './recruitment';

/**
 * Um grupo de "cadastrado mais de uma vez" com os dados do cartao da tela,
 * prontos para o PDF: o PDF mostra o mesmo cartao, com as mesmas linhas.
 */
export interface RegistroRepetidoParaPdf {
  id: string;
  nome: string;
  nivel: string;
  cadastradoEm: string;
  como: string;
  ondeMora: string;
  cadastradoPor: string;
  telefone: string;
  votaEm: string;
  primeiro: boolean;
}

export interface GrupoRepetidoParaPdf {
  nome: string;
  certeza: string;
  nivel: 'certa' | 'provavel' | 'possivel';
  evidencias: string[];
  divergencias: string;
  responsaveis: string[];
  registros: RegistroRepetidoParaPdf[];
}

export function registroParaPdf(member: Member, primeiro: boolean): RegistroRepetidoParaPdf {
  return {
    id: member.id,
    nome: member.name,
    nivel: member.tier === 'LIDER' ? 'Líder' : 'Equipe',
    cadastradoEm: member.createdAt,
    como: member.source === 'invite' ? 'Pelo link' : 'Pelo painel',
    ondeMora: [member.district, member.street].filter(Boolean).join(' · '),
    cadastradoPor: recruiterText(member.recruitedBy),
    telefone: member.phone ?? '',
    votaEm: member.zone || member.section ? `Zona ${member.zone || '?'} · Seção ${member.section || '?'}` : '',
    primeiro,
  };
}

export function grupoRepetidoParaPdf(grupo: GrupoRepetido): GrupoRepetidoParaPdf {
  return {
    nome: grupo.nome,
    certeza: CERTEZA_ROTULO[grupo.certeza],
    nivel: grupo.certeza,
    evidencias: grupo.evidencias.map((e) => EVIDENCIA_INFO[e].rotulo),
    divergencias: grupo.divergencias.length ? resumoDasFaltas(grupo.divergencias, grupo.divergencias.length) : '',
    responsaveis: grupo.responsaveis,
    registros: grupo.registros.map((r) => registroParaPdf(r.member, r.primeiro)),
  };
}
