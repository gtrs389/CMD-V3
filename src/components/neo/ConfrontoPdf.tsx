import { Fragment } from 'react';
import { Document, Page, Text, View, pdf } from '@react-pdf/renderer';
import { appConfig } from '@/config/app.config';
import {
  conversao,
  fraseDoLider,
  leitura,
  lideresDoTime,
  type Confronto,
  type EscolaNoConfronto,
  type LeituraDoConfronto,
  type LiderNaEscola,
} from '@/lib/domain/confronto';
import { C, Cabecalho, Kpi, LinhaDeKpis, Rodape, Tabela, num, s, st } from './pdf-base';

/**
 * Relatorio "Estimativa x apuracao": todas as escolas do time com o
 * candidato escolhido — o que o time esperava (pessoas cadastradas que votam
 * ali) e o que o candidato teve (votos apurados pelo TSE). Escola, zona e
 * secao.
 *
 * Montado no navegador, como os outros PDFs do mapa.
 */

const OURO = '#e0a426';
const OURO_TEXTO = '#7a5410';
const OURO_FUNDO = '#fdf6e3';
const VERDE = '#166534';
const VERMELHO = '#b42318';

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

function Parte({ numero, titulo, texto, quebra = false }: { numero: number; titulo: string; texto: string; quebra?: boolean }) {
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

/**
 * Os lideres dentro de uma escola: quanto cada um cadastrou ali, em quais
 * secoes, e o teto de quem pode ter votado. Embaixo, a frase de cada lider
 * cujos votos ficaram abaixo do que ele cadastrou.
 */
function LideresNaEscola({ lideres, candidato }: { lideres: LiderNaEscola[]; candidato: string }) {
  if (lideres.length === 0) return null;
  const frases = lideres.map((l) => fraseDoLider(l, candidato)).filter((f): f is string => f !== null);
  return (
    <View style={{ marginTop: 5 }}>
      <Text style={{ fontSize: 7.4, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 3 }}>{s('Líderes nesta escola')}</Text>
      <Tabela
        linhas={lideres}
        chave={(l) => l.lider}
        colunas={[
          { titulo: 'Líder', largura: '30%', celula: (l) => <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(l.lider)}</Text> },
          { titulo: 'Cadastrou', largura: '11%', alinhar: 'right', celula: (l) => <Text style={{ fontFamily: 'Helvetica-Bold', color: C.navy }}>{num(l.cadastrados)}</Text> },
          {
            titulo: 'Por seção',
            largura: '33%',
            celula: (l) => (
              <Text style={{ fontSize: 7, color: C.muted, paddingLeft: 6 }}>
                {s(
                  [
                    ...l.secoes.map((x) => `Seção ${x.secao}: ${num(x.cadastrados)} (${num(x.apurado)} ${x.apurado === 1 ? 'voto' : 'votos'})`),
                    l.semSecao ? `sem seção: ${num(l.semSecao)}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · '),
                )}
              </Text>
            ),
          },
          { titulo: 'No máx. votaram', largura: '14%', alinhar: 'right', celula: (l) => <Text style={{ fontFamily: 'Helvetica-Bold', color: OURO_TEXTO }}>{num(l.noMaximo)}</Text> },
          {
            titulo: 'Não votaram (mín.)',
            largura: '12%',
            alinhar: 'right',
            celula: (l) => <Text style={{ fontFamily: 'Helvetica-Bold', color: l.perda > 0 ? VERMELHO : C.muted }}>{num(l.perda)}</Text>,
          },
        ]}
      />
      {frases.map((f) => (
        <View key={f} wrap={false} style={{ flexDirection: 'row', marginTop: 3, paddingLeft: 2 }}>
          <Text style={{ fontSize: 7.2, color: VERMELHO, marginRight: 4 }}>•</Text>
          <Text style={{ flex: 1, fontSize: 7.2, color: C.ink2, lineHeight: 1.35 }}>{s(f)}</Text>
        </View>
      ))}
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
  geradoEm: string;
}

export function PdfDoConfronto({ confronto, candidato, candidatoNome, lideres = {}, geradoEm }: PdfDoConfrontoProps) {
  const { doTime, estimativaTotal, apuradoNasEscolasDoTime, apuradoTotal } = confronto;
  const nome = candidatoNome ?? candidato.split(' (')[0];
  const doTimeTodo = lideresDoTime(doTime.map((e) => lideres[e.chave] ?? []));
  const conv = estimativaTotal > 0 ? (apuradoNasEscolasDoTime / estimativaTotal) * 100 : null;
  const zeradas = doTime.filter((e) => leitura(e) === 'ZERADA').length;
  const acima = doTime.filter((e) => leitura(e) === 'ACIMA').length;
  const fora = confronto.escolas.filter((e) => e.estimativa === 0).slice(0, 40);
  const maiorEscola = Math.max(1, ...doTime.map((e) => Math.max(e.estimativa, e.apurado)));
  const quando = new Date(geradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <Document title={s(`Estimativa x apuração · ${candidato}`)} author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda="Estimativa × apuração" direita={appConfig.shortName} />
        <Rodape texto={`Estimativa: cadastros do time. Apurado: TSE, seção por seção. Gerado em ${quando}.`} />

        {/* Capa: a faixa escura com o candidato e o time. */}
        <View style={{ backgroundColor: C.navy, borderRadius: 6, padding: 14, marginBottom: 12 }}>
          <Text style={{ fontSize: 7.5, letterSpacing: 1.5, color: OURO, fontFamily: 'Helvetica-Bold' }}>{s('ESTIMATIVA × APURAÇÃO · TSE')}</Text>
          <Text style={{ fontSize: 17, color: C.white, fontFamily: 'Helvetica-Bold', marginTop: 4, lineHeight: 1.2 }}>{s(candidato)}</Text>
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
              ? s(`Fora das escolas do time, o candidato teve mais ${num(apuradoTotal - apuradoNasEscolasDoTime)} votos (parte 3).`)
              : ''}
          </Text>
        </View>

        <Parte numero={1} titulo="As escolas do time" texto="Da escola com a maior estimativa para a menor. Barras: azul-marinho = estimativa, ouro = apurado." />
        <Tabela
          linhas={doTime}
          chave={(e) => e.chave}
          vazio="O time não tem estimativa em nenhuma escola deste recorte."
          colunas={[
            { titulo: '#', largura: '5%', celula: (_e, i) => String(i + 1) },
            {
              titulo: 'Escola',
              largura: '35%',
              celula: (e) => (
                <View>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(e.titulo)}</Text>
                  <Text style={{ fontSize: 6.6, color: C.faint, marginTop: 1 }}>
                    {s([e.cidade, `Zona ${zonasDe(e)}`].filter(Boolean).join(' · '))}
                  </Text>
                </View>
              ),
            },
            { titulo: 'Estimativa', largura: '11%', alinhar: 'right', celula: (e) => <Text style={{ fontFamily: 'Helvetica-Bold', color: C.navy }}>{num(e.estimativa)}</Text> },
            { titulo: 'Apurado', largura: '11%', alinhar: 'right', celula: (e) => <Text style={{ fontFamily: 'Helvetica-Bold', color: OURO_TEXTO }}>{num(e.apurado)}</Text> },
            {
              titulo: 'Comparação',
              largura: '18%',
              celula: (e) => (
                <View style={{ width: '100%', paddingLeft: 6 }}>
                  <BarrasDuplas estimativa={e.estimativa} apurado={e.apurado} maior={maiorEscola} />
                </View>
              ),
            },
            { titulo: 'Conv.', largura: '9%', alinhar: 'right', celula: (e) => <Text style={{ fontFamily: 'Helvetica-Bold' }}>{pct(conversao(e))}</Text> },
            { titulo: 'Leitura', largura: '11%', alinhar: 'center', celula: (e) => <Leitura e={e} /> },
          ]}
        />

        {doTimeTodo.length > 0 ? (
          <>
            <Parte
              numero={2}
              titulo="Os líderes do time"
              texto="Quantas pessoas cada líder cadastrou nas escolas do time, e quantas, no máximo, podem ter votado no candidato: em cada seção, o menor entre o que o líder cadastrou e os votos da seção. O voto é secreto; o número exato ninguém sabe, mas o teto é certo. Da maior perda para a menor."
            />
            <Tabela
              linhas={doTimeTodo}
              chave={(l) => l.lider}
              colunas={[
                { titulo: '#', largura: '5%', celula: (_l, i) => String(i + 1) },
                { titulo: 'Líder', largura: '35%', celula: (l) => <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(l.lider)}</Text> },
                { titulo: 'Escolas', largura: '10%', alinhar: 'right', celula: (l) => num(l.escolas) },
                { titulo: 'Cadastrou', largura: '12%', alinhar: 'right', celula: (l) => <Text style={{ fontFamily: 'Helvetica-Bold', color: C.navy }}>{num(l.cadastrados)}</Text> },
                { titulo: 'No máx. votaram', largura: '15%', alinhar: 'right', celula: (l) => <Text style={{ fontFamily: 'Helvetica-Bold', color: OURO_TEXTO }}>{num(l.noMaximo)}</Text> },
                {
                  titulo: 'Não votaram (mín.)',
                  largura: '15%',
                  alinhar: 'right',
                  celula: (l) => <Text style={{ fontFamily: 'Helvetica-Bold', color: l.perda > 0 ? VERMELHO : C.muted }}>{num(l.perda)}</Text>,
                },
                { titulo: 'Sem seção', largura: '8%', alinhar: 'right', celula: (l) => <Text style={{ color: C.faint }}>{num(l.semSecao)}</Text> },
              ]}
            />
          </>
        ) : null}

        {doTime.length > 0 ? (
          <Parte
            numero={doTimeTodo.length > 0 ? 3 : 2}
            titulo="Escola por escola, seção por seção"
            texto="Em cada escola do time: a estimativa e o apurado de cada seção (diferença = apurado - estimativa), e quem cada líder cadastrou ali."
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
              <LideresNaEscola lideres={lideres[e.chave] ?? []} candidato={nome} />
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
