import { Fragment } from 'react';
import { Document, Page, Text, View, pdf } from '@react-pdf/renderer';
import { appConfig } from '@/config/app.config';
import {
  conversao,
  leitura,
  lideresDoTime,
  type Confronto,
  type EscolaNoConfronto,
  type LeituraDoConfronto,
  type LiderNaEscola,
} from '@/lib/domain/confronto';
import { C, Cabecalho, Kpi, LinhaDeKpis, Rodape, Tabela, num, s, st } from './pdf-base';
import { FotoNoPdf } from './FotoNoPdf';

/**
 * Relatorio "Estimativa x apuracao": todas as escolas do time com o
 * candidato escolhido — o que o time esperava (pessoas cadastradas que votam
 * ali) e o que o candidato teve (votos apurados pelo TSE). Escola, zona e
 * secao.
 *
 * Montado no navegador, como os outros PDFs do mapa.
 */

export const OURO = '#e0a426';
export const OURO_TEXTO = '#7a5410';
export const OURO_FUNDO = '#fdf6e3';
export const VERDE = '#166534';
export const VERMELHO = '#b42318';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v).toLocaleString('pt-BR')}%`);

const LEITURA: Record<LeituraDoConfronto, { texto: string; cor: string; fundo: string }> = {
  ACIMA: { texto: 'Acima', cor: VERDE, fundo: '#e7f4ec' },
  PERTO: { texto: 'Perto', cor: OURO_TEXTO, fundo: OURO_FUNDO },
  ABAIXO: { texto: 'Abaixo', cor: VERMELHO, fundo: '#fdecea' },
  ZERADA: { texto: 'Zerada', cor: VERMELHO, fundo: '#fdecea' },
  SEM_ESTIMATIVA: { texto: '—', cor: C.faint, fundo: C.bg },
};

function Leitura({ e }: { e: Pick<EscolaNoConfronto, 'estimativa' | 'apurado'> }) {
  const l = LEITURA[leitura(e)];
  return (
    <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: l.cor, backgroundColor: l.fundo, paddingVertical: 1.5, paddingHorizontal: 4, borderRadius: 3 }}>
      {s(l.texto)}
    </Text>
  );
}

/** Duas barras finas: estimativa (azul-marinho) e apurado (ouro). */
function BarrasDuplas({ estimativa, apurado, maior }: { estimativa: number; apurado: number; maior: number }) {
  const largura = (v: number) => `${v > 0 ? Math.max(3, Math.round((v / Math.max(1, maior)) * 100)) : 0}%`;
  return (
    <View style={{ width: '100%' }}>
      <View style={{ height: 3.5, backgroundColor: '#e7ecf1', borderRadius: 2 }}>
        <View style={{ width: largura(estimativa), height: 3.5, backgroundColor: C.navy, borderRadius: 2 }} />
      </View>
      <View style={{ height: 3.5, backgroundColor: '#e7ecf1', borderRadius: 2, marginTop: 1.5 }}>
        <View style={{ width: largura(apurado), height: 3.5, backgroundColor: OURO, borderRadius: 2 }} />
      </View>
    </View>
  );
}

export function Parte({ numero, titulo, texto, quebra = false }: { numero: number; titulo: string; texto: string; quebra?: boolean }) {
  return (
    <View break={quebra} wrap={false} minPresenceAhead={60} style={{ marginTop: quebra ? 0 : 14, marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: OURO, justifyContent: 'center', alignItems: 'center', marginRight: 6 }}>
          <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.navy }}>{numero}</Text>
        </View>
        <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.navy }}>{s(titulo)}</Text>
      </View>
      <Text style={{ fontSize: 7.6, color: C.muted, marginTop: 3 }}>{s(texto)}</Text>
    </View>
  );
}

/** Nomes nunca quebram com hifen ("Sil-va"): ou cabem, ou viram reticencias. */
export const semHifen = (palavra: string) => [palavra];

/** "FÉLIX SILVA DE TARGINO" -> "Félix Silva de Targino". Nomes ja escritos a mao ficam como estao. */
const MIUDAS = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
export function nomeProprio(nome: string): string {
  if (nome !== nome.toUpperCase()) return nome;
  return nome
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((p, i) => (i > 0 && MIUDAS.has(p) ? p : p.replace(/\p{L}/u, (l) => l.toLocaleUpperCase('pt-BR'))))
    .join(' ')
    .replace('(líder)', '(Líder)');
}

const CINZA = '#c3ccd6';
export const TRILHO = '#edf1f5';

/**
 * A barra do lider: o comprimento e quanto ele cadastrou, relativo ao maior
 * da lista. Azul-marinho, a cor da estimativa no relatorio inteiro.
 */
function BarraDoLider({ cadastrados, escala }: { cadastrados: number; escala: number }) {
  const comprimento = cadastrados > 0 ? Math.max(4, (cadastrados / Math.max(1, escala)) * 100) : 0;
  return (
    <View style={{ height: 6, backgroundColor: TRILHO, borderRadius: 2 }}>
      <View style={{ width: `${comprimento}%`, height: 6, backgroundColor: C.navy, borderRadius: 2 }} />
    </View>
  );
}

/** Colunas dos lideres: as mesmas no cartao da escola e no ranking do time. */
const COL = { cadastrou: 64, parte: 70, barra: 150, escolas: 48 };
export const rotuloDaColuna = { fontSize: 5.8, fontFamily: 'Helvetica-Bold', color: C.faint, letterSpacing: 0.5 } as const;

export function CabecalhoDosLideres({ parteDe, comEscolas = false }: { parteDe: string; comEscolas?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 9, borderBottomWidth: 0.6, borderBottomColor: C.line }}>
      <Text style={[rotuloDaColuna, { flex: 1 }]}>{s('LÍDER')}</Text>
      {comEscolas ? <Text style={[rotuloDaColuna, { width: COL.escolas, textAlign: 'right' }]}>ESCOLAS</Text> : null}
      <Text style={[rotuloDaColuna, { width: COL.cadastrou, textAlign: 'right' }]}>CADASTROU</Text>
      <Text style={[rotuloDaColuna, { width: COL.parte, textAlign: 'right' }]}>{s(parteDe.toUpperCase())}</Text>
      <View style={{ width: COL.barra, paddingLeft: 14 }} />
    </View>
  );
}

export function LinhaDoLider({
  l,
  escala,
  total,
  posicao,
  ultima,
}: {
  l: Pick<LiderNaEscola, 'lider' | 'cadastrados' | 'semSecao'> & { escolas?: number };
  escala: number;
  /** A estimativa de que o lider e parte: a da escola, ou a do time. */
  total: number;
  posicao?: number;
  ultima: boolean;
}) {
  const semLider = l.lider === 'Sem líder informado';
  return (
    <View
      wrap={false}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4.5, paddingHorizontal: 9, borderBottomWidth: ultima ? 0 : 0.5, borderBottomColor: '#e6ebf0' }}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 6 }}>
        {posicao !== undefined ? <Text style={{ width: 16, fontSize: 7, color: C.faint, fontFamily: 'Helvetica-Bold' }}>{posicao}</Text> : null}
        <View style={{ flex: 1 }}>
          <Text
            hyphenationCallback={semHifen}
            style={{ fontSize: 8.2, fontFamily: semLider ? 'Helvetica-Oblique' : 'Helvetica-Bold', color: semLider ? C.muted : C.ink, maxLines: 1, textOverflow: 'ellipsis' }}
          >
            {s(nomeProprio(l.lider))}
          </Text>
          {l.semSecao > 0 ? (
            <Text style={{ fontSize: 6.2, color: C.faint, marginTop: 1 }}>{s(`${num(l.semSecao)} sem seção no cadastro`)}</Text>
          ) : null}
        </View>
      </View>
      {l.escolas !== undefined ? <Text style={{ width: COL.escolas, textAlign: 'right', fontSize: 8.5, color: C.ink2 }}>{num(l.escolas)}</Text> : null}
      <Text style={{ width: COL.cadastrou, textAlign: 'right', fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.navy }}>{num(l.cadastrados)}</Text>
      <Text style={{ width: COL.parte, textAlign: 'right', fontSize: 8.5, color: C.ink2 }}>{pct(total > 0 ? (l.cadastrados / total) * 100 : null)}</Text>
      <View style={{ width: COL.barra, paddingLeft: 14 }}>
        <BarraDoLider cadastrados={l.cadastrados} escala={escala} />
      </View>
    </View>
  );
}

/** Um numero grande com o rotulo em cima: o placar do cartao da escola. */
function Placar({ rotulo, valor, cor, largura = 58 }: { rotulo: string; valor: string; cor: string; largura?: number }) {
  return (
    <View style={{ width: largura, alignItems: 'flex-end' }}>
      <Text style={rotuloDaColuna}>{s(rotulo)}</Text>
      <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: cor, marginTop: 1.5 }}>{valor}</Text>
    </View>
  );
}

export const corDaConversao = (c: number | null) => (c === null ? C.faint : c >= 100 ? VERDE : c >= 80 ? OURO_TEXTO : VERMELHO);

/**
 * O cartao da escola na parte 1: o placar (estimativa, apurado, conversao)
 * e, logo abaixo, os lideres que cadastraram gente ali.
 */
function CartaoDaEscola({ e, posicao, lideres }: { e: EscolaNoConfronto; posicao: number; lideres: LiderNaEscola[] }) {
  const c = conversao(e);
  const secoes = e.secoes.filter((x) => x.zona || x.secao).length;
  const escala = Math.max(1, ...lideres.map((l) => l.cadastrados));
  const l = LEITURA[leitura(e)];
  return (
    <View
      wrap={lideres.length > 14}
      style={{ borderWidth: 0.7, borderColor: C.line, borderRadius: 5, marginBottom: 8, overflow: 'hidden' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f6f8fb', paddingVertical: 8, paddingLeft: 9, paddingRight: 10 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: C.navy, justifyContent: 'center', alignItems: 'center', marginRight: 8 }}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: OURO }}>{posicao}</Text>
        </View>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text hyphenationCallback={semHifen} style={{ fontSize: 9.6, fontFamily: 'Helvetica-Bold', color: C.navy, maxLines: 2, textOverflow: 'ellipsis' }}>
            {s(e.titulo)}
          </Text>
          <Text style={{ fontSize: 6.8, color: C.faint, marginTop: 2 }}>
            {s(
              [
                e.cidade,
                `Zona ${zonasDe(e)}`,
                secoes ? `${num(secoes)} ${secoes === 1 ? 'seção' : 'seções'}` : null,
                lideres.length ? `${num(lideres.length)} ${lideres.length === 1 ? 'líder' : 'líderes'}` : null,
              ]
                .filter(Boolean)
                .join('  ·  '),
            )}
          </Text>
        </View>
        <Placar rotulo="ESTIMATIVA" valor={num(e.estimativa)} cor={C.navy} />
        <Placar rotulo="APURADO" valor={num(e.apurado)} cor={OURO_TEXTO} />
        <Placar rotulo="CONVERSÃO" valor={pct(c)} cor={corDaConversao(c)} largura={62} />
        <View style={{ width: 52, alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: l.cor, backgroundColor: l.fundo, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3 }}>
            {s(l.texto.toUpperCase())}
          </Text>
        </View>
      </View>
      {/* A conversao como uma linha fina sob o placar: cheia em 100%. */}
      <View style={{ height: 2.2, backgroundColor: TRILHO }}>
        <View style={{ width: `${Math.min(100, c ?? 0)}%`, height: 2.2, backgroundColor: corDaConversao(c) }} />
      </View>
      {lideres.length > 0 ? (
        <View>
          <CabecalhoDosLideres parteDe="da escola" />
          {lideres.map((x, i) => (
            <LinhaDoLider key={x.lider} l={x} escala={escala} total={e.estimativa} ultima={i === lideres.length - 1} />
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: 7, color: C.faint, paddingVertical: 5, paddingHorizontal: 9 }}>{s('Sem líder informado nos cadastros desta escola.')}</Text>
      )}
    </View>
  );
}

/**
 * Lideres x secoes, dentro da escola: quantas pessoas cada lider cadastrou
 * em cada secao, e na ultima linha os votos do candidato na secao. Em
 * vermelho, a celula em que o lider cadastrou mais gente do que os votos que
 * o candidato teve ali — parte dessa gente certamente nao votou nele.
 */
const POR_BLOCO = 10;
function GradeDeLideres({ escola, lideres, candidato }: { escola: EscolaNoConfronto; lideres: LiderNaEscola[]; candidato: string }) {
  const secoes = escola.secoes.filter((x) => x.zona && x.secao);
  const comSecao = lideres.filter((l) => l.secoes.length > 0);
  if (comSecao.length === 0 || secoes.length === 0) return null;
  const variasZonas = new Set(secoes.map((x) => x.zona)).size > 1;
  const blocos: (typeof secoes)[] = [];
  for (let i = 0; i < secoes.length; i += POR_BLOCO) blocos.push(secoes.slice(i, i + POR_BLOCO));
  const celula = { width: 34, textAlign: 'right' as const };

  return (
    <View style={{ marginTop: 6 }}>
      {blocos.map((bloco, b) => {
        const ultimo = b === blocos.length - 1;
        return (
          // O titulo vai junto do primeiro bloco: nunca fica sozinho no pe da pagina.
          <View key={b} wrap={false}>
            {b === 0 ? (
              <>
                <Text style={{ fontSize: 7.4, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 1 }}>{s('Líderes × seções')}</Text>
                <Text style={{ fontSize: 6.6, color: C.faint, marginBottom: 3 }}>
                  {s(`Pessoas que cada líder cadastrou em cada seção. Em vermelho: mais cadastrados do que os votos de ${nomeProprio(candidato)} na seção.`)}
                </Text>
              </>
            ) : null}
          <View style={{ borderWidth: 0.6, borderColor: C.line, borderRadius: 3, marginBottom: 4, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#f6f8fb', paddingVertical: 3.5, paddingHorizontal: 7 }}>
              <Text style={[rotuloDaColuna, { flex: 1 }]}>{s('LÍDER')}</Text>
              {bloco.map((x) => (
                <View key={`${x.zona}/${x.secao}`} style={{ width: celula.width, alignItems: 'flex-end' }}>
                  {variasZonas ? <Text style={{ fontSize: 5.2, color: C.faint }}>{s(`Z ${x.zona}`)}</Text> : null}
                  <Text style={rotuloDaColuna}>{s(`SEÇ. ${x.secao}`)}</Text>
                </View>
              ))}
              {ultimo ? <Text style={[rotuloDaColuna, { width: 40, textAlign: 'right' }]}>TOTAL</Text> : null}
            </View>
            {comSecao.map((l, i) => {
              const minha = new Map(l.secoes.map((x) => [`${x.zona}/${x.secao}`, x.cadastrados]));
              return (
                <View key={l.lider} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3, paddingHorizontal: 7, backgroundColor: i % 2 ? '#fafbfc' : C.white }}>
                  <Text hyphenationCallback={semHifen} style={{ flex: 1, fontSize: 7.4, fontFamily: 'Helvetica-Bold', color: C.ink, maxLines: 1, textOverflow: 'ellipsis', paddingRight: 4 }}>
                    {s(nomeProprio(l.lider))}
                  </Text>
                  {bloco.map((x) => {
                    const n = minha.get(`${x.zona}/${x.secao}`) ?? 0;
                    const acima = n > x.apurado;
                    return (
                      <Text
                        key={`${x.zona}/${x.secao}`}
                        style={[celula, { fontSize: 7.8, fontFamily: n > 0 ? 'Helvetica-Bold' : 'Helvetica', color: n === 0 ? CINZA : acima ? VERMELHO : C.ink2 }]}
                      >
                        {n > 0 ? num(n) : '·'}
                      </Text>
                    );
                  })}
                  {ultimo ? (
                    <Text style={{ width: 40, textAlign: 'right', fontSize: 7.8, fontFamily: 'Helvetica-Bold', color: C.navy }}>
                      {num(l.cadastrados - l.semSecao)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3.5, paddingHorizontal: 7, backgroundColor: OURO_FUNDO, borderTopWidth: 0.6, borderTopColor: '#efd9a4' }}>
              <Text hyphenationCallback={semHifen} style={{ flex: 1, fontSize: 7, fontFamily: 'Helvetica-Bold', color: OURO_TEXTO, maxLines: 1, textOverflow: 'ellipsis', paddingRight: 4 }}>
                {s(`Votos de ${nomeProprio(candidato)}`)}
              </Text>
              {bloco.map((x) => (
                <Text key={`${x.zona}/${x.secao}`} style={[celula, { fontSize: 7.8, fontFamily: 'Helvetica-Bold', color: OURO_TEXTO }]}>
                  {num(x.apurado)}
                </Text>
              ))}
              {ultimo ? (
                <Text style={{ width: 40, textAlign: 'right', fontSize: 7.8, fontFamily: 'Helvetica-Bold', color: OURO_TEXTO }}>
                  {num(secoes.reduce((t, x) => t + x.apurado, 0))}
                </Text>
              ) : null}
            </View>
          </View>
          </View>
        );
      })}
    </View>
  );
}

const zonasDe = (e: EscolaNoConfronto) => [...new Set(e.secoes.map((x) => x.zona).filter(Boolean))].join(', ') || '—';

export interface PdfDoConfrontoProps {
  confronto: Confronto;
  /** "Fulano (15123) · Deputado Estadual · 1º turno". */
  candidato: string;
  /** So o nome, para as frases: "PAULO teve 3 votos". */
  candidatoNome?: string;
  /** Escola (chave) -> quem cada Lider cadastrou ali, secao por secao. */
  lideres?: Record<string, LiderNaEscola[]>;
  /** Foto oficial do candidato (data URL); sem ela, as iniciais. */
  foto?: string | null;
  geradoEm: string;
}

export function PdfDoConfronto({ confronto, candidato, candidatoNome, lideres = {}, foto = null, geradoEm }: PdfDoConfrontoProps) {
  const { doTime, estimativaTotal, apuradoNasEscolasDoTime, apuradoTotal } = confronto;
  const nome = candidatoNome ?? candidato.split(' (')[0];
  const doTimeTodo = lideresDoTime(doTime.map((e) => lideres[e.chave] ?? [])).sort(
    (a, b) => b.cadastrados - a.cadastrados || a.lider.localeCompare(b.lider, 'pt-BR'),
  );
  const conv = estimativaTotal > 0 ? (apuradoNasEscolasDoTime / estimativaTotal) * 100 : null;
  const zeradas = doTime.filter((e) => leitura(e) === 'ZERADA').length;
  const acima = doTime.filter((e) => leitura(e) === 'ACIMA').length;
  const fora = confronto.escolas.filter((e) => e.estimativa === 0).slice(0, 40);
  const quando = new Date(geradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <Document title={s(`Estimativa x apuração · ${candidato}`)} author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda="Estimativa × apuração" direita={appConfig.shortName} />
        <Rodape texto={`Estimativa: cadastros do time. Apurado: TSE, seção por seção. Gerado em ${quando}.`} />

        {/* Capa: a faixa escura com o candidato e o time. */}
        <View style={{ backgroundColor: C.navy, borderRadius: 6, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
          <FotoNoPdf src={foto} nome={nome} tamanho={54} anel={OURO} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 7.5, letterSpacing: 1.5, color: OURO, fontFamily: 'Helvetica-Bold' }}>{s('ESTIMATIVA × APURAÇÃO · TSE')}</Text>
            <Text style={{ fontSize: 17, color: C.white, fontFamily: 'Helvetica-Bold', marginTop: 4, lineHeight: 1.2 }}>{s(candidato)}</Text>
          </View>
        </View>

        <LinhaDeKpis>
          <Kpi valor={num(estimativaTotal)} rotulo="votos estimados pelo time" nota={`${num(doTime.length)} escolas`} tom={C.navy} />
          <Kpi valor={num(apuradoNasEscolasDoTime)} rotulo="apurados nessas escolas" nota="votos do candidato (TSE)" tom={OURO} />
          <Kpi valor={pct(conv)} rotulo="conversão" nota="apurado ÷ estimativa" tom={conv !== null && conv >= 100 ? VERDE : conv !== null && conv >= 80 ? OURO : VERMELHO} />
          <Kpi valor={num(zeradas)} rotulo={zeradas === 1 ? 'escola zerada' : 'escolas zeradas'} nota={`${num(acima)} acima da estimativa`} tom={VERMELHO} />
        </LinhaDeKpis>

        <View style={{ flexDirection: 'row', backgroundColor: OURO_FUNDO, borderLeftWidth: 3, borderLeftColor: OURO, paddingVertical: 6, paddingHorizontal: 8, marginTop: 4, marginBottom: 6 }}>
          <Text style={{ fontSize: 7.8, color: C.ink2, lineHeight: 1.45 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s('Como ler: ')}</Text>
            {s(
              'a estimativa é o número de pessoas cadastradas pelo time que votam na escola (uma pessoa, um voto). O apurado são os votos do candidato contados pelo TSE, seção por seção. A conversão é o apurado dividido pela estimativa: passa de 100% quando o candidato tem voto de quem não está no cadastro. ',
            )}
            {apuradoTotal > apuradoNasEscolasDoTime
              ? s(`Fora das escolas do time, o candidato teve mais ${num(apuradoTotal - apuradoNasEscolasDoTime)} votos (parte ${(doTimeTodo.length > 0 ? 3 : 2) + (doTime.length > 0 ? 1 : 0)}).`)
              : ''}
          </Text>
        </View>

        <Parte
          numero={1}
          titulo="As escolas do time"
          texto="Da escola com a maior estimativa para a menor. Em cada uma, os líderes que cadastraram gente ali: quantas pessoas cada um cadastrou e quanto isso é da estimativa da escola."
        />
        {doTime.length > 0 ? null : <Text style={{ fontSize: 8.5, color: C.faint }}>{s('O time não tem estimativa em nenhuma escola deste recorte.')}</Text>}
        {doTime.map((e, i) => (
          <CartaoDaEscola key={e.chave} e={e} posicao={i + 1} lideres={lideres[e.chave] ?? []} />
        ))}

        {doTimeTodo.length > 0 ? (
          <>
            <Parte
              numero={2}
              titulo="Os líderes do time"
              texto="Quantas pessoas cada líder cadastrou nas escolas do time, em quantas escolas, e quanto isso é da estimativa do time. Do maior cadastro para o menor."
            />
            <View style={{ borderWidth: 0.7, borderColor: C.line, borderRadius: 5, overflow: 'hidden' }}>
              <View fixed>
                <CabecalhoDosLideres parteDe="do time" comEscolas />
              </View>
              {doTimeTodo.map((l, i) => (
                <LinhaDoLider
                  key={l.lider}
                  l={l}
                  posicao={i + 1}
                  escala={Math.max(1, ...doTimeTodo.map((x) => x.cadastrados))}
                  total={estimativaTotal}
                  ultima={i === doTimeTodo.length - 1}
                />
              ))}
            </View>
          </>
        ) : null}

        {doTime.length > 0 ? (
          <Parte
            numero={doTimeTodo.length > 0 ? 3 : 2}
            titulo="Escola por escola, seção por seção"
            texto="Em cada escola do time: a estimativa e o apurado de cada seção (diferença = apurado - estimativa) e, na grade, quantas pessoas cada líder cadastrou em cada seção."
            quebra
          />
        ) : null}
        {doTime.map((e, i) => {
          const c = conversao(e);
          return (
            <Fragment key={e.chave}>
              <View
                wrap={false}
                minPresenceAhead={70}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.navy, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8, marginTop: i === 0 ? 2 : 12, marginBottom: 4 }}
              >
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: OURO, justifyContent: 'center', alignItems: 'center', marginRight: 7 }}>
                  <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.navy }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.white }}>{s(e.titulo)}</Text>
                  <Text style={{ fontSize: 6.8, color: C.navy3, marginTop: 1 }}>{s([e.endereco, e.cidade].filter(Boolean).join(' · ') || '—')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.white }}>
                    {s(`${num(e.estimativa)} → ${num(e.apurado)}`)}
                  </Text>
                  <Text style={{ fontSize: 7, color: OURO, fontFamily: 'Helvetica-Bold', marginTop: 1 }}>{s(`conversão ${pct(c)}`)}</Text>
                </View>
              </View>
              <Tabela
                linhas={e.secoes}
                chave={(x, j) => `${x.zona}/${x.secao}/${j}`}
                colunas={[
                  { titulo: 'Zona', largura: '12%', celula: (x) => <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(x.zona ?? '—')}</Text> },
                  {
                    titulo: 'Seção',
                    largura: '16%',
                    celula: (x) => <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(x.zona || x.secao ? (x.secao ?? '—') : 'Sem zona/seção')}</Text>,
                  },
                  { titulo: 'Estimativa', largura: '14%', alinhar: 'right', celula: (x) => <Text style={{ color: C.navy, fontFamily: 'Helvetica-Bold' }}>{num(x.estimativa)}</Text> },
                  { titulo: 'Apurado', largura: '14%', alinhar: 'right', celula: (x) => <Text style={{ color: OURO_TEXTO, fontFamily: 'Helvetica-Bold' }}>{num(x.apurado)}</Text> },
                  {
                    titulo: 'Diferença',
                    largura: '14%',
                    alinhar: 'right',
                    celula: (x) => {
                      // Sem secao no cadastro, nao ha apuracao para comparar.
                      if (!x.zona && !x.secao) return <Text style={{ color: C.faint }}>—</Text>;
                      const d = x.apurado - x.estimativa;
                      return <Text style={{ color: d > 0 ? VERDE : d < 0 ? VERMELHO : C.muted, fontFamily: 'Helvetica-Bold' }}>{d > 0 ? `+${num(d)}` : num(d)}</Text>;
                    },
                  },
                  {
                    titulo: '',
                    largura: '18%',
                    celula: (x) => (
                      <View style={{ width: '100%', paddingLeft: 8 }}>
                        <BarrasDuplas estimativa={x.estimativa} apurado={x.apurado} maior={Math.max(...e.secoes.map((y) => Math.max(y.estimativa, y.apurado)))} />
                      </View>
                    ),
                  },
                  {
                    titulo: 'Leitura',
                    largura: '12%',
                    alinhar: 'center',
                    celula: (x) =>
                      x.zona || x.secao ? <Leitura e={x} /> : <Text style={{ fontSize: 6.6, color: C.faint }}>{s('sem seção')}</Text>,
                  },
                ]}
              />
              <GradeDeLideres escola={e} lideres={lideres[e.chave] ?? []} candidato={nome} />
            </Fragment>
          );
        })}

        {fora.length > 0 ? (
          <>
            <Parte
              numero={(doTimeTodo.length > 0 ? 3 : 2) + (doTime.length > 0 ? 1 : 0)}
              titulo="Votos fora da base do time"
              texto={`Escolas onde o candidato teve votos e o time não tinha estimativa — as ${num(fora.length)} com mais votos.`}
              quebra
            />
            <Tabela
              linhas={fora}
              chave={(e) => e.chave}
              colunas={[
                { titulo: '#', largura: '6%', celula: (_e, i) => String(i + 1) },
                { titulo: 'Escola', largura: '50%', celula: (e) => <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(e.titulo)}</Text> },
                { titulo: 'Cidade', largura: '20%', celula: (e) => s(e.cidade ?? '—') },
                { titulo: 'Zona', largura: '10%', celula: (e) => s(zonasDe(e)) },
                { titulo: 'Apurado', largura: '14%', alinhar: 'right', celula: (e) => <Text style={{ fontFamily: 'Helvetica-Bold', color: OURO_TEXTO }}>{num(e.apurado)}</Text> },
              ]}
            />
          </>
        ) : null}
      </Page>
    </Document>
  );
}

export async function gerarPdfDoConfronto(props: PdfDoConfrontoProps): Promise<Blob> {
  return pdf(<PdfDoConfronto {...props} />).toBlob();
}
