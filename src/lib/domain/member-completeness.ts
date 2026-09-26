import type { Member } from '@/lib/types';

/**
 * O cadastro esta completo?
 *
 * A pergunta existe por causa da PLANILHA. Uma lista que vem de um mutirao,
 * de outro sistema ou de um caderno digitado chega com buracos: gente sem
 * telefone, sem titulo, sem rua. Recusar essas linhas perde a pessoa; grava-
 * las sem marca nenhuma esconde o buraco, e ninguem volta para tapa-lo. Elas
 * entram, e entram MARCADAS.
 *
 * A marca e CALCULADA, nunca guardada. Isso e o que faz ela dizer a verdade:
 * preencher o telefone na ficha tira a etiqueta no mesmo instante, sem
 * ninguem precisar lembrar de desmarcar nada. Uma coluna no banco comecaria
 * certa e envelheceria errada.
 *
 * O QUE CONTA COMO FALTA. Os dados que o sistema guarda de toda pessoa e que
 * a planilha sabe trazer: telefone, titulo, zona, secao e o endereco. Ficam
 * DE FORA — de proposito — foto, CPF, genero e e-mail: sao opcionais por
 * natureza, nem toda operacao os coleta, e conta-los pintaria de incompleta
 * a equipe inteira. Uma etiqueta que aparece em todo mundo nao aponta
 * ninguem.
 */

interface CampoEssencial {
  chave: keyof Member;
  /** Como o campo aparece no aviso, em minusculas: "falta telefone e zona". */
  rotulo: string;
}

const CAMPOS_ESSENCIAIS: readonly CampoEssencial[] = [
  { chave: 'phone', rotulo: 'telefone' },
  { chave: 'voterId', rotulo: 'título de eleitor' },
  { chave: 'zone', rotulo: 'zona' },
  { chave: 'section', rotulo: 'seção' },
  { chave: 'state', rotulo: 'estado' },
  { chave: 'city', rotulo: 'município' },
  { chave: 'district', rotulo: 'bairro' },
  { chave: 'street', rotulo: 'rua' },
];

function vazio(valor: unknown): boolean {
  return valor === null || valor === undefined || String(valor).trim() === '';
}

/** O que falta nesta ficha, na ordem em que aparece no cadastro. */
export function camposFaltantes(member: Member): string[] {
  return CAMPOS_ESSENCIAIS.filter((campo) => vazio(member[campo.chave])).map(
    (campo) => campo.rotulo,
  );
}

export function cadastroIncompleto(member: Member): boolean {
  return camposFaltantes(member).length > 0;
}

/**
 * "telefone, zona e seção" — a lista do jeito que se fala.
 *
 * Passando de tres, o resto vira contagem: "telefone, zona e mais 2". A
 * etiqueta cabe em uma linha da lista, e quem quiser a lista inteira abre a
 * ficha.
 */
export function resumoDasFaltas(faltas: string[], teto = 3): string {
  if (faltas.length === 0) return '';
  if (faltas.length <= teto) {
    if (faltas.length === 1) return faltas[0];
    return `${faltas.slice(0, -1).join(', ')} e ${faltas[faltas.length - 1]}`;
  }

  const mostrados = faltas.slice(0, teto);
  return `${mostrados.join(', ')} e mais ${faltas.length - teto}`;
}

/** Texto pronto da etiqueta, para o atributo `title` e para leitores de tela. */
export function avisoDeFaltas(member: Member): string {
  const faltas = camposFaltantes(member);
  if (faltas.length === 0) return '';
  return `Cadastro incompleto: falta ${resumoDasFaltas(faltas, CAMPOS_ESSENCIAIS.length)}.`;
}
