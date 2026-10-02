import type { Member } from '@/lib/types';
import { CERTEZA_ROTULO, EVIDENCIA_INFO, motivosDosRegistros, type GrupoRepetido } from './inconsistencias';
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
  cadastradoPor: string;
  telefone: string;
  votaEm: string;
  primeiro: boolean;
  /** O que ESTE registro repete de outro do grupo: "Mesmo título de eleitor". */
  motivos: string[];
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

export function registroParaPdf(member: Member, primeiro: boolean, motivos: string[] = []): RegistroRepetidoParaPdf {
  return {
    id: member.id,
    nome: member.name,
    nivel:
      member.tier === 'LIDER'
        ? member.access === 'DISABLED'
          ? 'Líder desativado'
          : 'Líder'
        : 'Equipe',
    cadastradoPor: recruiterText(member.recruitedBy),
    telefone: member.phone ?? '',
    votaEm: member.zone || member.section ? `Zona ${member.zone || '?'} · Seção ${member.section || '?'}` : '',
    primeiro,
    motivos,
  };
}

export function grupoRepetidoParaPdf(grupo: GrupoRepetido): GrupoRepetidoParaPdf {
  return {
    nome: grupo.nome,
    certeza: CERTEZA_ROTULO[grupo.certeza],
    nivel: grupo.certeza,
    // So o motivo, nunca o dado: "Mesmo título de eleitor".
    evidencias: grupo.evidencias.map((e) => EVIDENCIA_INFO[e].rotulo),
    divergencias: grupo.divergencias.length ? resumoDasFaltas(grupo.divergencias, grupo.divergencias.length) : '',
    responsaveis: grupo.responsaveis,
    registros: (() => {
      const motivos = motivosDosRegistros(grupo);
      return grupo.registros.map((r) =>
        registroParaPdf(r.member, r.primeiro, (motivos.get(r.member.id) ?? []).map((e) => EVIDENCIA_INFO[e].rotulo)),
      );
    })(),
  };
}
