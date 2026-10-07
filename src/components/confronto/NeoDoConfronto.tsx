'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, Bot, Copy, Download, Send, Sparkles, TrendingUp, Users, X } from 'lucide-react';
import type { LiderNoRaioX } from '@/lib/domain/confronto';
import type { Duelo, SecaoNoDuelo } from '@/lib/domain/sala-de-confronto';
import { candidatoDoRotulo, radarDoNeo, type Achado, type Radar } from '@/lib/domain/radar-do-neo';
import type { MensagemDoChat, RespostaDoNeoNoConfronto } from '@/lib/domain/neo-do-confronto';
import { api } from '@/lib/repositories/http/api';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/text';
import { FotoDoCandidato } from '@/components/apuracao/FotoDoCandidato';
import type { CandidatoNoRaioX } from '@/components/dashboard/votacao/RaioXDaEscola';

/**
 * O NEO dentro da Sala de Confronto: um chat flutuante que ja chega lendo a
 * escola. O RADAR (deterministico, sem custo) aponta os padroes — o
 * espelho (a gente do time votou no adversario?), secao zerada, dobradinha
 * quebrada, a tendencia — e o NEO manda "prints" no chat: o quadro da secao,
 * a tendencia, os lideres. Cada print sai em PNG para mandar no WhatsApp.
 * Perguntas livres vao para a IA (com o radar como contexto); sem a IA, o
 * proprio radar responde.
 */

type Print =
  | { tipo: 'secao'; chave: string; achado?: Achado }
  | { tipo: 'tendencia' }
  | { tipo: 'lideres' };

interface Mensagem {
  id: number;
  autor: 'eu' | 'neo';
  texto: string;
  prints?: Print[];
}

const SUGESTOES: { rotulo: string; pergunta: string }[] = [
  { rotulo: '🚨 O que tem de estranho?', pergunta: 'O que tem de estranho nesta escola?' },
  { rotulo: '🔁 Coincidências', pergunta: 'Quais coincidências você encontrou?' },
  { rotulo: '📈 Tendência dos votos', pergunta: 'Qual é a tendência dos votos?' },
  { rotulo: '🧭 Onde perdemos mais?', pergunta: 'Onde perdemos mais?' },
  { rotulo: '👥 E os líderes?', pergunta: 'Quais líderes eu preciso procurar?' },
  { rotulo: '📝 Resumo para mandar', pergunta: 'Me dá um resumo para mandar para a coordenação.' },
];

const curto = (nome: string) => nome.split(/\s+/).slice(0, 2).join(' ');
const pct = (n: number) => `${Math.round(n)}%`;

export function NeoDoConfronto({
  titulo,
  duelo,
  esquerda,
  direita,
  lideres,
}: {
  titulo: string;
  duelo: Duelo;
  esquerda: CandidatoNoRaioX[];
  direita: CandidatoNoRaioX[];
  lideres: LiderNoRaioX[];
}) {
  const radar = useMemo(
    () =>
      radarDoNeo({
        secoes: duelo.secoes,
        esquerda: esquerda.map((c) => candidatoDoRotulo(c.nome, c.rotulo)),
        direita: direita.map((c) => candidatoDoRotulo(c.nome, c.rotulo)),
        lideres,
      }),
    [duelo.secoes, esquerda, direita, lideres],
  );
  const alertas = radar.achados.filter((a) => a.gravidade === 'alta');
  const secaoPorChave = useMemo(() => new Map(duelo.secoes.map((s) => [s.chave, s])), [duelo.secoes]);

  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [digitando, setDigitando] = useState(false);
  const [texto, setTexto] = useState('');
  const [avisoDaIa, setAvisoDaIa] = useState<string | null>(null);
  const seq = useRef(0);
  const relogios = useRef<number[]>([]);
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => () => relogios.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensagens.length, digitando]);

  /** O NEO "digita" cada mensagem, uma depois da outra. */
  function neoDiz(lista: Omit<Mensagem, 'id' | 'autor'>[], atrasoInicial = 350) {
    let espera = atrasoInicial;
    setDigitando(true);
    lista.forEach((m, i) => {
      espera += Math.min(1400, 350 + m.texto.length * 6);
      relogios.current.push(
        window.setTimeout(() => {
          setMensagens((atual) => [...atual, { ...m, id: ++seq.current, autor: 'neo' }]);
          if (i === lista.length - 1) setDigitando(false);
        }, espera),
      );
    });
  }

  function abrir() {
    setAberto(true);
    if (mensagens.length || digitando) return;
    const boas = radar.achados.filter((a) => a.gravidade === 'boa').length;
    const abertura: Omit<Mensagem, 'id' | 'autor'>[] = [
      {
        texto: `Oi! Sou o **NEO**. Li as **${duelo.secoes.length} seções** do ${titulo}, com **${formatNumber(radar.estimativa)} pessoas do time** votando aqui.`,
      },
      {
        texto: alertas.length
          ? `Achei **${alertas.length} ${alertas.length === 1 ? 'sinal de alerta' : 'sinais de alerta'}**${radar.coincidenciasExatas.length ? `, **${radar.coincidenciasExatas.length} ${radar.coincidenciasExatas.length === 1 ? 'coincidência exata' : 'coincidências exatas'}** entre a gente do time e os votos do adversário` : ''}${boas ? ` e **${boas} ${boas === 1 ? 'seção' : 'seções'}** onde passamos da gente do time` : ''}. Começo pelo mais grave:`
          : direita.length
            ? 'Não achei nenhum sinal grave por aqui. Pergunte o que quiser — tendência, coincidências, líderes.'
            : 'Ainda não há adversário na sala: chame um do lado direito e eu comparo seção por seção. Enquanto isso, olho o nosso lado contra a gente do time.',
      },
    ];
    if (alertas[0]) abertura.push({ texto: alertas[0].texto, prints: [{ tipo: 'secao', chave: alertas[0].secao, achado: alertas[0] }] });
    if (radar.alertaDeTendencia) abertura.push(textoDaTendencia(radar));
    neoDiz(abertura, 200);
  }

  /** O radar respondendo sozinho (sem IA, ou para os atalhos). */
  function respostaDoRadar(pergunta: string): Omit<Mensagem, 'id' | 'autor'>[] {
    const p = pergunta.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/coincid|igual|bat|espelh/.test(p)) {
      const espelhos = radar.achados.filter((a) => a.tipo === 'ESPELHO');
      if (!espelhos.length && !radar.coincidenciasExatas.length) return [{ texto: 'Nenhuma coincidência entre a gente do time e os votos dos adversários nesta escola.' }];
      return [
        {
          texto: `Encontrei **${espelhos.length} ${espelhos.length === 1 ? 'seção espelho' : 'seções espelho'}**: onde o nosso candidato quase sumiu e o adversário teve praticamente o número de pessoas que o time cadastrou ali.${radar.coincidenciasExatas.length ? ` Em **${radar.coincidenciasExatas.length}** a conta bateu exata.` : ''}`,
          prints: espelhos.slice(0, 3).map((a) => ({ tipo: 'secao' as const, chave: a.secao, achado: a })),
        },
      ];
    }
    if (/tend|cresc|correla|padr/.test(p)) return [textoDaTendencia(radar, true)];
    if (/lider|líder|cobrar|procurar|quem/.test(p)) return [textoDosLideres(radar)];
    if (/perd|derrot|pior/.test(p)) {
      const perdidas = [...duelo.secoes].filter((s) => s.vencedor === 'DIREITA').sort((a, b) => a.saldo - b.saldo).slice(0, 3);
      if (!perdidas.length) return [{ texto: direita.length ? 'Não perdemos nenhuma seção desta escola. 💪' : 'Sem adversário na sala ainda: chame um para eu dizer onde perdemos.' }];
      return [
        {
          texto: `As maiores derrotas: ${perdidas.map((s) => `**Seção ${s.secao}** (${s.totalEsquerda} × ${s.totalDireita})`).join(', ')}. Para virar as três, faltaram **${perdidas.reduce((t, s) => t + 1 - s.saldo, 0)} votos**.`,
          prints: perdidas.map((s) => ({ tipo: 'secao' as const, chave: s.chave })),
        },
      ];
    }
    if (/resum|coorden|mandar|relat/.test(p)) return [{ texto: resumoParaMandar(titulo, duelo, radar) }];
    if (alertas.length) {
      return [
        { texto: `São **${alertas.length}** pontos que merecem atenção. Os mais graves:` },
        ...alertas.slice(0, 3).map((a) => ({ texto: a.texto, prints: [{ tipo: 'secao' as const, chave: a.secao, achado: a }] })),
      ];
    }
    return [{ texto: 'Por aqui está tudo dentro do esperado. Quer ver a tendência dos votos ou os líderes?' }];
  }

  async function perguntar(pergunta: string, viaAtalho = false) {
    const limpa = pergunta.trim();
    if (!limpa || digitando) return;
    const historico: MensagemDoChat[] = mensagens.slice(-6).map((m) => ({ autor: m.autor, texto: m.texto }));
    setMensagens((atual) => [...atual, { id: ++seq.current, autor: 'eu', texto: limpa }]);
    setTexto('');
    // Os atalhos o radar responde na hora (e de graca).
    if (viaAtalho) return neoDiz(respostaDoRadar(limpa));
    setDigitando(true);
    try {
      const { neo, erro } = await api<{ neo: RespostaDoNeoNoConfronto | null; erro: string | null }>('/api/confrontos/neo', {
        method: 'POST',
        body: { pergunta: limpa, historico, contexto: contextoParaONeo(titulo, duelo, radar, esquerda, direita, lideres) },
      });
      if (neo) {
        setDigitando(false);
        setMensagens((atual) => [
          ...atual,
          {
            id: ++seq.current,
            autor: 'neo',
            texto: neo.resposta,
            prints: neo.secoes
              .filter((k) => secaoPorChave.has(k))
              .map((k) => ({ tipo: 'secao' as const, chave: k, achado: radar.achados.find((a) => a.secao === k) })),
          },
        ]);
        return;
      }
      if (erro && !avisoDaIa) setAvisoDaIa(erro);
    } catch {
      // Sem a IA: o radar responde.
    }
    setDigitando(false);
    neoDiz(respostaDoRadar(limpa), 0);
  }

  return (
    <>
      {/* O BOTAO: o orbe do NEO, com quantos alertas ele ja achou. */}
      {!aberto ? (
        <button
          type="button"
          onClick={abrir}
          aria-label={`Conversar com o NEO${alertas.length ? `: ${alertas.length} alertas` : ''}`}
          className="group fixed right-5 bottom-5 z-40 flex items-center gap-3 rounded-pill bg-gradient-to-r from-navy-900 via-[#1e3a8a] to-navy-900 py-2 pr-5 pl-2 text-white shadow-[0_18px_40px_-14px_rgba(15,30,53,0.9)] ring-1 ring-white/15 transition-all hover:-translate-y-1"
        >
          <OrbeDoNeo tamanho="md" />
          <span className="text-left leading-tight">
            <span className="block text-sm font-bold">Falar com o NEO</span>
            <span className="block text-[0.6875rem] text-white/65">
              {alertas.length ? `${alertas.length} ${alertas.length === 1 ? 'alerta' : 'alertas'} nesta escola` : 'análise da escola'}
            </span>
          </span>
          {alertas.length ? (
            <span className="absolute -top-1.5 -right-1 flex size-6 items-center justify-center rounded-full bg-danger-600 text-xs font-bold ring-2 ring-white">
              {alertas.length}
            </span>
          ) : null}
        </button>
      ) : null}

      {aberto ? (
        <section
          role="dialog"
          aria-label="Chat com o NEO"
          className="fixed inset-0 z-[70] flex animate-[slide-up_280ms_cubic-bezier(0.22,1,0.36,1)] flex-col overflow-hidden bg-canvas shadow-overlay sm:inset-auto sm:right-5 sm:bottom-5 sm:h-[min(44rem,calc(100dvh-2.5rem))] sm:w-[min(30rem,calc(100vw-2.5rem))] sm:rounded-2xl sm:border sm:border-line"
        >
          <header className="relative flex shrink-0 items-center gap-3 overflow-hidden bg-gradient-to-r from-navy-900 via-[#1e3a8a] to-navy-900 px-4 py-3 text-white">
            <span aria-hidden="true" className="cmd-grade-pontos pointer-events-none absolute inset-0 opacity-60" />
            <OrbeDoNeo tamanho="md" />
            <div className="relative min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-bold">
                NEO <Sparkles aria-hidden="true" className="size-3.5 text-gold-400" />
              </p>
              <p className="truncate text-[0.6875rem] text-white/65">{digitando ? 'analisando…' : `lendo ${titulo}`}</p>
            </div>
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar o chat"
              className="relative flex size-9 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </header>

          <div className="scrollbar-slim min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4">
            {mensagens.map((m) => (
              <BolhaDoChat key={m.id} m={m}>
                {m.prints?.map((p, i) => (
                  <PrintNoChat
                    key={`${m.id}-${i}`}
                    print={p}
                    radar={radar}
                    secao={p.tipo === 'secao' ? (secaoPorChave.get(p.chave) ?? null) : null}
                    secoes={duelo.secoes}
                    esquerda={esquerda}
                    direita={direita}
                    titulo={titulo}
                  />
                ))}
              </BolhaDoChat>
            ))}
            {digitando ? (
              <div className="flex items-end gap-2">
                <OrbeDoNeo tamanho="sm" />
                <span className="flex gap-1 rounded-2xl rounded-bl-md bg-surface px-3 py-2.5 shadow-card">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-1.5 animate-bounce rounded-full bg-ink-400" style={{ animationDelay: `${i * 120}ms` }} />
                  ))}
                </span>
              </div>
            ) : null}
            {avisoDaIa ? (
              <p className="rounded-control bg-gold-50 px-3 py-2 text-[0.6875rem] text-gold-700">
                {avisoDaIa} Enquanto isso, respondo com o radar da escola.
              </p>
            ) : null}
            <div ref={fim} />
          </div>

          <div className="shrink-0 border-t border-line bg-surface px-3 pt-2.5 pb-3">
            <div className="scrollbar-slim -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s.rotulo}
                  type="button"
                  disabled={digitando}
                  onClick={() => void perguntar(s.pergunta, true)}
                  className="shrink-0 rounded-pill border border-line bg-surface px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-ink-700 transition-colors hover:border-accent-600 hover:bg-accent-50 disabled:opacity-50"
                >
                  {s.rotulo}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perguntar(texto);
              }}
              className="flex items-center gap-2"
            >
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Pergunte ao NEO sobre esta escola…"
                aria-label="Pergunta para o NEO"
                className="min-h-11 min-w-0 flex-1 rounded-pill border border-line bg-ink-50 px-4 text-sm text-ink-900 placeholder:text-ink-400 focus:border-accent-600 focus:bg-surface focus:ring-4 focus:ring-accent-100 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!texto.trim() || digitando}
                aria-label="Enviar"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-navy-900 text-gold-400 transition-all hover:bg-navy-800 disabled:opacity-40"
              >
                <Send aria-hidden="true" className="size-4" />
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------------- */

function textoDaTendencia(radar: Radar, completo = false): Omit<Mensagem, 'id' | 'autor'> {
  const a = radar.alertaDeTendencia;
  const comR = radar.tendencias.filter((t) => t.correlacao !== null);
  if (!a && !completo) return { texto: '' };
  if (!comR.length) return { texto: 'Ainda são poucas seções para eu medir tendência com segurança (preciso de pelo menos 4).' };
  const texto = a
    ? `📈 **Tendência preocupante:** onde o time tem mais gente cadastrada, quem cresce é **${curto(a.adversario)}** (correlação ${a.rAdversario.toFixed(2)}), e não **${curto(a.nosso)}** (${a.rNosso.toFixed(2)}). É o padrão de quando a nossa gente vota no adversário.`
    : `📈 A gente do time e os votos andam juntos assim: ${comR
        .map((t) => `**${curto(t.nome)}** ${t.correlacao!.toFixed(2)}`)
        .join(', ')}. Perto de 1, o candidato cresce onde o time tem mais gente; perto de 0, não tem relação.`;
  return { texto, prints: [{ tipo: 'tendencia' }] };
}

function textoDosLideres(radar: Radar): Omit<Mensagem, 'id' | 'autor'> {
  const porLider = new Map<string, { secoes: number; pessoas: number }>();
  for (const a of radar.achados) {
    if (a.gravidade === 'boa' || !a.lider) continue;
    const atual = porLider.get(a.lider.nome) ?? { secoes: 0, pessoas: 0 };
    atual.secoes += 1;
    atual.pessoas += a.lider.pessoas;
    porLider.set(a.lider.nome, atual);
  }
  if (!porLider.size) return { texto: 'Nenhum líder aparece nas seções com alerta. A gente deles está votando como esperado aqui.' };
  const lista = [...porLider.entries()].sort((a, b) => b[1].pessoas - a[1].pessoas);
  return {
    texto: `👥 Eu começaria por **${lista[0][0]}**: a gente cadastrada nessa liderança está em **${lista[0][1].secoes} ${lista[0][1].secoes === 1 ? 'seção com alerta' : 'seções com alerta'}** (${lista[0][1].pessoas} pessoas). Vale uma conversa para entender o que aconteceu.`,
    prints: [{ tipo: 'lideres' }],
  };
}

function resumoParaMandar(titulo: string, duelo: Duelo, radar: Radar): string {
  const alertas = radar.achados.filter((a) => a.gravidade === 'alta');
  const linhas = [
    `📍 *${titulo}*`,
    `Placar na escola: ${formatNumber(duelo.totalEsquerda)} × ${formatNumber(duelo.totalDireita)} · seções ${duelo.vitorias.esquerda} × ${duelo.vitorias.direita}`,
    `Gente do time: ${formatNumber(radar.estimativa)} pessoas`,
    alertas.length ? `🚨 ${alertas.length} alertas: ${alertas.slice(0, 3).map((a) => `Seção ${a.numeroDaSecao}`).join(', ')}` : '✅ Sem alertas graves',
    radar.alertaDeTendencia ? `📈 A gente do time acompanha ${curto(radar.alertaDeTendencia.adversario)}, não o nosso candidato` : null,
  ].filter(Boolean);
  return `Aqui está, pronto para copiar:\n\n${linhas.join('\n')}`;
}

/** O que vai para a IA: so numeros e nomes publicos, ja organizados. */
function contextoParaONeo(
  titulo: string,
  duelo: Duelo,
  radar: Radar,
  esquerda: CandidatoNoRaioX[],
  direita: CandidatoNoRaioX[],
  lideres: LiderNoRaioX[],
) {
  const cand = (c: CandidatoNoRaioX) => candidatoDoRotulo(c.nome, c.rotulo);
  return {
    escola: titulo,
    nossoLado: esquerda.map((c, i) => ({ ...cand(c), votos: duelo.esquerda[i] ?? 0 })),
    adversarios: direita.map((c, i) => ({ ...cand(c), votos: duelo.direita[i] ?? 0 })),
    placar: { nosso: duelo.totalEsquerda, adversarios: duelo.totalDireita, secoesVencidas: duelo.vitorias },
    estimativaDaEscola: radar.estimativa,
    secoes: duelo.secoes.slice(0, 80).map((s) => ({
      chave: s.chave,
      secao: s.secao,
      zona: s.zona,
      estimativa: s.estimativa,
      votos: Object.fromEntries([
        ...esquerda.map((c, i) => [c.nome, s.esquerda[i] ?? 0]),
        ...direita.map((c, j) => [c.nome, s.direita[j] ?? 0]),
      ]),
      lideres: lideres
        .map((l) => ({ nome: l.nome, pessoas: l.porSecao[s.chave] ?? 0 }))
        .filter((x) => x.pessoas > 0)
        .sort((a, b) => b.pessoas - a.pessoas)
        .slice(0, 3),
    })),
    achados: radar.achados.slice(0, 25).map((a) => ({ tipo: a.tipo, gravidade: a.gravidade, secao: a.secao, texto: a.texto })),
    tendencias: radar.tendencias,
    alertaDeTendencia: radar.alertaDeTendencia,
  };
}

/* ---------------------------------------------------------------------- */

function OrbeDoNeo({ tamanho }: { tamanho: 'sm' | 'md' }) {
  return (
    <span className={cn('relative flex shrink-0 items-center justify-center', tamanho === 'md' ? 'size-10' : 'size-7')}>
      <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-gold-400/30 [animation-duration:2.4s]" />
      <span
        className={cn(
          'relative flex items-center justify-center rounded-full bg-gradient-to-br from-gold-400 via-[#f59e0b] to-[#e0457b] text-navy-900 shadow-[0_0_24px_-4px_rgba(242,193,78,0.9)]',
          tamanho === 'md' ? 'size-10' : 'size-7',
        )}
      >
        <Bot aria-hidden="true" className={tamanho === 'md' ? 'size-5' : 'size-4'} />
      </span>
    </span>
  );
}

/** Texto com **negrito** (o unico enfeite que o NEO usa) e quebras de linha. */
function TextoComNegrito({ texto }: { texto: string }) {
  return (
    <>
      {texto.split('\n').map((linha, i) => (
        <span key={i} className="block min-h-[0.5em]">
          {linha.split(/(\*\*[^*]+\*\*)/g).map((parte, j) =>
            parte.startsWith('**') && parte.endsWith('**') ? <b key={j}>{parte.slice(2, -2)}</b> : <span key={j}>{parte}</span>,
          )}
        </span>
      ))}
    </>
  );
}

function BolhaDoChat({ m, children }: { m: Mensagem; children?: ReactNode }) {
  const [copiado, setCopiado] = useState(false);
  if (m.autor === 'eu') {
    return (
      <div className="flex animate-fade-up justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-navy-900 px-3.5 py-2 text-sm text-white shadow-card">{m.texto}</p>
      </div>
    );
  }
  if (!m.texto && !children) return null;
  return (
    <div className="flex animate-fade-up items-end gap-2">
      <OrbeDoNeo tamanho="sm" />
      <div className="min-w-0 max-w-[88%] space-y-2">
        {m.texto ? (
          <div className="group relative rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-sm leading-relaxed text-ink-900 shadow-card">
            <TextoComNegrito texto={m.texto} />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(m.texto.replace(/\*\*/g, '*')).then(() => {
                  setCopiado(true);
                  window.setTimeout(() => setCopiado(false), 1500);
                });
              }}
              aria-label="Copiar a mensagem"
              className="absolute -right-2 -bottom-2 flex size-7 items-center justify-center rounded-full border border-line bg-surface text-ink-500 opacity-0 shadow-card transition-opacity group-hover:opacity-100 focus:opacity-100"
            >
              {copiado ? '✓' : <Copy aria-hidden="true" className="size-3.5" />}
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */

/** Um "print" no chat: o quadro da secao, a tendencia ou os lideres — com o botao de baixar em PNG. */
function PrintNoChat({
  print,
  radar,
  secao,
  secoes,
  esquerda,
  direita,
  titulo,
}: {
  print: Print;
  radar: Radar;
  secao: SecaoNoDuelo | null;
  secoes: SecaoNoDuelo[];
  esquerda: CandidatoNoRaioX[];
  direita: CandidatoNoRaioX[];
  titulo: string;
}) {
  const [baixando, setBaixando] = useState(false);
  let corpo: ReactNode = null;
  let svg: (() => string) | null = null;
  let nome = 'print-neo';
  if (print.tipo === 'secao' && secao) {
    corpo = <QuadroDaSecao s={secao} esquerda={esquerda} direita={direita} achado={print.achado} />;
    svg = () => svgDaSecao(secao, esquerda, direita, titulo, print.achado);
    nome = `neo-secao-${secao.secao ?? 'x'}`;
  } else if (print.tipo === 'tendencia') {
    corpo = <QuadroDaTendencia secoes={secoes} esquerda={esquerda} direita={direita} radar={radar} />;
  } else if (print.tipo === 'lideres') {
    corpo = <QuadroDosLideres radar={radar} />;
  }
  if (!corpo) return null;
  return (
    <figure className="animate-fade-up overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <figcaption className="flex items-center justify-between gap-2 border-b border-line bg-ink-50 px-3 py-1.5 text-[0.625rem] font-bold tracking-[0.12em] text-ink-500 uppercase">
        <span className="flex items-center gap-1">📸 Print do NEO</span>
        {svg ? (
          <button
            type="button"
            disabled={baixando}
            onClick={() => {
              setBaixando(true);
              void baixarPng(svg!(), nome).finally(() => setBaixando(false));
            }}
            className="inline-flex items-center gap-1 rounded-pill bg-navy-900 px-2 py-0.5 text-[0.625rem] font-bold tracking-normal text-gold-400 normal-case hover:bg-navy-800"
          >
            <Download aria-hidden="true" className="size-3" /> {baixando ? 'gerando…' : 'Baixar PNG'}
          </button>
        ) : null}
      </figcaption>
      <div className="p-3">{corpo}</div>
    </figure>
  );
}

/** O quadro de uma secao, como na lista "Seção por seção", com o alerta marcado. */
function QuadroDaSecao({
  s,
  esquerda,
  direita,
  achado,
}: {
  s: SecaoNoDuelo;
  esquerda: CandidatoNoRaioX[];
  direita: CandidatoNoRaioX[];
  achado?: Achado;
}) {
  const maior = Math.max(1, s.estimativa, ...s.esquerda, ...s.direita);
  const total = s.totalEsquerda + s.totalDireita;
  const linha = (c: CandidatoNoRaioX, v: number, k: string) => {
    const { cargo } = candidatoDoRotulo(c.nome, c.rotulo);
    const zerou = v === 0 && s.estimativa >= 5;
    const espelho = v > 0 && s.estimativa >= 5 && Math.abs(v - s.estimativa) <= Math.max(1, Math.round(s.estimativa * 0.15));
    return (
      <div key={k}>
        <div className="flex items-center gap-1.5 pl-8 text-[0.625rem] leading-tight">
          <span className="truncate font-bold text-ink-900">{c.nome}</span>
          {cargo ? <span className="shrink-0 text-ink-500">· {cargo}</span> : null}
          {total > 0 ? <span className="ml-auto shrink-0 text-ink-500 tabular-nums">{pct((v / total) * 100)}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 rounded-full ring-2" style={{ '--tw-ring-color': c.cor } as CSSProperties}>
            <FotoDoCandidato cargo={c.cargo} sqcand={null} src={c.foto} nome={c.nome} tamanho="xs" className="ring-0" />
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-pill bg-ink-100">
            <span className="block h-full rounded-pill" style={{ width: `${v > 0 ? Math.max(3, (v / maior) * 100) : 0}%`, background: c.cor }} />
          </span>
          <span
            className={cn(
              'w-12 text-right text-xs font-bold tabular-nums',
              zerou ? 'text-danger-700' : espelho ? 'rounded bg-gold-400 px-1 text-navy-900' : 'text-ink-900',
            )}
          >
            {zerou ? '⚠ 0' : formatNumber(v)}
          </span>
        </div>
      </div>
    );
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink-900">
          Seção {s.secao ?? '?'} <span className="text-xs font-normal text-ink-500">· Zona {s.zona ?? '?'}</span>
        </p>
        {s.vencedor === 'DIREITA' || s.vencedor === 'ESQUERDA' ? (
          <span
            className={cn(
              'rounded-pill px-2 py-0.5 text-[0.5625rem] font-bold tracking-wide text-white uppercase',
              s.vencedor === 'ESQUERDA' ? 'bg-[#2a78d6]' : 'bg-[#e5484d]',
            )}
          >
            {s.vencedor === 'ESQUERDA' ? 'venceu' : 'perdeu'} · {s.totalEsquerda} × {s.totalDireita}
          </span>
        ) : null}
      </div>
      <div>
        <p className="pl-8 text-[0.625rem] font-bold text-navy-900">Gente do time</p>
        <div className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-900 text-gold-400">
            <Users aria-hidden="true" className="size-3.5" />
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-pill bg-ink-100">
            <span className="block h-full rounded-pill bg-navy-800" style={{ width: `${(s.estimativa / maior) * 100}%` }} />
          </span>
          <span className="w-12 text-right text-xs font-bold text-ink-900 tabular-nums">{formatNumber(s.estimativa)}</span>
        </div>
      </div>
      {esquerda.map((c, i) => linha(c, s.esquerda[i] ?? 0, `e${i}`))}
      {direita.length ? (
        <p className="flex items-center gap-2 text-[0.5625rem] font-bold tracking-[0.14em] text-[#e5484d] uppercase" aria-hidden="true">
          <span className="h-px flex-1 bg-[#e5484d]/30" />× adversários<span className="h-px flex-1 bg-[#e5484d]/30" />
        </p>
      ) : null}
      {direita.map((c, j) => linha(c, s.direita[j] ?? 0, `d${j}`))}
      {achado ? (
        <p
          className={cn(
            'mt-1 flex items-start gap-1.5 rounded-control px-2 py-1.5 text-[0.6875rem] font-semibold',
            achado.gravidade === 'alta' ? 'bg-danger-50 text-danger-700' : achado.gravidade === 'media' ? 'bg-gold-50 text-gold-700' : 'bg-success-50 text-success-700',
          )}
        >
          <AlertTriangle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {achado.titulo}
        </p>
      ) : null}
    </div>
  );
}

/** A tendencia: as secoes da que tem mais gente do time para a que tem menos, com o melhor nosso e o melhor adversario. */
function QuadroDaTendencia({
  secoes,
  esquerda,
  direita,
  radar,
}: {
  secoes: SecaoNoDuelo[];
  esquerda: CandidatoNoRaioX[];
  direita: CandidatoNoRaioX[];
  radar: Radar;
}) {
  const ordenadas = [...secoes].filter((s) => s.estimativa > 0).sort((a, b) => b.estimativa - a.estimativa).slice(0, 10);
  const melhor = (lado: 'nosso' | 'adversario') =>
    radar.tendencias.filter((t) => t.lado === lado).sort((a, b) => (b.correlacao ?? -2) - (a.correlacao ?? -2))[0];
  const nosso = melhor('nosso');
  const adv = melhor('adversario');
  const iN = esquerda.findIndex((c) => c.nome === nosso?.nome);
  const iA = direita.findIndex((c) => c.nome === adv?.nome);
  const maior = Math.max(1, ...ordenadas.map((s) => Math.max(s.estimativa, s.esquerda[iN] ?? 0, s.direita[iA] ?? 0)));
  return (
    <div>
      <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.625rem] font-semibold text-ink-500">
        <span className="flex items-center gap-1">
          <TrendingUp aria-hidden="true" className="size-3" /> da seção com mais gente para a com menos
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-navy-800" /> time
        </span>
        {nosso ? (
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-sm" style={{ background: esquerda[iN]?.cor }} /> {curto(nosso.nome)} {nosso.correlacao !== null ? `(r ${nosso.correlacao.toFixed(2)})` : ''}
          </span>
        ) : null}
        {adv && iA >= 0 ? (
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-sm" style={{ background: direita[iA]?.cor }} /> {curto(adv.nome)} {adv.correlacao !== null ? `(r ${adv.correlacao.toFixed(2)})` : ''}
          </span>
        ) : null}
      </p>
      <ul className="space-y-1">
        {ordenadas.map((s) => (
          <li key={s.chave} className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2">
            <span className="text-[0.625rem] font-bold text-ink-700 tabular-nums">S {s.secao}</span>
            <span className="space-y-px">
              {[
                { v: s.estimativa, cor: '#1e2f4d' },
                ...(iN >= 0 ? [{ v: s.esquerda[iN] ?? 0, cor: esquerda[iN].cor }] : []),
                ...(iA >= 0 ? [{ v: s.direita[iA] ?? 0, cor: direita[iA].cor }] : []),
              ].map((b, k) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="h-1.5 rounded-pill" style={{ width: `${Math.max(b.v > 0 ? 2 : 0, (b.v / maior) * 100)}%`, background: b.cor }} />
                  <span className="text-[0.5625rem] text-ink-500 tabular-nums">{b.v}</span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Os lideres das secoes com alerta, de quem tem mais gente nelas para quem tem menos. */
function QuadroDosLideres({ radar }: { radar: Radar }) {
  const porLider = new Map<string, { secoes: string[]; pessoas: number }>();
  for (const a of radar.achados) {
    if (a.gravidade === 'boa' || !a.lider) continue;
    const atual = porLider.get(a.lider.nome) ?? { secoes: [], pessoas: 0 };
    if (!atual.secoes.includes(a.numeroDaSecao ?? '?')) atual.secoes.push(a.numeroDaSecao ?? '?');
    atual.pessoas += a.lider.pessoas;
    porLider.set(a.lider.nome, atual);
  }
  const lista = [...porLider.entries()].sort((a, b) => b[1].pessoas - a[1].pessoas).slice(0, 6);
  const maior = Math.max(1, ...lista.map(([, v]) => v.pessoas));
  return (
    <ul className="space-y-2">
      {lista.map(([nome, v], i) => (
        <li key={nome} className="flex items-center gap-2">
          <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold', i === 0 ? 'bg-danger-600 text-white' : 'bg-ink-100 text-ink-700')}>
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-ink-900">{nome}</span>
            <span className="mt-0.5 block h-1.5 overflow-hidden rounded-pill bg-ink-100">
              <span className="block h-full rounded-pill bg-danger-600" style={{ width: `${(v.pessoas / maior) * 100}%` }} />
            </span>
            <span className="text-[0.625rem] text-ink-500">seções {v.secoes.join(', ')}</span>
          </span>
          <span className="text-right text-sm font-black text-danger-700 tabular-nums">{v.pessoas}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------------- */

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * O print da secao em SVG (desenhado so com numeros e textos: nada de foto
 * de fora, que travaria o canvas), para virar PNG e ir para o WhatsApp.
 */
function svgDaSecao(s: SecaoNoDuelo, esquerda: CandidatoNoRaioX[], direita: CandidatoNoRaioX[], titulo: string, achado?: Achado): string {
  const L = 640;
  const linhas: { rotulo: string; v: number; cor: string; separador?: boolean }[] = [
    { rotulo: 'Gente do time', v: s.estimativa, cor: '#1e2f4d' },
    ...esquerda.map((c, i) => ({ rotulo: `${c.nome} · ${candidatoDoRotulo(c.nome, c.rotulo).cargo ?? ''}`, v: s.esquerda[i] ?? 0, cor: c.cor })),
    ...direita.map((c, j) => ({ rotulo: `${c.nome} · ${candidatoDoRotulo(c.nome, c.rotulo).cargo ?? ''}`, v: s.direita[j] ?? 0, cor: c.cor, separador: j === 0 })),
  ];
  const maior = Math.max(1, ...linhas.map((l) => l.v));
  let y = 152;
  const corpo = linhas
    .map((l) => {
      let bloco = '';
      if (l.separador) {
        bloco += `<text x="${L / 2}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#e5484d" letter-spacing="2">× ADVERSÁRIOS</text>`;
        y += 22;
      }
      const w = l.v > 0 ? Math.max(6, (l.v / maior) * 470) : 0;
      bloco += `<text x="32" y="${y}" font-size="13" font-weight="700" fill="#0f1e35">${esc(l.rotulo)}</text>`;
      bloco += `<rect x="32" y="${y + 8}" width="470" height="12" rx="6" fill="#e8edf3"/>`;
      bloco += `<rect x="32" y="${y + 8}" width="${w}" height="12" rx="6" fill="${l.cor}"/>`;
      bloco += `<text x="${L - 32}" y="${y + 19}" text-anchor="end" font-size="18" font-weight="800" fill="${l.v === 0 && s.estimativa >= 5 ? '#b42318' : '#0f1e35'}">${l.v}</text>`;
      y += 46;
      return bloco;
    })
    .join('');
  const alerta = achado
    ? `<rect x="24" y="${y}" width="${L - 48}" height="40" rx="10" fill="${achado.gravidade === 'alta' ? '#fdecea' : '#fff7e0'}"/><text x="40" y="${y + 25}" font-size="13" font-weight="700" fill="${achado.gravidade === 'alta' ? '#b42318' : '#8a5a00'}">⚠ ${esc(achado.titulo)}</text>`
    : '';
  const altura = y + (achado ? 64 : 20) + 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${altura}" viewBox="0 0 ${L} ${altura}" font-family="Inter, Segoe UI, Arial, sans-serif">
<rect width="${L}" height="${altura}" rx="18" fill="#ffffff"/>
<rect width="${L}" height="80" rx="18" fill="#0f1e35"/><rect y="62" width="${L}" height="18" fill="#0f1e35"/>
<text x="32" y="34" font-size="12" font-weight="700" fill="#f2c14e" letter-spacing="2">NEO · SALA DE CONFRONTO</text>
<text x="32" y="60" font-size="18" font-weight="800" fill="#ffffff">${esc(titulo)}</text>
<text x="32" y="114" font-size="20" font-weight="800" fill="#0f1e35">Seção ${esc(s.secao ?? '?')} <tspan font-size="14" font-weight="600" fill="#64748b">· Zona ${esc(s.zona ?? '?')}</tspan></text>
<text x="${L - 32}" y="114" text-anchor="end" font-size="20" font-weight="900"><tspan fill="#2a78d6">${s.totalEsquerda}</tspan><tspan fill="#94a3b8"> × </tspan><tspan fill="#e5484d">${s.totalDireita}</tspan></text>
${corpo}${alerta}
<text x="${L - 32}" y="${altura - 14}" text-anchor="end" font-size="10" fill="#94a3b8">CMD · gerado pelo NEO</text>
</svg>`;
}

/** SVG -> PNG (2x, nitido no celular) -> download. */
async function baixarPng(svg: string, nome: string) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((ok, erro) => {
      img.onload = () => ok();
      img.onerror = () => erro(new Error('svg'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width * 2;
    canvas.height = img.height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${nome}.png`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
