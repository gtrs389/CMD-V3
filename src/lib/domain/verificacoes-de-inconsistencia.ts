/**
 * As verificacoes do quadro de Inconsistencias que o ADMIN geral pode
 * desligar, time a time (migration 053).
 *
 * Desligar e "nao me mostre isto neste time": a verificacao some do quadro,
 * dos filtros por dado, das contagens, da nota de saude e do PDF. A ficha da
 * pessoa nao muda — o dado continua como esta, e religar traz tudo de volta.
 *
 * Os ids sao os mesmos dos filtros por dado (`FILTROS_DE_DADOS`) quando
 * existe o filtro: desligar "telefone-incompleto" some com a secao e com o
 * botao do filtro de uma vez.
 */

export interface VerificacaoDeInconsistencia {
  id: string;
  rotulo: string;
  grupo: 'Repetidos' | 'CPF' | 'Título' | 'Telefone' | 'Endereço e votação' | 'Cadastro';
  /** O que some do quadro quando desligada, em uma linha. */
  descricao: string;
}

export const VERIFICACOES: readonly VerificacaoDeInconsistencia[] = [
  { id: 'repetido', grupo: 'Repetidos', rotulo: 'Cadastrado mais de uma vez', descricao: 'Mesmo título, CPF, nome e telefone, ou nome e seção.' },
  { id: 'possivel-repetido', grupo: 'Repetidos', rotulo: 'Pode ser a mesma pessoa', descricao: 'Só o mesmo nome.' },

  { id: 'cpf-incompleto', grupo: 'CPF', rotulo: 'CPF incompleto', descricao: 'CPF com dígito faltando ou sobrando.' },
  { id: 'cpf-errado', grupo: 'CPF', rotulo: 'CPF que não confere', descricao: 'Onze dígitos, mas não é um CPF válido.' },

  { id: 'sem-titulo', grupo: 'Título', rotulo: 'Sem título', descricao: 'Título de eleitor em branco.' },
  { id: 'titulo-incompleto', grupo: 'Título', rotulo: 'Título incompleto', descricao: 'Título com dígito faltando ou sobrando.' },
  { id: 'titulo-errado', grupo: 'Título', rotulo: 'Título que não confere', descricao: 'Doze dígitos, mas não é um título válido.' },

  { id: 'sem-telefone', grupo: 'Telefone', rotulo: 'Sem telefone', descricao: 'Telefone em branco.' },
  { id: 'telefone-incompleto', grupo: 'Telefone', rotulo: 'Telefone incompleto', descricao: 'Menos de 10 dígitos.' },
  { id: 'telefone-errado', grupo: 'Telefone', rotulo: 'Telefone que não confere', descricao: 'Dígito sobrando, DDD que não existe, celular sem o 9.' },
  { id: 'telefone-repetido', grupo: 'Telefone', rotulo: 'Telefone compartilhado', descricao: 'Pessoas diferentes com o mesmo número.' },

  { id: 'sem-zona-secao', grupo: 'Endereço e votação', rotulo: 'Sem zona ou seção', descricao: 'Zona ou seção em branco, ou uma sem a outra.' },
  { id: 'sem-municipio', grupo: 'Endereço e votação', rotulo: 'Sem estado ou município', descricao: 'Estado ou município em branco.' },
  { id: 'sem-bairro', grupo: 'Endereço e votação', rotulo: 'Sem bairro', descricao: 'Bairro em branco.' },
  { id: 'sem-rua', grupo: 'Endereço e votação', rotulo: 'Sem rua', descricao: 'Rua em branco.' },
  { id: 'fora-do-municipio', grupo: 'Endereço e votação', rotulo: 'Endereço fora do município', descricao: 'Endereço em outro estado ou município.' },

  { id: 'lider-sem-acesso', grupo: 'Cadastro', rotulo: 'Líder sem acesso ao painel', descricao: 'Líder sem telefone válido, ou com o número repetido.' },
  { id: 'terceiro-nivel', grupo: 'Cadastro', rotulo: 'Cadastrado por quem é da Equipe', descricao: 'Veio de alguém da Equipe, e não de um Líder.' },
  { id: 'responsavel-removido', grupo: 'Cadastro', rotulo: 'Responsável sem acesso', descricao: 'Quem cadastrou teve o acesso removido.' },
  { id: 'sem-origem', grupo: 'Cadastro', rotulo: 'Sem quem cadastrou', descricao: 'Cadastro de antes do rastreamento.' },
];

const IDS = new Set(VERIFICACOES.map((verificacao) => verificacao.id));

export function ehVerificacao(id: string): boolean {
  return IDS.has(id);
}

/** Sem repeticao, so ids conhecidos, na ordem do catalogo. */
export function verificacoesValidas(ids: readonly string[]): string[] {
  const escolhidos = new Set(ids);
  return VERIFICACOES.map((v) => v.id).filter((id) => escolhidos.has(id));
}

/** Campo que falta (o rotulo de `camposFaltantes`) -> a verificacao dele. */
export const VERIFICACAO_DA_FALTA: Record<string, string> = {
  telefone: 'sem-telefone',
  'título de eleitor': 'sem-titulo',
  zona: 'sem-zona-secao',
  'seção': 'sem-zona-secao',
  estado: 'sem-municipio',
  'município': 'sem-municipio',
  bairro: 'sem-bairro',
  rua: 'sem-rua',
};

/**
 * Um item de "dado para conferir" (o texto de `dadosParaConferir`) -> a
 * verificacao dele. Telefone com menos de 10 digitos e "incompleto"; com
 * digito sobrando, "nao confere" — a mesma regra dos filtros por dado.
 */
export function verificacaoDoInvalido(texto: string, digitosDoTelefone: number): string {
  if (texto.startsWith('telefone')) return digitosDoTelefone < 10 ? 'telefone-incompleto' : 'telefone-errado';
  if (texto.startsWith('CPF')) return texto === 'CPF não confere' ? 'cpf-errado' : 'cpf-incompleto';
  if (texto.startsWith('título')) return texto === 'título não confere' ? 'titulo-errado' : 'titulo-incompleto';
  return 'sem-zona-secao';
}
