import { normalizeSearch } from '@/lib/utils/text';

/**
 * A busca de escolas do mapa: digitar parte do nome (sem acento, sem caixa),
 * do endereco ou da cidade acha a escola. Cada palavra digitada precisa
 * aparecer em algum lugar ("humberto palmeira" acha o Colegio Humberto
 * Mendes, de Palmeira dos Indios). As que comecam pelo que foi digitado vem
 * primeiro; depois, as com mais gente (ou voto).
 *
 * Modulo puro: quem chama decide o que e "escola" (os pinos da campanha ou
 * as escolas da votacao) e o que fazer com a escolhida.
 */

export interface EscolaNaBusca {
  chave: string;
  titulo: string;
  endereco: string | null;
  cidade: string | null;
  /** O numero da escola no mapa: pessoas do time ou votos. Ordena os empates. */
  valor: number;
}

export function buscarEscolas<T extends EscolaNaBusca>(escolas: readonly T[], termo: string, limite = 8): T[] {
  const palavras = normalizeSearch(termo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [];
  const achadas: { escola: T; peso: number }[] = [];
  for (const escola of escolas) {
    const titulo = normalizeSearch(escola.titulo);
    const tudo = `${titulo} ${normalizeSearch(escola.endereco)} ${normalizeSearch(escola.cidade)}`;
    if (!palavras.every((p) => tudo.includes(p))) continue;
    const inicio = palavras[0];
    const peso = titulo.startsWith(inicio) ? 0 : titulo.split(/\s+/).some((w) => w.startsWith(inicio)) ? 1 : titulo.includes(inicio) ? 2 : 3;
    achadas.push({ escola, peso });
  }
  return achadas
    .sort((a, b) => a.peso - b.peso || b.escola.valor - a.escola.valor || a.escola.titulo.localeCompare(b.escola.titulo, 'pt-BR'))
    .slice(0, limite)
    .map((x) => x.escola);
}
