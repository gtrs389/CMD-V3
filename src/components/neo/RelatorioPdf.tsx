import { Circle, Document, Page, Path, Rect, Svg, Text, View, pdf } from '@react-pdf/renderer';
import type { Dossie, LiderNoDossie, PessoaNoDossie } from '@/lib/domain/dossie';
import type { AnaliseDoNeo } from '@/lib/domain/neo';
import { analiseAutomatica } from '@/lib/domain/leitura-automatica';
import { nomeDaPendencia, nomeDoProblemaDaFicha, nomesDasFaltas } from '@/lib/domain/filtros-de-dados';
import {
  Anel,
  Barras,
  C,
  Cabecalho,
  CartaoRepetido,
  Chip,
  Kpi,
  LinhaDeKpis,
  Paragrafos,
  Rodape,
  Secao,
  TOM_GRAVIDADE,
  TOM_SELO,
  Tabela,
  data,
  dataLonga,
  num,
  s,
  slug,
  st,
  telefone,
} from './pdf-base';

export {
  ListaFiltrada,
  gerarPdfDaLista,
  type ListaFiltradaProps,
  type PessoaDaLista,
} from './ListasPdf';

/**
 * Relatorio Estrategico de Mobilizacao — o documento que vai para a direcao.
 *
 * Quem le e o dirigente partidario: pouco tempo, muita decisao. Por isso a
 * ordem e a de uma consultoria, e nao a de uma tela do sistema:
 *
 *   capa           o time, a frase-titulo e os quatro numeros que importam;
 *   01 sumario     a carta a direcao, o Indice de Mobilizacao (com os
 *                  componentes) e as conclusoes-chave;
 *   02 rede        piramide, ativacao, engajamento, concentracao, a
 *                  trajetoria de 12 semanas e o cenario de 30/60/90 dias;
 *   03 liderancas  podio, a leitura de quem importa e o ranking inteiro;
 *   04 territorio  bairros, zonas, secoes e a qualificacao eleitoral;
 *   05 integridade base declarada x base liquida e o quadro das pendencias;
 *   06 recomendac. o que fazer, quem, ate quando, e o que cabe a direcao;
 *   anexos         pendencias com nome, a nominata por lideranca e a nota
 *                  metodologica.
 *
 * Os NUMEROS saem do dossie, nunca do texto: o NEO interpreta, o desenho
 * conta. Sem o NEO, os textos vem da leitura automatica — o documento sai
 * com a mesma estrutura, apresentavel, e nunca com um buraco.
 *
 * Montado NO NAVEGADOR de quem pediu: a nominata, com telefone, nao passa
 * por servidor de PDF nenhum.
 */

/* -------------------------------------------------------------------------
   Capa
   ------------------------------------------------------------------------- */

function Capa({ dossie, analise }: { dossie: Dossie; analise: AnaliseDoNeo }) {
  const e = dossie.estrategia;
  const kpis: [string, string, string?][] = [
    [num(e.baseLiquida), 'base mobilizada', e.duplicados ? `${num(e.baseDeclarada)} declarados` : undefined],
    [num(dossie.numeros.lideres), 'lideranças', `${num(dossie.numeros.lideresAtivos)} com base própria`],
    [String(e.indice.valor), 'Índice de Mobilização', e.indice.rotulo],
    [num(dossie.numeros.ultimos30), 'novos em 30 dias', `${dossie.numeros.ritmo30.toLocaleString('pt-BR')} por dia`],
  ];
  return (
    <Page size="A4" style={{ backgroundColor: C.navy, color: C.white, padding: 0, fontFamily: 'Helvetica' }}>
      {/* Fundo: desenho, nao dado. A4 tem 595,28 x 841,89 pontos — um fundo
          de 842 transbordaria para uma segunda pagina. */}
      <Svg viewBox="0 0 595 841" style={{ position: 'absolute', top: 0, left: 0, width: 595, height: 841 }}>
        <Path d="M 395 0 L 595 0 L 595 841 L 205 841 Z" fill={C.navy2} />
        <Path d="M 520 0 L 595 0 L 595 190 Z" fill={C.gold} />
      </Svg>

      <View style={{ paddingHorizontal: 48, paddingTop: 50, flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', letterSpacing: 4 }}>NEO</Text>
            <Text style={{ fontSize: 6.8, color: C.navy3, letterSpacing: 2, marginTop: 2 }}>INTELIGÊNCIA DE MOBILIZAÇÃO</Text>
          </View>
          <Text style={{ fontSize: 7, color: '#c9d4e3', letterSpacing: 2, fontFamily: 'Helvetica-Bold', marginTop: 6, marginRight: 86 }}>RESERVADO</Text>
        </View>

        <Text style={{ marginTop: 150, fontSize: 9, letterSpacing: 3.4, color: C.gold, fontFamily: 'Helvetica-Bold' }}>
          RELATÓRIO ESTRATÉGICO DE MOBILIZAÇÃO
        </Text>
        <View style={{ width: 46, height: 2.4, backgroundColor: C.gold, marginTop: 14 }} />
        <Text style={{ fontSize: 36, fontFamily: 'Helvetica-Bold', marginTop: 16, lineHeight: 1.08, width: 440 }}>
          {s(dossie.time.nome)}
        </Text>
        <Text style={{ fontSize: 10.5, color: C.navy3, marginTop: 10 }}>
          {s(`${dossie.time.municipios.join(', ')} / ${dossie.time.uf} · ${dataLonga(dossie.geradoEm)}`)}
        </Text>

        <Text style={{ marginTop: 40, fontFamily: 'Times-Italic', fontSize: 17, lineHeight: 1.38, width: 400, color: '#f2f5fa' }}>
          {s(`“${analise.manchete}”`)}
        </Text>

        {/* O que o documento traz: a direcao sabe onde procurar. */}
        <View style={{ marginTop: 44, width: 330 }}>
          <Text style={{ fontSize: 6.8, color: C.gold, letterSpacing: 2, fontFamily: 'Helvetica-Bold', marginBottom: 6 }}>NESTE RELATÓRIO</Text>
          {[
            ['01', 'Sumário executivo'],
            ['02', 'A força da rede'],
            ['03', 'Lideranças'],
            ['04', 'Presença territorial'],
            ['05', 'Integridade da base'],
            ['06', 'Recomendações estratégicas'],
            ['A · B', 'Pendências nominais e nominata da rede'],
          ].map(([n, t]) => (
            <View key={n} style={{ flexDirection: 'row', paddingVertical: 2.6, borderBottomWidth: 0.4, borderBottomColor: '#29456f' }}>
              <Text style={{ width: 34, fontSize: 7.6, color: C.gold, fontFamily: 'Helvetica-Bold' }}>{n}</Text>
              <Text style={{ fontSize: 7.8, color: '#d5deea' }}>{s(t)}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', marginTop: 'auto', marginBottom: 26 }}>
          {kpis.map(([valor, rotulo, nota], i) => (
            <View
              key={rotulo}
              style={{ flex: 1, paddingRight: 10, borderLeftWidth: i ? 0.6 : 0, borderLeftColor: '#3a5680', paddingLeft: i ? 12 : 0 }}
            >
              <Text style={{ fontSize: 25, fontFamily: 'Helvetica-Bold', color: i === 2 ? C.gold : C.white }}>{s(valor)}</Text>
              <Text style={{ fontSize: 7.6, color: '#d5deea', marginTop: 2 }}>{s(rotulo)}</Text>
              {nota ? <Text style={{ fontSize: 6.6, color: C.navy3, marginTop: 1 }}>{s(nota)}</Text> : null}
            </View>
          ))}
        </View>

        <View
          style={{
            borderTopWidth: 0.6,
            borderTopColor: '#2b4a78',
            paddingTop: 12,
            marginBottom: 32,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ fontSize: 7, color: C.navy3 }}>
            {s(`Preparado por NEO · Núcleo de Inteligência de Mobilização${dossie.time.demonstracao ? ' · Ambiente de demonstração, dados fictícios' : ''}`)}
          </Text>
          <Text style={{ fontSize: 7, color: C.navy3, letterSpacing: 1 }}>USO EXCLUSIVO DA DIREÇÃO</Text>
        </View>
      </View>
    </Page>
  );
}

/* -------------------------------------------------------------------------
   01 · Sumario executivo
   ------------------------------------------------------------------------- */

const NATUREZA: Record<string, { rotulo: string; cor: string; fundo: string }> = {
  forca: { rotulo: 'FORÇA', cor: C.success, fundo: C.successSoft },
  atencao: { rotulo: 'PONTO DE ATENÇÃO', cor: C.danger, fundo: C.dangerSoft },
  oportunidade: { rotulo: 'OPORTUNIDADE', cor: C.gold, fundo: C.goldSoft },
};

function corDoIndice(valor: number) {
  return valor >= 70 ? C.success : valor >= 55 ? C.blue : valor >= 40 ? C.warning : C.danger;
}

function Assinatura() {
  return (
    <View style={{ marginTop: 4 }} wrap={false}>
      <View style={{ width: 90, height: 0.6, backgroundColor: C.navy3, marginBottom: 4 }} />
      <Text style={{ fontFamily: 'Times-Italic', fontSize: 10.5, color: C.navy }}>NEO</Text>
      <Text style={{ fontSize: 7, color: C.faint, letterSpacing: 0.8 }}>NÚCLEO DE INTELIGÊNCIA DE MOBILIZAÇÃO</Text>
    </View>
  );
}

function Sumario({ dossie, analise }: { dossie: Dossie; analise: AnaliseDoNeo }) {
  const indice = dossie.estrategia.indice;
  const cor = corDoIndice(indice.valor);
  return (
    <View>
      <Secao numero="01" titulo="Sumário executivo" sub="O essencial para a direção, em uma leitura." />

      <Text style={[st.rotulo, { marginBottom: 6, color: C.gold }]}>Carta à direção</Text>
      <Paragrafos texto={analise.carta} estilo="serifa" />
      <Assinatura />

      {/* O indice e calculado: o NEO so o le. */}
      <View style={{ marginTop: 18, padding: 14, backgroundColor: C.bg, borderLeftWidth: 3, borderLeftColor: cor }} wrap={false}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ alignItems: 'center', marginRight: 16, width: 96 }}>
            <Anel valor={indice.valor} cor={cor} tamanho={88} rotulo="de 100" />
            <View style={{ marginTop: 5 }}>
              <Chip texto={indice.rotulo.toUpperCase()} cor={C.white} fundo={cor} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11.5, fontFamily: 'Helvetica-Bold', color: C.navy }}>Índice de Mobilização</Text>
            <Text style={{ fontSize: 8.6, color: C.ink2, marginTop: 3, marginBottom: 8 }}>{s(analise.leituraDoIndice)}</Text>
            {indice.componentes.map((c) => (
              <View key={c.rotulo} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ width: 118, fontSize: 7.8, color: C.ink2 }}>{s(c.rotulo)}</Text>
                <View style={{ flex: 1, height: 6, backgroundColor: '#dfe5ec', borderRadius: 3 }}>
                  <View style={{ width: `${Math.max(1.5, c.valor)}%`, height: 6, backgroundColor: corDoIndice(c.valor), borderRadius: 3 }} />
                </View>
                <Text style={{ width: 34, textAlign: 'right', fontSize: 7.8, fontFamily: 'Helvetica-Bold' }}>{`${c.valor}%`}</Text>
                <Text style={{ width: 40, textAlign: 'right', fontSize: 6.8, color: C.faint }}>{`peso ${c.peso}%`}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <Text style={st.h3}>Conclusões-chave</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
        {analise.conclusoes.map((c) => {
          const tom = NATUREZA[c.natureza] ?? NATUREZA.forca;
          return (
            <View key={c.titulo} style={{ width: '50%', padding: 3 }} wrap={false}>
              <View style={{ padding: 9, borderLeftWidth: 2.5, borderLeftColor: tom.cor, backgroundColor: tom.fundo, minHeight: 62 }}>
                <Text style={{ fontSize: 6.4, color: tom.cor, fontFamily: 'Helvetica-Bold', letterSpacing: 1 }}>{tom.rotulo}</Text>
                <Text style={{ fontSize: 9.4, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 2 }}>{s(c.titulo)}</Text>
                <Text style={{ fontSize: 8.2, color: C.ink2, marginTop: 2 }}>{s(c.texto)}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------
   02 · A forca da rede
   ------------------------------------------------------------------------- */

function Piramide({ dossie }: { dossie: Dossie }) {
  const n = dossie.numeros;
  const niveis = [
    { valor: n.administradores, rotulo: n.administradores === 1 ? 'coordenador' : 'coordenadores', largura: '44%', cor: C.navy },
    { valor: n.lideres, rotulo: n.lideres === 1 ? 'liderança' : 'lideranças', largura: '70%', cor: C.navy2 },
    { valor: n.equipe, rotulo: 'apoiadores trazidos pelas lideranças', largura: '96%', cor: C.blue },
  ];
  return (
    <View style={{ alignItems: 'center' }}>
      {niveis.map((nivel) => (
        <View
          key={nivel.rotulo}
          style={{
            width: nivel.largura,
            backgroundColor: nivel.cor,
            paddingVertical: 6,
            marginBottom: 3,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: C.white, fontSize: 15, fontFamily: 'Helvetica-Bold', lineHeight: 1.1 }}>{num(nivel.valor)}</Text>
          <Text style={{ color: '#dbe4f0', fontSize: 7.2 }}>{s(nivel.rotulo)}</Text>
        </View>
      ))}
    </View>
  );
}

/** Novos por semana (barras) e total acumulado (linha). */
function Trajetoria({ dossie }: { dossie: Dossie }) {
  const semanas = dossie.crescimento;
  const acumulado = dossie.estrategia.acumulado;
  const largura = 503;
  const altura = 96;
  const topo = 14;
  const passo = largura / semanas.length;
  const maiorNovos = Math.max(1, ...semanas.map((w) => w.quantidade));
  const maiorTotal = Math.max(1, ...acumulado);
  const menorTotal = Math.min(...acumulado);
  const faixa = Math.max(1, maiorTotal - menorTotal);
  const yTotal = (v: number) => topo + (altura - topo - 8) * (1 - (v - menorTotal) / faixa) * 0.85;
  const pontos = acumulado.map((v, i) => [i * passo + passo / 2, yTotal(v)] as const);
  const linha = pontos.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

  return (
    <View wrap={false}>
      <Svg viewBox={`0 0 ${largura} ${altura}`} style={{ width: largura, height: altura }}>
        {[0.25, 0.5, 0.75].map((f) => (
          <Path key={f} d={`M 0 ${altura * f} L ${largura} ${altura * f}`} stroke="#e8edf2" strokeWidth={0.5} />
        ))}
        {semanas.map((w, i) => {
          const h = Math.max(w.quantidade ? 3 : 1, (w.quantidade / maiorNovos) * (altura - topo - 30));
          const ultima = i === semanas.length - 1;
          return (
            <Rect
              key={w.inicio}
              x={i * passo + passo * 0.22}
              y={altura - h}
              width={passo * 0.56}
              height={h}
              fill={ultima ? C.gold : '#b9c8dc'}
            />
          );
        })}
        {acumulado.length > 1 ? <Path d={linha} stroke={C.navy} strokeWidth={1.6} fill="none" /> : null}
        {pontos.map(([x, y], i) => (
          <Circle key={i} cx={x} cy={y} r={i === pontos.length - 1 ? 3 : 1.8} fill={C.navy} />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row' }}>
        {semanas.map((w) => (
          <View key={w.inicio} style={{ width: passo, alignItems: 'center' }}>
            <Text style={{ fontSize: 7.2, fontFamily: 'Helvetica-Bold' }}>{`+${num(w.quantidade)}`}</Text>
            <Text style={{ fontSize: 5.8, color: C.faint }}>{data(w.inicio).slice(0, 5)}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 14 }}>
          <View style={{ width: 8, height: 8, backgroundColor: '#b9c8dc', marginRight: 4 }} />
          <Text style={{ fontSize: 7, color: C.muted }}>novos na semana (a atual em dourado)</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 12, height: 1.6, backgroundColor: C.navy, marginRight: 4 }} />
          <Text style={{ fontSize: 7, color: C.muted }}>{s(`total acumulado · hoje ${num(acumulado[acumulado.length - 1] ?? 0)}`)}</Text>
        </View>
      </View>
    </View>
  );
}

function Rede({ dossie, analise }: { dossie: Dossie; analise: AnaliseDoNeo }) {
  const e = dossie.estrategia;
  const n = dossie.numeros;
  const variacao = `${n.variacao7 >= 0 ? '+' : ''}${n.variacao7}% na última semana`;
  return (
    <View break>
      <Secao numero="02" titulo="A força da rede" sub="Estrutura, ativação das lideranças, ritmo e trajetória." />

      <LinhaDeKpis>
        <Kpi valor={num(e.baseLiquida)} rotulo="base mobilizada (líquida)" nota={e.duplicados ? `${num(e.baseDeclarada)} declarados, ${num(e.duplicados)} duplicados` : 'sem duplicados'} />
        <Kpi valor={num(e.multiplicador)} rotulo="apoiadores por liderança ativa" tom={C.blue} />
        <Kpi valor={num(n.ultimos7)} rotulo="novos nos últimos 7 dias" nota={variacao} tom={C.gold} />
        <Kpi valor={num(n.ultimos30)} rotulo="novos nos últimos 30 dias" nota={`${n.ritmo30.toLocaleString('pt-BR')} por dia`} tom={C.gold} />
      </LinhaDeKpis>

      <View style={{ flexDirection: 'row', marginTop: 10 }} wrap={false}>
        <View style={{ flex: 1.35, marginRight: 14 }}>
          <Text style={[st.h3, { marginTop: 0 }]}>A pirâmide da rede</Text>
          <Piramide dossie={dossie} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[st.h3, { marginTop: 0 }]}>Lideranças em ação</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            <View style={{ alignItems: 'center', width: 96 }}>
              <Anel valor={e.ativacao} cor={corDoIndice(e.ativacao)} tamanho={70} sufixo="%" />
              <Text style={{ fontSize: 7.4, fontFamily: 'Helvetica-Bold', marginTop: 4, textAlign: 'center' }}>Ativação</Text>
              <Text style={{ fontSize: 6.6, color: C.faint, textAlign: 'center' }}>{s(`${num(n.lideresAtivos)} de ${num(n.lideres)} já trouxeram alguém`)}</Text>
            </View>
            <View style={{ alignItems: 'center', width: 96 }}>
              <Anel valor={e.engajamento} cor={corDoIndice(e.engajamento)} tamanho={70} sufixo="%" />
              <Text style={{ fontSize: 7.4, fontFamily: 'Helvetica-Bold', marginTop: 4, textAlign: 'center' }}>Engajamento</Text>
              <Text style={{ fontSize: 6.6, color: C.faint, textAlign: 'center' }}>{s(`${num(e.lideresRecentes)} cadastraram em 30 dias`)}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={{ marginTop: 14 }}>
        <Paragrafos texto={analise.forcaDaRede} />
      </View>

      {dossie.numeros.lideresAtivos > 0 ? (
        <View style={{ marginTop: 10, padding: 10, backgroundColor: C.goldSoft, borderLeftWidth: 2.5, borderLeftColor: C.gold }} wrap={false}>
          <Text style={{ fontSize: 8.8, color: C.ink }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(`Concentração: `)}</Text>
            {s(
              `as 3 maiores lideranças respondem por ${e.concentracaoTop3}% da base trazida pelas lideranças; ` +
                `${num(e.lideresPara80)} ${e.lideresPara80 === 1 ? 'liderança soma' : 'lideranças somam'} 80% dela.`,
            )}
          </Text>
        </View>
      ) : null}

      <Text style={st.h3}>Trajetória — últimas 12 semanas</Text>
      <Trajetoria dossie={dossie} />

      {/* Titulo, numeros e texto andam juntos: nunca um paragrafo sozinho
          numa pagina. */}
      <View wrap={false}>
      <Text style={st.h3}>Cenário — mantido o ritmo atual</Text>
      {e.projecao ? (
        <View style={{ flexDirection: 'row', marginBottom: 8 }} wrap={false}>
          {([
            ['em 30 dias', e.projecao.em30],
            ['em 60 dias', e.projecao.em60],
            ['em 90 dias', e.projecao.em90],
          ] as const).map(([rotulo, valor], i) => (
            <View key={rotulo} style={{ flex: 1, marginLeft: i ? 6 : 0, padding: 10, borderWidth: 0.6, borderColor: C.line, borderStyle: 'dashed' }}>
              <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.navy }}>{num(valor)}</Text>
              <Text style={{ fontSize: 7.4, color: C.muted }}>{s(`apoiadores ${rotulo}`)}</Text>
              <Text style={{ fontSize: 6.6, color: C.faint }}>{s(`+${num(valor - e.baseLiquida)} sobre hoje`)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Paragrafos texto={analise.cenario} />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------
   03 · Liderancas
   ------------------------------------------------------------------------- */

function SeloChip({ selo }: { selo: string }) {
  const tom = TOM_SELO[selo] ?? TOM_SELO['Sem Equipe'];
  return <Chip texto={selo.toUpperCase()} cor={tom.cor} fundo={tom.fundo} />;
}

function Liderancas({ dossie, analise }: { dossie: Dossie; analise: AnaliseDoNeo }) {
  const podio = dossie.lideres.filter((l) => l.equipe > 0).slice(0, 3);
  const porNome = new Map(dossie.lideres.map((l) => [l.nome, l]));
  const maior = Math.max(1, ...dossie.lideres.map((l) => l.equipe));

  return (
    <View break>
      <Secao numero="03" titulo="Lideranças" sub="Quem sustenta a rede, quem esfriou e o que fazer com cada uma." />

      {podio.length ? (
        <View style={{ flexDirection: 'row', marginBottom: 6 }} wrap={false}>
          {podio.map((l, i) => (
            <View
              key={l.id}
              style={{
                flex: 1,
                marginLeft: i ? 6 : 0,
                padding: 11,
                backgroundColor: i === 0 ? C.navy : C.bg,
                borderTopWidth: 2.5,
                borderTopColor: C.gold,
              }}
            >
              <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.gold, lineHeight: 1 }}>{`${i + 1}º`}</Text>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: i === 0 ? C.white : C.navy, marginTop: 5 }}>{s(l.nome)}</Text>
              <Text style={{ fontSize: 7.6, color: i === 0 ? '#cdd8e6' : C.muted, marginTop: 2 }}>
                {s(`${num(l.equipe)} apoiadores · ${l.participacao.toLocaleString('pt-BR')}% da base`)}
              </Text>
              <Text style={{ fontSize: 7, color: i === 0 ? C.navy3 : C.faint, marginTop: 1, marginBottom: 5 }}>
                {s(`${num(l.equipeUltimos30)} novos em 30 dias · integridade ${l.integridade}%`)}
              </Text>
              <SeloChip selo={l.selo} />
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row' }} wrap={false}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={st.h3}>Lideranças por tamanho da base</Text>
          <Barras itens={dossie.estrategia.faixas} cor={C.navy2} larguraDoRotulo={96} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={st.h3}>Lideranças por momento</Text>
          <Barras
            itens={dossie.estrategia.selos.map((x) => ({ ...x, cor: TOM_SELO[x.rotulo]?.cor }))}
            larguraDoRotulo={96}
          />
        </View>
      </View>

      {analise.liderancas.length ? (
        <View>
          <Text style={st.h3}>Leitura das lideranças</Text>
          {analise.liderancas.map((l) => {
            const dados = porNome.get(l.nome);
            return (
              <View key={l.nome} style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: C.line }} wrap={false}>
                <View style={{ width: 132, paddingRight: 8 }}>
                  <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy }}>{s(l.nome)}</Text>
                  {dados ? (
                    <View style={{ flexDirection: 'row', marginTop: 3 }}>
                      <SeloChip selo={dados.selo} />
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 8.6, color: C.ink2 }}>{s(l.leitura)}</Text>
                  <Text style={{ fontSize: 8, color: C.blue, marginTop: 2 }}>
                    <Text style={{ fontFamily: 'Helvetica-Bold' }}>{'Próximo passo › '}</Text>
                    {s(l.proximoPasso)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <Text style={st.h3}>{s(`Ranking das lideranças (${num(dossie.lideres.length)})`)}</Text>
      <Tabela<LiderNoDossie>
        linhas={dossie.lideres}
        chave={(l) => l.id}
        vazio="Nenhuma liderança cadastrada ainda."
        colunas={[
          { titulo: '#', largura: '5%', celula: (l) => String(l.posicao) },
          { titulo: 'Liderança', largura: '25%', celula: (l) => <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(l.nome)}</Text> },
          { titulo: 'Momento', largura: '14%', celula: (l) => <SeloChip selo={l.selo} /> },
          {
            titulo: 'Base',
            largura: '19%',
            celula: (l) => (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 48, height: 4.5, backgroundColor: '#e7ecf1', borderRadius: 2, marginRight: 4 }}>
                  <View style={{ width: `${(l.equipe / maior) * 100}%`, height: 4.5, backgroundColor: C.blue, borderRadius: 2 }} />
                </View>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>{num(l.equipe)}</Text>
              </View>
            ),
          },
          { titulo: '30 dias', largura: '8%', alinhar: 'right', celula: (l) => num(l.equipeUltimos30) },
          { titulo: 'Part.', largura: '8%', alinhar: 'right', celula: (l) => `${l.participacao.toLocaleString('pt-BR')}%` },
          { titulo: 'Integr.', largura: '8%', alinhar: 'right', celula: (l) => (l.equipe ? `${l.integridade}%` : '—') },
          { titulo: 'Último', largura: '13%', alinhar: 'right', celula: (l) => data(l.ultimoCadastro) },
        ]}
      />

      <Text style={st.h3}>{s(`Coordenação (${num(dossie.administradores.length)})`)}</Text>
      <Tabela
        linhas={dossie.administradores}
        chave={(a, i) => `${i}-${a.nome}`}
        vazio="Nenhum coordenador cadastrado."
        colunas={[
          { titulo: 'Coordenador', largura: '70%', celula: (a) => a.nome },
          { titulo: 'Lideranças recrutadas', largura: '30%', alinhar: 'right', celula: (a) => num(a.cadastrou) },
        ]}
      />
    </View>
  );
}

/* -------------------------------------------------------------------------
   04 · Territorio
   ------------------------------------------------------------------------- */

function Territorio({ dossie, analise }: { dossie: Dossie; analise: AnaliseDoNeo }) {
  const t = dossie.territorio;
  const el = dossie.estrategia.eleitoral;
  const total = dossie.numeros.total;
  return (
    <View break>
      <Secao
        numero="04"
        titulo="Presença territorial"
        sub={s(`Onde a rede está — ${dossie.time.municipios.join(', ')} / ${dossie.time.uf}.`)}
      />

      <LinhaDeKpis>
        <Kpi valor={num(el.bairros)} rotulo="bairros alcançados" />
        <Kpi valor={num(el.zonas)} rotulo="zonas eleitorais" tom={C.blue} />
        <Kpi valor={num(el.secoes)} rotulo="seções eleitorais" tom={C.blue} />
        <Kpi valor={`${el.concentracaoTop3Bairros}%`} rotulo="da base nos 3 maiores bairros" tom={C.gold} />
      </LinhaDeKpis>

      <View style={{ marginTop: 10 }}>
        <Paragrafos texto={analise.territorio} />
      </View>

      <View style={{ flexDirection: 'row' }} wrap={false}>
        <View style={{ flex: 1.2, marginRight: 12 }}>
          <Text style={st.h3}>Bairros com mais apoiadores</Text>
          <Barras itens={t.bairros} total={total} larguraDoRotulo={104} />
          {t.semBairro ? (
            <Text style={{ fontSize: 7.4, color: C.faint, marginTop: 3 }}>{s(`${num(t.semBairro)} sem bairro informado.`)}</Text>
          ) : null}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={st.h3}>Zonas eleitorais</Text>
          <Barras itens={t.zonas} total={total} cor={C.navy2} larguraDoRotulo={70} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginTop: 4 }} wrap={false}>
        <View style={{ flex: 1.2, marginRight: 12 }}>
          <Text style={st.h3}>Seções com mais apoiadores</Text>
          <Tabela
            linhas={t.secoes}
            chave={(x) => x.rotulo}
            vazio="Nenhuma seção informada."
            colunas={[
              { titulo: 'Zona e seção', largura: '70%', celula: (x) => x.rotulo },
              { titulo: 'Apoiadores', largura: '30%', alinhar: 'right', celula: (x) => num(x.quantidade) },
            ]}
          />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={st.h3}>Qualificação eleitoral</Text>
          {[
            { valor: el.tituloValidoPct, rotulo: 'com título de eleitor válido', qtd: el.tituloValido },
            { valor: el.zonaSecaoPct, rotulo: 'com zona e seção informadas', qtd: el.zonaSecao },
          ].map((x) => (
            <View key={x.rotulo} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Anel valor={x.valor} cor={corDoIndice(x.valor)} tamanho={56} sufixo="%" />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={{ fontSize: 8.4, fontFamily: 'Helvetica-Bold', color: C.navy }}>{s(`${num(x.qtd)} apoiadores`)}</Text>
                <Text style={{ fontSize: 7.6, color: C.muted }}>{s(x.rotulo)}</Text>
              </View>
            </View>
          ))}
          <Text style={{ fontSize: 7, color: C.faint }}>
            Título válido e zona e seção são o que permite localizar cada apoiador no mapa eleitoral.
          </Text>
        </View>
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------
   05 · Integridade da base
   ------------------------------------------------------------------------- */

/**
 * As pendencias com o nome e o encaminhamento que fazem sentido para a
 * direcao — o quadro do sistema fala a lingua da operacao ("painel",
 * "Equipe"); o relatorio, a da direcao.
 */
const PENDENCIA: Record<string, { titulo: string; encaminhamento: string }> = {
  repetidos: { titulo: 'Cadastrados mais de uma vez', encaminhamento: 'Manter o primeiro cadastro e remover as cópias.' },
  faltando: { titulo: 'Cadastros com dado faltando', encaminhamento: 'Completar com a liderança responsável.' },
  invalido: { titulo: 'Dados inconsistentes', encaminhamento: 'Conferir documento e telefone com a pessoa.' },
  'lider-sem-acesso': { titulo: 'Lideranças sem acesso ao sistema', encaminhamento: 'Corrigir o telefone da liderança.' },
  'fora-do-municipio': { titulo: 'Endereço fora do município', encaminhamento: 'Confirmar o endereço da pessoa.' },
  'terceiro-nivel': { titulo: 'Cadastrados fora da hierarquia', encaminhamento: 'Passar para a liderança correta.' },
  'responsavel-removido': { titulo: 'Responsável desligado', encaminhamento: 'Designar uma nova liderança responsável.' },
  'sem-origem': { titulo: 'Sem origem registrada', encaminhamento: 'Atribuir a uma liderança, se possível.' },
};

function Integridade({ dossie, analise }: { dossie: Dossie; analise: AnaliseDoNeo }) {
  const q = dossie.qualidade;
  const e = dossie.estrategia;
  const cor = corDoIndice(q.saude);
  const linhas = [
    ...(q.repetidos.length ? [{ tipo: 'repetidos', gravidade: 'alta', quantidade: q.repetidos.length }] : []),
    ...(q.incompletos ? [{ tipo: 'faltando', gravidade: 'media', quantidade: q.incompletos }] : []),
    ...q.problemas.map((p) => ({ tipo: p.tipo as string, gravidade: p.gravidade, quantidade: p.pessoas.length })),
  ];

  const bloco = (valor: number, rotulo: string, fundo: string, corTexto = C.white) => (
    <View style={{ flex: 1, padding: 10, backgroundColor: fundo, alignItems: 'center' }}>
      <Text style={{ fontSize: 17, fontFamily: 'Helvetica-Bold', color: corTexto }}>{num(valor)}</Text>
      <Text style={{ fontSize: 7.2, color: corTexto === C.white ? '#dbe4f0' : C.muted }}>{s(rotulo)}</Text>
    </View>
  );
  const sinal = (t: string) => (
    <Text style={{ width: 22, textAlign: 'center', fontSize: 15, color: C.faint, fontFamily: 'Helvetica-Bold' }}>{t}</Text>
  );

  return (
    <View break>
      <Secao numero="05" titulo="Integridade da base" sub="O que precisa ser corrigido para a contagem refletir a rede real." />

      <View style={{ flexDirection: 'row', alignItems: 'center' }} wrap={false}>
        {bloco(e.baseDeclarada, 'base declarada', C.navy2)}
        {sinal('-')}
        {bloco(e.duplicados, 'cadastros duplicados', C.dangerSoft, C.danger)}
        {sinal('=')}
        {bloco(e.baseLiquida, 'base líquida', C.navy)}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }} wrap={false}>
        <Anel valor={q.saude} cor={cor} tamanho={78} sufixo="%" rotulo="íntegra" />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Paragrafos texto={analise.integridade} />
        </View>
      </View>

      <Text style={st.h3}>Quadro das pendências</Text>
      <Tabela
        linhas={linhas}
        chave={(l) => l.tipo}
        vazio="Nenhuma pendência: a base está íntegra."
        colunas={[
          { titulo: 'Pendência', largura: '36%', celula: (l) => PENDENCIA[l.tipo]?.titulo ?? l.tipo },
          {
            titulo: 'Gravidade',
            largura: '14%',
            celula: (l) => <Chip texto={TOM_GRAVIDADE[l.gravidade].rotulo} cor={TOM_GRAVIDADE[l.gravidade].cor} fundo={TOM_GRAVIDADE[l.gravidade].fundo} />,
          },
          { titulo: 'Pessoas', largura: '12%', alinhar: 'center', celula: (l) => num(l.quantidade) },
          { titulo: 'Encaminhamento', largura: '38%', celula: (l) => <Text style={{ color: C.muted }}>{s(PENDENCIA[l.tipo]?.encaminhamento ?? 'Revisar com a coordenação.')}</Text> },
        ]}
      />

      <View style={{ flexDirection: 'row' }} wrap={false}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={st.h3}>O que mais falta</Text>
          <Barras itens={q.faltasPorCampo} cor={C.warning} larguraDoRotulo={96} vazio="Nenhum dado faltando." />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={st.h3}>Dados inconsistentes, por motivo</Text>
          <Barras itens={q.conferirPorMotivo} cor={C.danger} larguraDoRotulo={120} vazio="Nenhum dado inconsistente." />
        </View>
      </View>

      <Text style={{ fontSize: 7.6, color: C.faint, marginTop: 10 }}>
        O detalhamento nominal de cada pendência, com a liderança responsável, está no Anexo A. CPF não é exigido dos apoiadores e
        não conta como pendência.
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------------
   06 · Recomendacoes
   ------------------------------------------------------------------------- */

const TOM_PRAZO: Record<string, { cor: string; fundo: string }> = {
  Imediato: { cor: C.white, fundo: C.danger },
  'Até 7 dias': { cor: C.white, fundo: C.warning },
  'Até 30 dias': { cor: C.white, fundo: C.blue },
  'Até 90 dias': { cor: C.white, fundo: C.navy2 },
};

function Recomendacoes({ analise }: { analise: AnaliseDoNeo }) {
  return (
    <View break>
      <Secao numero="06" titulo="Recomendações estratégicas" sub="O que fazer, quem executa e até quando — em ordem de prioridade." />

      {analise.recomendacoes.map((r, i) => {
        const tom = TOM_PRAZO[r.prazo] ?? TOM_PRAZO['Até 30 dias'];
        return (
          <View key={`${i}-${r.titulo}`} style={{ flexDirection: 'row', marginBottom: 10 }} wrap={false}>
            <Text style={{ width: 34, fontSize: 22, fontFamily: 'Helvetica-Bold', color: C.gold, lineHeight: 1 }}>
              {String(i + 1).padStart(2, '0')}
            </Text>
            <View style={{ flex: 1, borderBottomWidth: 0.6, borderBottomColor: C.line, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10.5, flex: 1, color: C.navy }}>{s(r.titulo)}</Text>
                <Chip texto={r.prazo.toUpperCase()} cor={tom.cor} fundo={tom.fundo} />
              </View>
              <Text style={{ fontSize: 9, color: C.ink2, marginTop: 3 }}>{s(r.acao)}</Text>
              <View style={{ flexDirection: 'row', marginTop: 4 }}>
                <Text style={{ fontSize: 7.6, color: C.muted, width: 150 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>Quem executa: </Text>
                  {s(r.responsavel)}
                </Text>
                <Text style={{ fontSize: 7.6, color: C.success, flex: 1 }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>Resultado esperado: </Text>
                  {s(r.resultadoEsperado)}
                </Text>
              </View>
            </View>
          </View>
        );
      })}

      {analise.decisoesDaDirecao.length ? (
        <View style={{ marginTop: 8, padding: 14, backgroundColor: C.navy }} wrap={false}>
          <Text style={{ fontSize: 7, color: C.gold, letterSpacing: 2, fontFamily: 'Helvetica-Bold' }}>CABE À DIREÇÃO</Text>
          <Text style={{ fontSize: 12, color: C.white, fontFamily: 'Helvetica-Bold', marginTop: 3, marginBottom: 8 }}>
            Decisões estratégicas
          </Text>
          {analise.decisoesDaDirecao.map((d, i) => (
            <View key={i} style={{ flexDirection: 'row', marginBottom: 5 }}>
              <Text style={{ width: 14, color: C.gold, fontFamily: 'Helvetica-Bold', fontSize: 9 }}>{`${i + 1}.`}</Text>
              <Text style={{ flex: 1, color: '#e6ecf4', fontSize: 9 }}>{s(d)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ marginTop: 18 }} wrap={false}>
        <Text style={[st.rotulo, { color: C.gold, marginBottom: 6 }]}>Mensagem final</Text>
        <Paragrafos texto={analise.fechamento} estilo="serifa" />
        <Assinatura />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------------------
   Anexos
   ------------------------------------------------------------------------- */

function situacao(p: PessoaNoDossie) {
  if (p.conferir.length) return <Chip texto="Conferir" cor={C.danger} fundo={C.dangerSoft} />;
  if (p.faltas.length) return <Chip texto="Incompleto" cor={C.warning} fundo={C.warningSoft} />;
  return <Chip texto="Em ordem" cor={C.success} fundo={C.successSoft} />;
}

function AnexoPendencias({ dossie }: { dossie: Dossie }) {
  const q = dossie.qualidade;
  const incompletos = dossie.pessoas.filter((p) => p.faltas.length > 0);
  const inconsistentes = dossie.pessoas.filter((p) => p.conferir.length > 0);
  // "Dados para conferir" ja vem nas pessoas, com o motivo exato: a secao do
  // mesmo nome em `problemas` repetiria as mesmas linhas.
  const problemas = q.problemas.filter((p) => p.tipo !== 'invalido');

  return (
    <View break>
      <Secao numero="ANEXO A" titulo="Pendências de integridade" sub="Cada pendência com nome e liderança responsável, para correção." />

      <Text style={[st.h3, { marginTop: 0 }]}>{s(`Cadastrados mais de uma vez (${num(q.repetidos.reduce((soma, g) => soma + g.registros.length, 0))} cadastros de ${num(q.repetidos.length)} ${q.repetidos.length === 1 ? 'pessoa' : 'pessoas'})`)}</Text>
      {q.repetidos.length === 0 ? (
        <Text style={{ fontSize: 8.4, color: C.faint }}>Nenhum cadastro repetido.</Text>
      ) : (
        q.repetidos.map((g, gi) => <CartaoRepetido key={`${g.nome}-${gi}`} grupo={g} />)
      )}

      <Text style={st.h3}>{s(`Dados inconsistentes (${num(inconsistentes.length)})`)}</Text>
      <Tabela
        linhas={inconsistentes}
        chave={(p) => p.id}
        vazio="Nenhum dado inconsistente."
        colunas={[
          { titulo: 'Pessoa', largura: '30%', celula: (p) => p.nome },
          { titulo: 'Problema', largura: '36%', celula: (p) => <Text style={{ color: C.danger }}>{s([...new Set(p.conferir.map(nomeDaPendencia))].join(' · '))}</Text> },
          { titulo: 'Liderança responsável', largura: '34%', celula: (p) => p.cadastradoPor },
        ]}
      />

      <Text style={st.h3}>{s(`Dados faltando (${num(incompletos.length)})`)}</Text>
      <Tabela
        linhas={incompletos}
        chave={(p) => p.id}
        vazio="Nenhum dado faltando."
        colunas={[
          { titulo: 'Pessoa', largura: '30%', celula: (p) => p.nome },
          { titulo: 'Problema', largura: '36%', celula: (p) => <Text style={{ color: C.warning }}>{s(nomesDasFaltas(p.faltas))}</Text> },
          { titulo: 'Liderança responsável', largura: '34%', celula: (p) => p.cadastradoPor },
        ]}
      />

      {problemas.map((p) => {
        const tom = TOM_GRAVIDADE[p.gravidade];
        return (
          <View key={p.tipo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 5 }} wrap={false} minPresenceAhead={50}>
              <Text style={[st.h3, { marginTop: 0, marginBottom: 0, marginRight: 6 }]}>
                {s(`${PENDENCIA[p.tipo]?.titulo ?? p.titulo} (${num(p.pessoas.length)})`)}
              </Text>
              <Chip texto={tom.rotulo} cor={tom.cor} fundo={tom.fundo} />
            </View>
            <Tabela
              linhas={p.pessoas}
              chave={(x, i) => `${p.tipo}-${i}`}
              colunas={[
                { titulo: 'Pessoa', largura: '30%', celula: (x) => x.nome },
                { titulo: 'Problema', largura: '36%', celula: (x) => nomeDoProblemaDaFicha(p.tipo, x.detalhe) },
                { titulo: 'Cadastrado por', largura: '34%', celula: (x) => x.cadastradoPor },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

function AnexoNominata({ dossie }: { dossie: Dossie }) {
  const porResponsavel = new Map<string, PessoaNoDossie[]>();
  for (const p of dossie.pessoas) {
    if (!p.responsavelId) continue;
    porResponsavel.set(p.responsavelId, [...(porResponsavel.get(p.responsavelId) ?? []), p]);
  }
  const pessoaPorId = new Map(dossie.pessoas.map((p) => [p.id, p]));
  const agrupadas = new Set<string>();
  const blocos = dossie.lideres.map((l) => {
    const proprio = pessoaPorId.get(l.id);
    if (proprio) agrupadas.add(proprio.id);
    const base = l.usuarioId ? (porResponsavel.get(l.usuarioId) ?? []) : [];
    for (const m of base) agrupadas.add(m.id);
    return { lider: l, proprio, base };
  });
  const demais = dossie.pessoas.filter((p) => !agrupadas.has(p.id));

  const colunas = [
    { titulo: 'Nome', largura: '28%', celula: (p: PessoaNoDossie) => p.nome },
    { titulo: 'Telefone', largura: '15%', celula: (p: PessoaNoDossie) => telefone(p.telefone) },
    { titulo: 'Bairro', largura: '19%', celula: (p: PessoaNoDossie) => p.bairro || '—' },
    { titulo: 'Zona / Seção', largura: '12%', celula: (p: PessoaNoDossie) => (p.zona || p.secao ? `${p.zona || '?'} / ${p.secao || '?'}` : '—') },
    { titulo: 'Desde', largura: '11%', celula: (p: PessoaNoDossie) => data(p.cadastradoEm) },
    { titulo: 'Situação', largura: '15%', alinhar: 'right' as const, celula: situacao },
  ];

  return (
    <View break>
      <Secao
        numero="ANEXO B"
        titulo="Nominata da rede"
        sub={s(`Os ${num(dossie.numeros.total)} cadastros, cada apoiador sob a liderança que o trouxe.`)}
      />

      {blocos.map(({ lider, proprio, base }) => (
        <View key={lider.id} style={{ marginBottom: 12 }}>
          {/* Sem borda aqui: borda em bloco com `minPresenceAhead` quebra o
              desenho da biblioteca na virada de pagina. A faixa dourada e
              um bloco proprio. */}
          <View
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.navySoft, padding: 6, marginBottom: 2 }}
            wrap={false}
          >
            <View style={{ width: 2.5, height: 12, backgroundColor: C.gold, marginRight: 6 }} />
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9.2, flex: 1, color: C.navy }}>{s(`${lider.posicao}. ${lider.nome}`)}</Text>
            <Text style={{ fontSize: 7.2, color: C.muted, marginRight: 6 }}>
              {s(`${telefone(lider.telefone)} · ${num(base.length)} ${base.length === 1 ? 'apoiador' : 'apoiadores'}`)}
            </Text>
            <SeloChip selo={lider.selo} />
            {proprio ? <View style={{ marginLeft: 4 }}>{situacao(proprio)}</View> : null}
          </View>
          {base.length ? (
            <Tabela linhas={base} chave={(p) => p.id} colunas={colunas} />
          ) : (
            <Text style={{ fontSize: 7.8, color: C.faint, paddingLeft: 6 }}>Ainda sem apoiadores.</Text>
          )}
        </View>
      ))}

      {demais.length ? (
        <View>
          <Text style={st.h3}>{s(`Demais cadastros (${num(demais.length)})`)}</Text>
          <Text style={{ fontSize: 7.8, color: C.muted, marginBottom: 4 }}>
            Cadastros que não estão sob uma liderança: sem origem registrada, de responsável removido ou vindos da base.
          </Text>
          <Tabela
            linhas={demais}
            chave={(p) => p.id}
            colunas={[
              ...colunas.slice(0, 2),
              { titulo: 'Cadastrado por', largura: '19%', celula: (p: PessoaNoDossie) => p.cadastradoPor },
              ...colunas.slice(3),
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

function Metodologia({ dossie, neo, modelo }: { dossie: Dossie; neo: boolean; modelo: string }) {
  const itens: [string, string][] = [
    ['Fonte dos números', `Todos os números deste relatório foram contados do cadastro da operação em ${dataLonga(dossie.geradoEm)}. Nenhuma quantidade foi estimada — exceto o cenário de 30/60/90 dias, identificado como tal.`],
    ['Base declarada e base líquida', 'Base declarada é tudo o que está cadastrado. Base líquida conta cada pessoa uma única vez: descontados os cadastros repetidos com certeza (mesmo título, mesmo CPF, ou mesmo nome e telefone) e os muito prováveis (mesmo nome e mesma seção).'],
    ['Índice de Mobilização', dossie.estrategia.indice.componentes.map((c) => `${c.rotulo} (${c.peso}%): ${c.explicacao.toLowerCase()}`).join(' ') + ' Faixas: até 39 Crítico; 40 a 54 Em atenção; 55 a 69 Estável; 70 a 84 Forte; 85 ou mais Excelente.'],
    ['Momento das lideranças', 'Motor: cadastrou nos últimos 7 dias e está no terço de cima do ranking. Constante: cadastrou nos últimos 7 dias. Esfriando: cadastrou nos últimos 30 dias, mas não nesta semana. Parado: tem base, mas não cadastra há mais de 30 dias. Sem Equipe: ainda não trouxe ninguém.'],
    ['Integridade', 'Uma pessoa está íntegra quando não é cópia de outro cadastro, não tem dado essencial faltando (telefone, título, zona, seção e endereço) e não tem documento ou telefone com dígitos inconsistentes. CPF não é exigido dos apoiadores.'],
    ['Cenário', 'O cenário de 30/60/90 dias apenas prolonga o ritmo médio dos últimos 30 dias sobre a base líquida. Não é meta nem previsão.'],
    ['Análise', neo ? `Textos analíticos redigidos pelo NEO (modelo ${modelo}) a partir dos números agregados. Nenhum telefone, documento ou endereço foi enviado para a análise.` : 'Textos analíticos montados automaticamente a partir dos números, com as mesmas regras.'],
    ['Confidencialidade', 'Este documento contém dados pessoais protegidos pela LGPD. Uso restrito à direção e à coordenação da operação.'],
  ];
  return (
    <View break>
      <Secao numero="NOTA" titulo="Nota metodológica" sub="Como os números deste relatório foram obtidos." />
      {itens.map(([titulo, texto]) => (
        <View key={titulo} style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 0.5, borderBottomColor: C.line }} wrap={false}>
          <Text style={{ width: 140, fontSize: 8.6, fontFamily: 'Helvetica-Bold', color: C.navy, paddingRight: 10 }}>{s(titulo)}</Text>
          <Text style={{ flex: 1, fontSize: 8.4, color: C.ink2, lineHeight: 1.45 }}>{s(texto)}</Text>
        </View>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------
   O documento
   ------------------------------------------------------------------------- */

export interface RelatorioProps {
  dossie: Dossie;
  neo: AnaliseDoNeo | null;
  neoErro: string | null;
  modelo: string;
}

export function RelatorioDoTime({ dossie, neo, modelo }: RelatorioProps) {
  const analise = neo ?? analiseAutomatica(dossie);
  return (
    <Document
      title={s(`Relatório Estratégico de Mobilização — ${dossie.time.nome}`)}
      author="NEO · Núcleo de Inteligência de Mobilização"
      subject="Relatório Estratégico de Mobilização"
      creator="NEO"
      language="pt-BR"
    >
      <Capa dossie={dossie} analise={analise} />
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda="NEO · Relatório Estratégico de Mobilização" direita={dossie.time.nome} />
        {/* Os blocos fixos vem PRIMEIRO: um bloco `fixed` so se repete nas
            paginas a partir de onde aparece no fluxo. */}
        <Rodape texto={`${dataLonga(dossie.geradoEm)} · Documento reservado à direção · Contém dados pessoais (LGPD)`} />
        <Sumario dossie={dossie} analise={analise} />
        <Rede dossie={dossie} analise={analise} />
        <Liderancas dossie={dossie} analise={analise} />
        <Territorio dossie={dossie} analise={analise} />
        <Integridade dossie={dossie} analise={analise} />
        <Recomendacoes analise={analise} />
        <AnexoPendencias dossie={dossie} />
        <AnexoNominata dossie={dossie} />
        <Metodologia dossie={dossie} neo={Boolean(neo)} modelo={modelo} />
      </Page>
    </Document>
  );
}

/** Gera o arquivo. Chamado so no clique: a biblioteca e pesada. */
export async function gerarPdfDoRelatorio(props: RelatorioProps): Promise<Blob> {
  return pdf(<RelatorioDoTime {...props} />).toBlob();
}

/** relatorio-estrategico-<time>-<data>.pdf, sem acento nem espaco. */
export function nomeDoPdf(dossie: Dossie): string {
  return `relatorio-estrategico-${slug(dossie.time.nome)}-${dossie.geradoEm.slice(0, 10)}.pdf`;
}
