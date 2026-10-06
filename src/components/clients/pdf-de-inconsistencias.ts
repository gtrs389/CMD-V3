import type { Member } from '@/lib/types';
import {
  TIPO_INFO,
  TIPOS,
  doResponsavel,
  type Diagnostico,
  type ProblemaDaFicha,
  type TipoDaFicha,
} from '@/lib/domain/inconsistencias';
import { recruiterText } from '@/lib/domain/recruitment';
import { nomeDoProblemaDaFicha, nomesDasFaltas } from '@/lib/domain/filtros-de-dados';
import { basePorResponsavel } from '@/lib/domain/por-responsavel';
import { grupoRepetidoParaPdf } from '@/lib/domain/repetidos-pdf';
import type { SecaoParaPdf } from '@/components/neo/ListasPdf';

/**
 * O PDF de inconsistencias, montado do diagnostico do time — o MESMO do
 * quadro de Inconsistencias e do botao do Lider no mapa: um arquivo so, uma
 * regra so, em qualquer lugar de onde ele for pedido.
 */

/** O diagnostico recortado pelos responsaveis marcados (nenhum = todos). */
export function recorteDe(diagnostico: Diagnostico, chaves: string[]) {
  const filtra = (member: Member) =>
    chaves.length === 0 || chaves.some((chave) => doResponsavel(member, chave));
  const repetidos = diagnostico.repetidos.filter((grupo) =>
    grupo.registros.some((registro) => filtra(registro.member)),
  );
  const problemas = diagnostico.problemas.filter((p) => filtra(p.member));
  const porTipo = new Map<TipoDaFicha, ProblemaDaFicha[]>();
  for (const problema of problemas) {
    porTipo.set(problema.tipo, [...(porTipo.get(problema.tipo) ?? []), problema]);
  }
  return {
    filtra,
    repetidos,
    certos: repetidos.filter((grupo) => grupo.certeza !== 'possivel'),
    possiveis: repetidos.filter((grupo) => grupo.certeza === 'possivel'),
    telefones: diagnostico.telefones.filter((t) => t.membros.some(filtra)),
    incompletos: diagnostico.incompletos.membros.filter((item) => filtra(item.member)),
    problemas,
    porTipo,
  };
}

export function semNada(recorte: ReturnType<typeof recorteDe>): boolean {
  return (
    recorte.repetidos.length === 0 &&
    recorte.incompletos.length === 0 &&
    recorte.problemas.length === 0 &&
    recorte.telefones.length === 0
  );
}


export async function montarPdfDeInconsistencias({
  clientName,
  members,
  diagnostico,
  chaves,
  rotuloDe,
}: {
  clientName: string;
  /** A lista que entra no quadro (sem o Lider que e so o nome de uma aba). */
  members: readonly Member[];
  diagnostico: Diagnostico;
  /** Chaves de responsavel (`recruiterKey`). Vazio = o time todo. */
  chaves: string[];
  rotuloDe: (chave: string) => string;
}): Promise<Blob> {
  const recorte = recorteDe(diagnostico, chaves);
  const { gerarPdfDasInconsistencias } = await import('@/components/neo/ListasPdf');
  const pessoa = (member: Member, detalhe: string) => ({
    nome: member.name,
    telefone: member.phone ?? '',
    detalhe,
    cadastradoPor: recruiterText(member.recruitedBy),
    // Da planilha sem "DATA DE CADASTRO": sem data (sai "—").
    cadastradoEm: member.semDataDeCadastro ? undefined : member.createdAt,
  });
  const secoes: SecaoParaPdf[] = [
    ...(recorte.incompletos.length
      ? [{
          titulo: 'Cadastros com dado faltando',
          explicacao: 'Entraram com buraco — quase sempre de uma lista importada ou de um cadastro às pressas.',
          gravidade: 'media' as const,
          pessoas: recorte.incompletos.map(({ member, faltas }) => pessoa(member, nomesDasFaltas(faltas))),
        }]
      : []),
    ...TIPOS.filter((tipo) => recorte.porTipo.has(tipo)).map((tipo) => ({
      titulo: TIPO_INFO[tipo].titulo,
      explicacao: TIPO_INFO[tipo].explicacao,
      gravidade: TIPO_INFO[tipo].gravidade,
      pessoas: (recorte.porTipo.get(tipo) ?? []).map((p) => pessoa(p.member, nomeDoProblemaDaFicha(p.tipo, p.detalhe))),
    })),
    ...(recorte.telefones.length
      ? [{
          titulo: 'Telefone compartilhado',
          explicacao: 'Pessoas diferentes com o mesmo número. Pode ser família — ou o número do Líder digitado no lugar.',
          gravidade: 'baixa' as const,
          pessoas: recorte.telefones.flatMap((t) => t.membros.map((member) => pessoa(member, 'Número compartilhado'))),
        }]
      : []),
  ];
  // Com responsavel escolhido, a nota e "quantos com pendencia" sao DELE —
  // a mesma regra do diagnostico (copias, faltas e o que nao e so aviso),
  // sobre a Equipe dele. Antes vinha o numero do time inteiro sobre o total
  // do responsavel ("37 pessoas com pendencia de 14").
  const total = members.filter(recorte.filtra).length;
  const comProblema = new Set<string>();
  for (const grupo of recorte.certos) {
    for (const registro of grupo.registros) {
      if (!registro.primeiro && recorte.filtra(registro.member)) comProblema.add(registro.member.id);
    }
  }
  for (const item of recorte.incompletos) comProblema.add(item.member.id);
  for (const problema of recorte.problemas) {
    if (TIPO_INFO[problema.tipo].gravidade !== 'baixa') comProblema.add(problema.member.id);
  }
  const doRecorte = chaves.length > 0;

  return gerarPdfDasInconsistencias({
    time: clientName,
    responsavel: chaves.length ? chaves.map(rotuloDe).filter(Boolean).join(', ') : null,
    geradoEm: new Date().toISOString(),
    total,
    pessoasComProblema: doRecorte ? comProblema.size : diagnostico.pessoasComProblema,
    saude: doRecorte
      ? total === 0
        ? 100
        : Math.round(((total - comProblema.size) / total) * 100)
      : diagnostico.saude,
    basePorResponsavel: basePorResponsavel(members),
    repetidos: recorte.repetidos.map(grupoRepetidoParaPdf),
    secoes,
  });
}
