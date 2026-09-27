import {
  CPF_LENGTH,
  VOTER_ID_LENGTH,
  isValidCpf,
  isValidVoterId,
} from '@/lib/utils/documents';
import { digitosDoTelefone, isValidPhone } from '@/lib/utils/phone';
import { completarTelefone } from './completar-telefone';

/**
 * O que precisa ser CONFERIDO em um cadastro — sem nunca impedi-lo.
 *
 * A regra do sistema e uma so: dado torto nao deixa ninguem de fora. CPF que
 * nao fecha, titulo com digito a menos, telefone pela metade — a pessoa
 * entra, seja Lider ou Equipe, e a ficha dela ja nasce com a etiqueta
 * "Conferir", dizendo exatamente o que. Recusar o cadastro por causa de um
 * numero mal copiado perde a pessoa; ela fecha a pagina e nao volta.
 *
 * E a irma de `member-completeness.ts`: la esta o que FALTA, aqui o que
 * esta PREENCHIDO ERRADO. As duas etiquetas convivem — "Incompleto" e
 * "Conferir" —, porque sao problemas diferentes e se corrigem de jeitos
 * diferentes.
 *
 * Como la, a marca e CALCULADA, nunca guardada: corrigiu o CPF na ficha, a
 * etiqueta some no mesmo instante. Uma coluna no banco comecaria certa e
 * envelheceria errada.
 *
 * E uma funcao so, usada em todo lugar — o aviso amarelo enquanto se
 * preenche, a lista da equipe, a ficha, a planilha e o quadro de
 * inconsistencias. Se cada tela tivesse a sua regra, uma diria "Conferir" e
 * a outra nao.
 */

/** O que a regra le de um cadastro — ficha gravada ou linha de planilha. */
export interface DadosConferiveis {
  phone?: string | null;
  cpf?: string | null;
  voterId?: string | null;
  zone?: string | null;
  section?: string | null;
  /** Estado do acesso: diz quando o telefone ja e de outra pessoa do time. */
  access?: string | null;
}

function digitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

function contagem(n: number): string {
  return n === 1 ? '1 dígito' : `${n} dígitos`;
}

/** CPF: vazio nao e problema desta regra (e falta, se for o caso). */
export function problemaDoCpf(valor: string | null | undefined): string | null {
  const cpf = digitos(valor);
  if (!cpf) return null;
  if (cpf.length !== CPF_LENGTH) return `CPF com ${contagem(cpf.length)}`;
  if (!isValidCpf(cpf)) return 'CPF não confere';
  return null;
}

export function problemaDoTitulo(valor: string | null | undefined): string | null {
  const titulo = digitos(valor);
  if (!titulo) return null;
  if (titulo.length !== VOTER_ID_LENGTH) return `título com ${contagem(titulo.length)}`;
  if (!isValidVoterId(titulo)) return 'título não confere';
  return null;
}

export function problemaDoTelefone(valor: string | null | undefined): string | null {
  const telefone = digitosDoTelefone(valor ?? '');
  if (!telefone) return null;
  if (telefone.length !== 10 && telefone.length !== 11) {
    return `telefone com ${contagem(telefone.length)}`;
  }
  if (!isValidPhone(telefone)) return 'telefone não confere';
  return null;
}

/** Tudo o que precisa ser conferido nesta ficha, na ordem do cadastro. */
export function dadosParaConferir(
  member: DadosConferiveis,
): string[] {
  const lista = [
    problemaDoTelefone(member.phone),
    problemaDoCpf(member.cpf),
    problemaDoTitulo(member.voterId),
  ].filter((item): item is string => Boolean(item));

  // Telefone certo, mas de OUTRA pessoa do time: a ficha entrou e o acesso
  // nao nasceu. Quem resolve e quem administra, decidindo de quem e o numero.
  if (member.access === 'DUPLICATE_PHONE') lista.push('telefone repetido no time');

  // Zona e secao andam juntas: uma sem a outra nao acha local de votacao.
  if (member.zone?.trim() && !member.section?.trim()) lista.push('zona sem seção');
  if (member.section?.trim() && !member.zone?.trim()) lista.push('seção sem zona');

  return lista;
}

export function precisaConferir(
  member: DadosConferiveis,
): boolean {
  return dadosParaConferir(member).length > 0;
}

/** Texto da etiqueta, para `title` e leitor de tela. */
export function avisoDeConferencia(
  member: DadosConferiveis,
): string {
  const lista = dadosParaConferir(member);
  if (lista.length === 0) return '';
  return `Conferir: ${lista.join(', ')}.`;
}

/**
 * O aviso de UM campo, enquanto a ficha e preenchida.
 *
 * Nao e erro: e o que vai acontecer. A pessoa ve que o numero nao fecha, e
 * sabe que pode mandar assim mesmo — o cadastro entra, marcado.
 */
export function avisoDoCampo(systemKey: string | undefined, valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  // Telefone sem DDD ou sem o 9: o sistema completa sozinho ao gravar
  // (`completar-telefone.ts`) — nao ha o que avisar.
  if (systemKey === 'phone' && completarTelefone(valor)) return null;

  const problema =
    systemKey === 'cpf'
      ? problemaDoCpf(valor)
      : systemKey === 'voter_id'
        ? problemaDoTitulo(valor)
        : systemKey === 'phone'
          ? problemaDoTelefone(valor)
          : null;

  if (!problema) return null;
  return `${problema.charAt(0).toUpperCase()}${problema.slice(1)}. Pode enviar assim mesmo: o cadastro entra marcado para conferir.`;
}
