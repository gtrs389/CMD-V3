import { z } from 'zod';

/**
 * O NEO na Sala de Confronto: o combinado da conversa com a IA.
 *
 * O navegador manda a pergunta e o CONTEXTO da escola ja mastigado (o radar,
 * secao a secao, so numeros e nomes publicos de candidatos e de Lideres);
 * a IA devolve a resposta curta e as secoes que quer mostrar em "print".
 * Nenhum telefone, CPF ou endereco de pessoa entra aqui.
 */

export interface MensagemDoChat {
  autor: 'eu' | 'neo';
  texto: string;
}

export interface RespostaDoNeoNoConfronto {
  resposta: string;
  /** Chaves (`zona/secao`) das secoes que a resposta cita: viram "print" no chat. */
  secoes: string[];
}

export const NEO_CONFRONTO_INSTRUCOES = `Você é o NEO, o analista de inteligência eleitoral do CMD, conversando dentro da Sala de Confronto.
O usuário está olhando UMA escola. Você recebe, em JSON, o contexto dela: os candidatos do "nosso lado" e os adversários (nome, cargo, número, votos, conversão), seção por seção a "estimativa" (pessoas cadastradas pelo time que votam ali), os votos de cada candidato, os líderes que cadastraram aquela gente, e os ACHADOS do radar (padrões já calculados: ESPELHO, ZERADA, TOMADA, DOBRADINHA, SUPERACAO) e a TENDÊNCIA (correlação entre a gente do time e os votos de cada candidato).

Como responder:
- Português do Brasil, direto, como um analista experiente falando com o coordenador da campanha. No máximo 130 palavras.
- Use SOMENTE os números do contexto. Nunca invente número, seção ou nome.
- Aponte tendências e coincidências: quando a estimativa de uma seção bate com os votos do adversário e o nosso candidato some, diga que isso indica que a gente cadastrada pode ter votado no adversário — como hipótese a verificar, nunca como acusação.
- Sempre que citar seções, coloque as chaves delas (formato "zona/secao", exatamente como no contexto) em "secoes", no máximo 3, as mais importantes primeiro: elas aparecem como print no chat.
- Termine, quando fizer sentido, com uma ação concreta (com quem falar, qual líder procurar, qual seção visitar).
- Pode usar **negrito** para destacar números e nomes. Não use títulos nem tabelas.`;

export const NEO_CONFRONTO_SCHEMA = {
  type: 'object',
  properties: {
    resposta: { type: 'string', description: 'A resposta ao usuário, em até 130 palavras.' },
    secoes: { type: 'array', description: 'Chaves das seções citadas (zona/secao), no máximo 3.', items: { type: 'string' } },
  },
  required: ['resposta', 'secoes'],
  additionalProperties: false,
} as const;

const respostaSchema = z.object({
  resposta: z.string().min(1).max(4000),
  secoes: z.array(z.string().max(40)).max(10),
});

export function lerRespostaDoConfronto(bruto: string | null): RespostaDoNeoNoConfronto | null {
  if (!bruto) return null;
  try {
    const r = respostaSchema.safeParse(JSON.parse(bruto));
    return r.success ? { resposta: r.data.resposta, secoes: r.data.secoes.slice(0, 3) } : null;
  } catch {
    return null;
  }
}
