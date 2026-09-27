import type { ReactNode } from 'react';
import {
  Document,
  Page,
  Path,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
  pdf,
} from '@react-pdf/renderer';
import type { Contagem, Dossie, LiderNoDossie, PessoaNoDossie } from '@/lib/domain/dossie';
import type { AnaliseDoNeo } from '@/lib/domain/neo';
import { appConfig } from '@/config/app.config';

/**
 * O relatorio do time, em PDF.
 *
 * Montado NO NAVEGADOR de quem pediu: a lista de pessoas, com telefone, sai
 * do servidor so para esta tela, e o arquivo nasce aqui. Nenhum servidor de
 * PDF, nenhuma copia guardada.
 *
 * A estrutura segue a ordem em que um coordenador le:
 *
 *   capa          o time, a manchete do NEO e os quatro numeros que importam;
 *   1. resumo     o indice do NEO, o resumo, os destaques e os riscos;
 *   2. numeros    estrutura (Administradores -> Lideres -> Equipe), ritmo,
 *                 crescimento de 12 semanas, origem e genero;
 *   3. lideres    a leitura do NEO sobre quem puxa e quem parou, o ranking
 *                 inteiro e os Administradores;
 *   4. territorio bairros, zonas e secoes, e onde ha vazio;
 *   5. qualidade  saude do cadastro e TODAS as inconsistencias, com nome;
 *   6. plano      o que fazer, por quem e ate quando, e o que perguntar;
 *   anexo         quem e cada pessoa, agrupada sob o Lider que a trouxe.
 *
 * Os NUMEROS saem do dossie, nunca do texto do NEO: o texto interpreta, o
 * desenho conta. Sem o NEO (sem chave, fora do ar), o relatorio sai inteiro,
 * e os trechos dele dizem que a analise nao foi escrita.
 */

/* -------------------------------------------------------------------------
   Identidade
   ------------------------------------------------------------------------- */

const C = {
  navy: '#0f1e35',
  navy2: '#1d3050',
  navy3: '#8ea6c4',
  accent: '#2563eb',
  accentSoft: '#eaf1fe',
  ink: '#17212b',
  ink2: '#2e3d4b',
  muted: '#4b5967',
  faint: '#7b8d9d',
  line: '#d5dde5',
  bg: '#f2f5f8',
  success: '#166534',
  successSoft: '#e8f3ec',
  warning: '#8a5200',
  warningSoft: '#fbf3e4',
  danger: '#b42318',
  dangerSoft: '#fcedec',
  white: '#ffffff',
};

/**
 * Helvetica embutida fala WinAnsi: todo o portugues cabe, mas uma seta ou um
 * emoji vindo do texto do NEO viraria um quadrado. Troca o que da e tira o
 * resto.
 */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
function s(texto: string | number | null | undefined): string {
  return String(texto ?? '')
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/×/g, 'x')
    .split('')
    .filter((c) => c.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.has(c))
    .join('');
}

const num = (n: number) => n.toLocaleString('pt-BR');
const data = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const dataLonga = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
const telefone = (t: string) => {
  const d = t.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || '—';
};
const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

const st = StyleSheet.create({
  page: {
    paddingTop: 58,
    paddingBottom: 54,
    paddingHorizontal: 42,
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: C.ink,
    lineHeight: 1.45,
  },
  cabecalho: {
    position: 'absolute',
    top: 22,
    left: 42,
    right: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 0.6,
    borderBottomColor: C.line,
    paddingBottom: 6,
    fontSize: 7.5,
    color: C.faint,
  },
  rodape: {
    position: 'absolute',
    bottom: 22,
    left: 42,
    right: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: C.faint,
  },
  capitulo: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14 },
  capituloNumero: { fontSize: 30, fontFamily: 'Helvetica-Bold', color: C.accent, marginRight: 10, lineHeight: 1 },
  capituloTitulo: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.navy, lineHeight: 1.1 },
  capituloSub: { fontSize: 8.5, color: C.muted, marginTop: 2 },
  h3: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: C.navy, marginBottom: 6, marginTop: 14 },
  paragrafo: { fontSize: 9.5, color: C.ink2, marginBottom: 6, textAlign: 'justify' },
  rotulo: { fontSize: 7, color: C.faint, letterSpacing: 0.8, textTransform: 'uppercase' },
  caixa: { borderRadius: 6, padding: 10, backgroundColor: C.bg },
  linha: { flexDirection: 'row' },
  tabelaCab: {
    flexDirection: 'row',
    backgroundColor: C.navy,
    color: C.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  tabelaLinha: {
    flexDirection: 'row',
    fontSize: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
  },
  chip: {
    fontSize: 7,
    paddingVertical: 1.5,
    paddingHorizontal: 5,
    borderRadius: 8,
    fontFamily: 'Helvetica-Bold',
  },
  semNeo: {
    fontSize: 8.5,
    color: C.muted,
    fontStyle: 'italic',
    padding: 8,
    borderRadius: 4,
    borderWidth: 0.6,
    borderColor: C.line,
    borderStyle: 'dashed',
    marginBottom: 6,
  },
});

/* -------------------------------------------------------------------------
   Pecas
   ------------------------------------------------------------------------- */

function Cabecalho({ dossie }: { dossie: Dossie }) {
  return (
    <View style={st.cabecalho} fixed>
      <Text>{s(`RELATÓRIO DO TIME · ${dossie.time.nome.toUpperCase()}`)}</Text>
      <Text>{s(`NEO · ${appConfig.shortName}`)}</Text>
    </View>
  );
}

function Rodape({ dossie }: { dossie: Dossie }) {
  return (
    <View style={st.rodape} fixed>
      <Text>
        {s(`Gerado em ${dataLonga(dossie.geradoEm)} · Confidencial: contém dados pessoais (LGPD). Não compartilhe fora da coordenação.`)}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Capitulo({ numero, titulo, sub }: { numero: string; titulo: string; sub: string }) {
  return (
    <View style={st.capitulo} wrap={false}>
      <Text style={st.capituloNumero}>{numero}</Text>
      <View style={{ flex: 1 }}>
        <Text style={st.capituloTitulo}>{s(titulo)}</Text>
        <Text style={st.capituloSub}>{s(sub)}</Text>
      </View>
    </View>
  );
}

function Paragrafos({ texto }: { texto: string }) {
  return (
    <>
      {s(texto)
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <Text key={i} style={st.paragrafo}>
            {p}
          </Text>
        ))}
    </>
  );
}

function SemNeo({ oque }: { oque: string }) {
  return <Text style={st.semNeo}>{s(`A análise escrita do NEO não está disponível neste relatório (${oque}). Os números abaixo são do cadastro.`)}</Text>;
}

/** Numero grande com rotulo. */
function Kpi({ valor, rotulo, nota, tom = C.navy }: { valor: string; rotulo: string; nota?: string; tom?: string }) {
  return (
    <View style={{ flex: 1, padding: 10, borderRadius: 6, backgroundColor: C.bg, borderLeftWidth: 3, borderLeftColor: tom }}>
      <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: tom, lineHeight: 1.1 }}>{s(valor)}</Text>
      <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2 }}>{s(rotulo)}</Text>
      {nota ? <Text style={{ fontSize: 7, color: C.faint, marginTop: 1 }}>{s(nota)}</Text> : null}
    </View>
  );
}

/** Anel: arco proporcional, desenhado com Path para nao depender de dasharray. */
function Anel({ valor, cor, tamanho = 84, rotulo }: { valor: number; cor: string; tamanho?: number; rotulo: string }) {
  const r = 40;
  const v = Math.max(0, Math.min(100, valor));
  const ang = (v / 100) * 2 * Math.PI - Math.PI / 2;
  const x = 50 + r * Math.cos(ang);
  const y = 50 + r * Math.sin(ang);
  const grande = v > 50 ? 1 : 0;
  return (
    <View style={{ width: tamanho, height: tamanho, position: 'relative' }}>
      <Svg viewBox="0 0 100 100" style={{ width: tamanho, height: tamanho }}>
        <Path d="M 50 10 A 40 40 0 1 1 49.99 10" stroke="#e7ecf1" strokeWidth={10} fill="none" />
        {v >= 99.9 ? (
          <Path d="M 50 10 A 40 40 0 1 1 49.99 10" stroke={cor} strokeWidth={10} fill="none" />
        ) : v > 0 ? (
          <Path d={`M 50 10 A 40 40 0 ${grande} 1 ${x.toFixed(2)} ${y.toFixed(2)}`} stroke={cor} strokeWidth={10} fill="none" strokeLinecap="round" />
        ) : null}
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, width: tamanho, height: tamanho, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: tamanho / 4.2, fontFamily: 'Helvetica-Bold', color: cor, lineHeight: 1 }}>{v}</Text>
        <Text style={{ fontSize: 6.5, color: C.muted, marginTop: 2 }}>{s(rotulo)}</Text>
      </View>
    </View>
  );
}

/** Barras horizontais com rotulo e valor. */
function Barras({ itens, cor = C.accent, total }: { itens: Contagem[]; cor?: string; total?: number }) {
  const maior = Math.max(1, ...itens.map((i) => i.quantidade));
  if (itens.length === 0) return <Text style={{ fontSize: 8.5, color: C.faint }}>Sem dados.</Text>;
  return (
    <View>
      {itens.map((item) => (
        <View key={item.rotulo} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3.5 }} wrap={false}>
          <Text style={{ width: 118, fontSize: 8, color: C.ink2 }}>{s(item.rotulo)}</Text>
          <View style={{ flex: 1, height: 7, backgroundColor: '#e7ecf1', borderRadius: 4 }}>
            <View style={{ width: `${Math.max(2, (item.quantidade / maior) * 100)}%`, height: 7, backgroundColor: cor, borderRadius: 4 }} />
          </View>
          <Text style={{ width: 52, textAlign: 'right', fontSize: 8, fontFamily: 'Helvetica-Bold' }}>
            {num(item.quantidade)}
            {total ? <Text style={{ fontFamily: 'Helvetica', color: C.faint }}>{` ${pct(item.quantidade, total)}%`}</Text> : null}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Colunas verticais das 12 semanas. */
function Crescimento({ semanas }: { semanas: Dossie['crescimento'] }) {
  const largura = 510;
  const altura = 96;
  const maior = Math.max(1, ...semanas.map((w) => w.quantidade));
  const passo = largura / semanas.length;
  return (
    <View>
      <Svg viewBox={`0 0 ${largura} ${altura}`} style={{ width: largura, height: altura }}>
        {semanas.map((w, i) => {
          const h = Math.max(w.quantidade ? 3 : 1, (w.quantidade / maior) * (altura - 14));
          const ultima = i === semanas.length - 1;
          return (
            <Rect
              key={w.inicio}
              x={i * passo + passo * 0.18}
              y={altura - h}
              width={passo * 0.64}
              height={h}
              fill={ultima ? C.accent : C.navy2}
              rx={2}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row' }}>
        {semanas.map((w) => (
          <View key={w.inicio} style={{ width: passo, alignItems: 'center' }}>
            <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold' }}>{num(w.quantidade)}</Text>
            <Text style={{ fontSize: 6, color: C.faint }}>{data(w.inicio).slice(0, 5)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const TOM_GRAVIDADE: Record<string, { cor: string; fundo: string; rotulo: string }> = {
  alta: { cor: C.danger, fundo: C.dangerSoft, rotulo: 'ALTA' },
  media: { cor: C.warning, fundo: C.warningSoft, rotulo: 'MÉDIA' },
  baixa: { cor: C.muted, fundo: C.bg, rotulo: 'BAIXA' },
};

const TOM_PERFIL: Record<string, { cor: string; fundo: string }> = {
  Motor: { cor: C.success, fundo: C.successSoft },
  Constante: { cor: C.accent, fundo: C.accentSoft },
  'Em arranque': { cor: C.navy2, fundo: C.bg },
  Parado: { cor: C.danger, fundo: C.dangerSoft },
  Atenção: { cor: C.warning, fundo: C.warningSoft },
};

function Chip({ texto, cor, fundo }: { texto: string; cor: string; fundo: string }) {
  return <Text style={[st.chip, { color: cor, backgroundColor: fundo }]}>{s(texto)}</Text>;
}

function Tabela<T>({
  colunas,
  linhas,
  chave,
  vazio = 'Nada a listar.',
}: {
  colunas: { titulo: string; largura: number | string; celula: (item: T, indice: number) => ReactNode; alinhar?: 'right' | 'left' }[];
  linhas: T[];
  chave: (item: T) => string;
  vazio?: string;
}) {
  if (linhas.length === 0) return <Text style={{ fontSize: 8.5, color: C.faint }}>{s(vazio)}</Text>;
  return (
    <View>
      <View style={st.tabelaCab} fixed>
        {colunas.map((c) => (
          <Text key={c.titulo} style={{ width: c.largura, textAlign: c.alinhar ?? 'left' }}>
            {s(c.titulo)}
          </Text>
        ))}
      </View>
      {linhas.map((item, i) => (
        <View key={chave(item)} style={[st.tabelaLinha, i % 2 === 1 ? { backgroundColor: '#f8fafc' } : {}]} wrap={false}>
          {colunas.map((c) => (
            <View key={c.titulo} style={{ width: c.largura, alignItems: c.alinhar === 'right' ? 'flex-end' : 'flex-start' }}>
              {(() => {
                const conteudo = c.celula(item, i);
                return typeof conteudo === 'string' || typeof conteudo === 'number' ? (
                  <Text>{s(conteudo)}</Text>
                ) : (
                  conteudo
                );
              })()}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function situacao(p: PessoaNoDossie) {
  if (p.conferir.length) return <Chip texto="Conferir" cor={C.danger} fundo={C.dangerSoft} />;
  if (p.faltas.length) return <Chip texto="Incompleto" cor={C.warning} fundo={C.warningSoft} />;
  return <Chip texto="Em ordem" cor={C.success} fundo={C.successSoft} />;
}

/* -------------------------------------------------------------------------
   Capa
   ------------------------------------------------------------------------- */

function Capa({ dossie, neo, modelo }: { dossie: Dossie; neo: AnaliseDoNeo | null; modelo: string }) {
  const n = dossie.numeros;
  const saude = dossie.qualidade.saude;
  const kpis: [string, string][] = [
    [num(n.total), 'pessoas no time'],
    [num(n.lideres), 'Líderes'],
    [num(n.equipe), 'na Equipe'],
    [`${saude}%`, 'saúde do cadastro'],
  ];
  return (
    <Page size="A4" style={{ backgroundColor: C.navy, color: C.white, padding: 0, fontFamily: 'Helvetica' }}>
      {/* Faixa diagonal de fundo: desenho, nao dado. */}
      {/* A4 tem 595,28 x 841,89 pontos: um fundo de 842 transbordava e
          empurrava a capa para uma segunda pagina. */}
      <Svg viewBox="0 0 595 841" style={{ position: 'absolute', top: 0, left: 0, width: 595, height: 841 }}>
        <Path d="M 360 0 L 595 0 L 595 841 L 150 841 Z" fill={C.navy2} />
        <Path d="M 470 0 L 595 0 L 595 300 Z" fill={C.accent} />
      </Svg>

      <View style={{ paddingHorizontal: 48, paddingTop: 56, flex: 1 }}>
        <Text style={{ fontSize: 8, letterSpacing: 2, color: C.navy3 }}>
          {s(`${appConfig.shortName} · ${appConfig.name.toUpperCase()}`)}
        </Text>

        <Text style={{ marginTop: 150, fontSize: 11, letterSpacing: 3, color: C.navy3 }}>RELATÓRIO DO TIME</Text>
        <Text style={{ fontSize: 38, fontFamily: 'Helvetica-Bold', marginTop: 6, lineHeight: 1.05 }}>{s(dossie.time.nome)}</Text>
        <Text style={{ fontSize: 11, color: C.navy3, marginTop: 8 }}>
          {s(`${dossie.time.municipios.join(', ')} / ${dossie.time.uf} · ${dataLonga(dossie.geradoEm)}`)}
          {dossie.time.demonstracao ? s(' · TIME DE DEMONSTRAÇÃO') : ''}
        </Text>

        {neo ? (
          <View style={{ marginTop: 34, borderLeftWidth: 3, borderLeftColor: C.accent, paddingLeft: 14, width: 380 }}>
            <Text style={{ fontSize: 15, lineHeight: 1.35 }}>{s(`“${neo.manchete}”`)}</Text>
            <Text style={{ fontSize: 8, color: C.navy3, marginTop: 6 }}>— NEO</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', marginTop: 'auto', marginBottom: 26 }}>
          {kpis.map(([valor, rotulo], i) => (
            <View key={rotulo} style={{ flex: 1, paddingRight: 12, borderLeftWidth: i ? 0.6 : 0, borderLeftColor: C.navy3, paddingLeft: i ? 12 : 0 }}>
              <Text style={{ fontSize: 26, fontFamily: 'Helvetica-Bold' }}>{s(valor)}</Text>
              <Text style={{ fontSize: 8, color: C.navy3 }}>{s(rotulo)}</Text>
            </View>
          ))}
        </View>

        <View style={{ borderTopWidth: 0.6, borderTopColor: C.navy2, paddingTop: 12, marginBottom: 34, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 7.5, color: C.navy3 }}>
            {s(`Análise: NEO (${modelo}) · Números: cadastro do ${appConfig.shortName}`)}
          </Text>
          <Text style={{ fontSize: 7.5, color: C.navy3 }}>CONFIDENCIAL · CONTÉM DADOS PESSOAIS</Text>
        </View>
      </View>
    </Page>
  );
}

/* -------------------------------------------------------------------------
   Capitulos
   ------------------------------------------------------------------------- */

function Resumo({ dossie, neo, neoErro }: { dossie: Dossie; neo: AnaliseDoNeo | null; neoErro: string | null }) {
  const corIndice = !neo ? C.muted : neo.indice.valor >= 70 ? C.success : neo.indice.valor >= 45 ? C.warning : C.danger;
  return (
    <View>
      <Capitulo numero="1" titulo="Resumo executivo" sub="O momento do time, em uma página." />

      <View style={{ flexDirection: 'row', marginBottom: 10 }} wrap={false}>
        <View style={{ alignItems: 'center', marginRight: 16 }}>
          {/* Sem o NEO nao ha indice: um "0" pareceria nota, e seria mentira.
              O anel mostra entao o que o cadastro sabe — a saude. */}
          {neo ? (
            <>
              <Anel valor={neo.indice.valor} cor={corIndice} rotulo="índice NEO" />
              <Chip texto={neo.indice.rotulo} cor={corIndice} fundo={C.bg} />
            </>
          ) : (
            <Anel
              valor={dossie.qualidade.saude}
              cor={dossie.qualidade.saude >= 90 ? C.success : dossie.qualidade.saude >= 70 ? C.warning : C.danger}
              rotulo="% em ordem"
            />
          )}
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          {neo ? (
            <>
              <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.navy, lineHeight: 1.3 }}>{s(neo.manchete)}</Text>
              <Text style={{ fontSize: 8.5, color: C.muted, marginTop: 4 }}>{s(neo.indice.justificativa)}</Text>
            </>
          ) : (
            <>
              {/* O resumo em numeros, montado do cadastro: sem o NEO, a
                  primeira pagina ainda diz o essencial. */}
              <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.navy, lineHeight: 1.35 }}>
                {s(
                  `${num(dossie.numeros.total)} pessoas: ${num(dossie.numeros.lideres)} Líderes ` +
                    `(${num(dossie.numeros.lideresAtivos)} já trouxeram alguém) e ${num(dossie.numeros.equipe)} na Equipe. ` +
                    `${num(dossie.numeros.ultimos7)} cadastros nos últimos 7 dias; ${dossie.qualidade.saude}% do cadastro em ordem.`,
                )}
              </Text>
              <Text style={[st.semNeo, { marginTop: 6 }]}>{s(neoErro ?? 'Análise indisponível.')}</Text>
            </>
          )}
        </View>
      </View>

      {neo ? <Paragrafos texto={neo.resumoExecutivo} /> : null}

      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={st.h3}>O que está indo bem</Text>
          {neo?.destaques.length ? (
            neo.destaques.map((d) => (
              <View key={d.titulo} style={{ padding: 8, marginBottom: 5, borderRadius: 5, backgroundColor: C.successSoft }} wrap={false}>
                <Text style={{ fontFamily: 'Helvetica-Bold', color: C.success, fontSize: 9 }}>{s(d.titulo)}</Text>
                <Text style={{ fontSize: 8.5, color: C.ink2 }}>{s(d.detalhe)}</Text>
              </View>
            ))
          ) : (
            <SemNeo oque="destaques" />
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={st.h3}>O que preocupa</Text>
          {neo?.riscos.length ? (
            neo.riscos.map((r) => {
              const tom = TOM_GRAVIDADE[r.gravidade];
              return (
                <View key={r.titulo} style={{ padding: 8, marginBottom: 5, borderRadius: 5, backgroundColor: tom.fundo }} wrap={false}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: 'Helvetica-Bold', color: tom.cor, fontSize: 9, flex: 1 }}>{s(r.titulo)}</Text>
                    <Text style={{ fontSize: 6.5, color: tom.cor, fontFamily: 'Helvetica-Bold' }}>{tom.rotulo}</Text>
                  </View>
                  <Text style={{ fontSize: 8.5, color: C.ink2 }}>{s(r.detalhe)}</Text>
                </View>
              );
            })
          ) : (
            <SemNeo oque="riscos" />
          )}
        </View>
      </View>

      {dossie.time.demonstracao ? (
        <Text style={{ fontSize: 8, color: C.muted, marginTop: 6 }}>
          Este é um time de demonstração: as pessoas são fictícias, e os locais de votação são reais.
        </Text>
      ) : null}
    </View>
  );
}

function Numeros({ dossie }: { dossie: Dossie }) {
  const n = dossie.numeros;
  const variacao = `${n.variacao7 >= 0 ? '+' : ''}${n.variacao7}% sobre a semana anterior`;
  return (
    <View break>
      <Capitulo numero="2" titulo="O time em números" sub="Tudo contado do cadastro, no momento em que o relatório foi gerado." />

      <View style={{ flexDirection: 'row', marginBottom: 8 }}>
        <Kpi valor={num(n.total)} rotulo="pessoas no time" />
        <View style={{ width: 8 }} />
        <Kpi valor={num(n.hoje)} rotulo="cadastros hoje" tom={C.accent} />
        <View style={{ width: 8 }} />
        <Kpi valor={num(n.ultimos7)} rotulo="nos últimos 7 dias" nota={variacao} tom={C.accent} />
        <View style={{ width: 8 }} />
        <Kpi valor={num(n.ultimos30)} rotulo="nos últimos 30 dias" nota={`${n.ritmo30.toLocaleString('pt-BR')} por dia`} tom={C.accent} />
      </View>

      <Text style={st.h3}>Estrutura</Text>
      {/* Administradores -> Lideres -> Equipe: a hierarquia como ela e. */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }} wrap={false}>
        {[
          { valor: n.administradores, rotulo: 'Administradores do time', nota: 'cadastram os Líderes', cor: C.navy },
          { valor: n.lideres, rotulo: 'Líderes', nota: `${num(n.lideresAtivos)} já trouxeram alguém`, cor: C.navy2 },
          { valor: n.equipe, rotulo: 'na Equipe', nota: `média de ${n.equipeMedia.toLocaleString('pt-BR')} por Líder ativo`, cor: C.accent },
        ].map((nivel, i) => (
          <View key={nivel.rotulo} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            {i > 0 ? <Text style={{ fontSize: 16, color: C.faint, marginHorizontal: 6 }}>{'>'}</Text> : null}
            <View style={{ flex: 1, padding: 10, borderRadius: 6, backgroundColor: nivel.cor }}>
              <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.white, lineHeight: 1.15, marginBottom: 2 }}>
                {num(nivel.valor)}
              </Text>
              <Text style={{ fontSize: 8, color: C.white }}>{s(nivel.rotulo)}</Text>
              <Text style={{ fontSize: 7, color: '#c9d6e8', marginTop: 2 }}>{s(nivel.nota)}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={st.h3}>Crescimento — últimas 12 semanas</Text>
      <Crescimento semanas={dossie.crescimento} />

      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={st.h3}>Por onde entraram</Text>
          <Barras
            total={n.total}
            itens={[
              { rotulo: 'Pelo link de cadastro', quantidade: n.viaLink },
              { rotulo: 'Pelo painel ou planilha', quantidade: n.viaPainel },
            ]}
          />
          <Text style={{ fontSize: 8, color: C.muted, marginTop: 4 }}>
            {s(`${num(n.comAcesso)} pessoas com acesso ativo ao painel.`)}
          </Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={st.h3}>Gênero</Text>
          <Barras itens={dossie.genero} total={n.total} cor={C.navy2} />
        </View>
      </View>
    </View>
  );
}

function Lideres({ dossie, neo }: { dossie: Dossie; neo: AnaliseDoNeo | null }) {
  const maior = Math.max(1, ...dossie.lideres.map((l) => l.equipe));
  return (
    <View break>
      <Capitulo numero="3" titulo="Líderes e Administração" sub="Quem puxa, quem parou, e quem precisa de ajuda." />

      {neo?.lideres.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
          {neo.lideres.map((l) => {
            const tom = TOM_PERFIL[l.perfil] ?? TOM_PERFIL.Constante;
            return (
              <View key={l.nome} style={{ width: '50%', padding: 3 }} wrap={false}>
                <View style={{ padding: 8, borderRadius: 5, borderWidth: 0.6, borderColor: C.line, minHeight: 52 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, flex: 1 }}>{s(l.nome)}</Text>
                    <Chip texto={l.perfil} cor={tom.cor} fundo={tom.fundo} />
                  </View>
                  <Text style={{ fontSize: 8, color: C.ink2 }}>{s(l.leitura)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <SemNeo oque="leitura dos Líderes" />
      )}

      <Text style={st.h3}>{s(`Ranking dos Líderes (${num(dossie.lideres.length)})`)}</Text>
      <Tabela<LiderNoDossie>
        linhas={dossie.lideres}
        chave={(l) => l.id}
        vazio="Nenhum Líder cadastrado ainda."
        colunas={[
          { titulo: '#', largura: '5%', celula: (_, i) => String(i + 1) },
          { titulo: 'Líder', largura: '27%', celula: (l) => l.nome },
          {
            titulo: 'Equipe',
            largura: '22%',
            celula: (l) => (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 60, height: 5, backgroundColor: '#e7ecf1', borderRadius: 3, marginRight: 4 }}>
                  <View style={{ width: `${(l.equipe / maior) * 100}%`, height: 5, backgroundColor: C.accent, borderRadius: 3 }} />
                </View>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>{num(l.equipe)}</Text>
              </View>
            ),
          },
          { titulo: '7 dias', largura: '8%', alinhar: 'right', celula: (l) => num(l.equipeUltimos7) },
          { titulo: 'Incompl.', largura: '9%', alinhar: 'right', celula: (l) => num(l.incompletos) },
          { titulo: 'Conferir', largura: '9%', alinhar: 'right', celula: (l) => num(l.paraConferir) },
          { titulo: 'Último cadastro', largura: '12%', alinhar: 'right', celula: (l) => data(l.ultimoCadastro) },
          {
            titulo: 'Acesso',
            largura: '8%',
            alinhar: 'right',
            celula: (l) => (l.temAcesso ? <Chip texto="Ativo" cor={C.success} fundo={C.successSoft} /> : <Chip texto="Sem" cor={C.danger} fundo={C.dangerSoft} />),
          },
        ]}
      />

      <Text style={st.h3}>{s(`Administradores do time (${num(dossie.administradores.length)})`)}</Text>
      <Tabela
        linhas={dossie.administradores}
        chave={(a) => a.nome + a.telefone}
        vazio="Nenhum Administrador cadastrado."
        colunas={[
          { titulo: 'Administrador', largura: '50%', celula: (a) => a.nome },
          { titulo: 'Telefone', largura: '25%', celula: (a) => telefone(a.telefone) },
          { titulo: 'Líderes que cadastrou', largura: '25%', alinhar: 'right', celula: (a) => num(a.cadastrou) },
        ]}
      />
    </View>
  );
}

function Territorio({ dossie, neo }: { dossie: Dossie; neo: AnaliseDoNeo | null }) {
  const t = dossie.territorio;
  // Capitulo curto: segue na mesma pagina do anterior quando cabe, em vez
  // de deixar meia pagina em branco.
  return (
    <View style={{ marginTop: 22 }}>
      <Capitulo numero="4" titulo="Território" sub={s(`Onde a equipe está — ${dossie.time.municipios.join(', ')} / ${dossie.time.uf}.`)} />
      {neo ? <Paragrafos texto={neo.territorio} /> : <SemNeo oque="leitura do território" />}

      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={st.h3}>Bairros com mais gente</Text>
          <Barras itens={t.bairros} total={dossie.numeros.total} />
          <Text style={{ fontSize: 8, color: C.muted, marginTop: 4 }}>{s(`${num(t.semBairro)} pessoas sem bairro informado.`)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={st.h3}>Zonas eleitorais</Text>
          <Barras itens={t.zonas} total={dossie.numeros.total} cor={C.navy2} />
          <Text style={st.h3}>Seções com mais gente</Text>
          <Barras itens={t.secoes} cor={C.navy2} />
          <Text style={{ fontSize: 8, color: C.muted, marginTop: 4 }}>{s(`${num(t.semSecao)} pessoas sem zona ou seção.`)}</Text>
        </View>
      </View>
    </View>
  );
}

function Qualidade({ dossie, neo }: { dossie: Dossie; neo: AnaliseDoNeo | null }) {
  const q = dossie.qualidade;
  const cor = q.saude >= 90 ? C.success : q.saude >= 70 ? C.warning : C.danger;
  return (
    <View break>
      <Capitulo numero="5" titulo="Qualidade dos dados e inconsistências" sub="O que está repetido, faltando ou errado — com nome e responsável." />

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }} wrap={false}>
        <Anel valor={q.saude} cor={cor} rotulo="% em ordem" />
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', marginLeft: 14 }}>
          {[
            [q.pessoasComProblema, 'pessoas precisam de atenção', C.navy],
            [q.excedentes, 'cadastros repetidos sobrando', C.danger],
            [q.incompletos, 'cadastros incompletos', C.warning],
            [q.paraConferir, 'com dado para conferir', C.danger],
            [q.possiveisRepetidos, 'possíveis homônimos', C.muted],
            [q.telefonesCompartilhados, 'telefones compartilhados', C.muted],
          ].map(([valor, rotulo, tom]) => (
            <View key={rotulo as string} style={{ width: '33%', paddingVertical: 4 }}>
              <Text style={{ fontSize: 15, fontFamily: 'Helvetica-Bold', color: tom as string }}>{num(valor as number)}</Text>
              <Text style={{ fontSize: 7.5, color: C.muted }}>{s(rotulo as string)}</Text>
            </View>
          ))}
        </View>
      </View>

      {neo ? <Paragrafos texto={neo.qualidadeDosDados} /> : <SemNeo oque="leitura da qualidade" />}

      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={st.h3}>O que mais falta</Text>
          <Barras itens={q.faltasPorCampo} cor={C.warning} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={st.h3}>O que mais precisa ser conferido</Text>
          <Barras itens={q.conferirPorMotivo} cor={C.danger} />
        </View>
      </View>

      <Text style={st.h3}>
        {s(`Cadastrados mais de uma vez (${num(q.repetidos.length)} ${q.repetidos.length === 1 ? 'pessoa' : 'pessoas'})`)}
      </Text>
      {q.repetidos.length === 0 ? (
        <Text style={{ fontSize: 8.5, color: C.faint }}>Nenhum cadastro repetido.</Text>
      ) : (
        q.repetidos.map((g, gi) => (
          <View key={`${g.nome}-${gi}`} style={{ marginBottom: 6, borderWidth: 0.6, borderColor: C.line, borderRadius: 5 }} wrap={false}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 6, backgroundColor: C.bg, borderTopLeftRadius: 5, borderTopRightRadius: 5 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9 }}>{s(g.nome)}</Text>
              <Text style={{ fontSize: 7.5, color: C.danger }}>{s(`${g.certeza} · ${g.evidencias.join(', ')}`)}</Text>
            </View>
            {g.registros.map((r, ri) => (
              <View key={ri} style={{ flexDirection: 'row', paddingHorizontal: 6, paddingVertical: 3, fontSize: 8 }}>
                <Text style={{ width: '14%', color: r.primeiro ? C.success : C.danger, fontFamily: 'Helvetica-Bold' }}>{r.primeiro ? '1º cadastro' : `${ri + 1}º cadastro`}</Text>
                <Text style={{ width: '32%' }}>{s(r.nome)}</Text>
                <Text style={{ width: '38%', color: C.muted }}>{s(`por ${r.cadastradoPor}`)}</Text>
                <Text style={{ width: '16%', textAlign: 'right', color: C.muted }}>{data(r.cadastradoEm)}</Text>
              </View>
            ))}
            {g.responsaveis.length > 1 ? (
              <Text style={{ fontSize: 7.5, color: C.warning, paddingHorizontal: 6, paddingBottom: 4 }}>
                {s(`Conta para ${g.responsaveis.length} responsáveis no ranking: ${g.responsaveis.join(' e ')}.`)}
              </Text>
            ) : null}
          </View>
        ))
      )}

      {q.problemas.map((p) => {
        const tom = TOM_GRAVIDADE[p.gravidade];
        return (
          <View key={p.tipo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 5 }} wrap={false}>
              <Text style={[st.h3, { marginTop: 0, marginBottom: 0, marginRight: 6 }]}>{s(`${p.titulo} (${num(p.pessoas.length)})`)}</Text>
              <Chip texto={tom.rotulo} cor={tom.cor} fundo={tom.fundo} />
            </View>
            <Tabela
              linhas={p.pessoas}
              chave={(x) => `${p.tipo}-${x.nome}-${x.detalhe}`}
              colunas={[
                { titulo: 'Pessoa', largura: '32%', celula: (x) => x.nome },
                { titulo: 'O quê', largura: '34%', celula: (x) => x.detalhe },
                { titulo: 'Cadastrado por', largura: '34%', celula: (x) => x.cadastradoPor },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

function Plano({ neo }: { neo: AnaliseDoNeo | null }) {
  const corPrazo: Record<string, { cor: string; fundo: string }> = {
    Hoje: { cor: C.danger, fundo: C.dangerSoft },
    'Esta semana': { cor: C.warning, fundo: C.warningSoft },
    'Este mês': { cor: C.accent, fundo: C.accentSoft },
  };
  return (
    <View break>
      <Capitulo numero="6" titulo="Plano de ação" sub="O que fazer, por quem e até quando — em ordem de prioridade." />
      {neo?.planoDeAcao.length ? (
        neo.planoDeAcao.map((a, i) => {
          const tom = corPrazo[a.prazo] ?? corPrazo['Este mês'];
          return (
            <View key={a.acao} style={{ flexDirection: 'row', marginBottom: 8 }} wrap={false}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.navy, justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                <Text style={{ color: C.white, fontFamily: 'Helvetica-Bold', fontSize: 10 }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1, borderBottomWidth: 0.6, borderBottomColor: C.line, paddingBottom: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10, flex: 1, color: C.navy }}>{s(a.acao)}</Text>
                  <Chip texto={a.prazo} cor={tom.cor} fundo={tom.fundo} />
                </View>
                <Text style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>{s(`Quem: ${a.responsavel}`)}</Text>
                <Text style={{ fontSize: 8.5, color: C.ink2, marginTop: 1 }}>{s(a.impacto)}</Text>
              </View>
            </View>
          );
        })
      ) : (
        <SemNeo oque="plano de ação" />
      )}

      {neo?.perguntas.length ? (
        <View style={[st.caixa, { marginTop: 10, backgroundColor: C.accentSoft }]} wrap={false}>
          <Text style={[st.h3, { marginTop: 0 }]}>Para a próxima reunião</Text>
          {neo.perguntas.map((p) => (
            <Text key={p} style={{ fontSize: 9, color: C.ink2, marginBottom: 3 }}>
              {s(`•  ${p}`)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Anexo({ dossie }: { dossie: Dossie }) {
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
    const equipe = l.usuarioId ? (porResponsavel.get(l.usuarioId) ?? []) : [];
    for (const m of equipe) agrupadas.add(m.id);
    return { lider: l, proprio, equipe };
  });
  const demais = dossie.pessoas.filter((p) => !agrupadas.has(p.id));

  const colunas = [
    { titulo: 'Nome', largura: '27%', celula: (p: PessoaNoDossie) => p.nome },
    { titulo: 'Telefone', largura: '15%', celula: (p: PessoaNoDossie) => telefone(p.telefone) },
    { titulo: 'Bairro', largura: '18%', celula: (p: PessoaNoDossie) => p.bairro || '—' },
    { titulo: 'Zona / Seção', largura: '12%', celula: (p: PessoaNoDossie) => (p.zona || p.secao ? `${p.zona || '?'} / ${p.secao || '?'}` : '—') },
    { titulo: 'Cadastro', largura: '11%', celula: (p: PessoaNoDossie) => data(p.cadastradoEm) },
    { titulo: 'Situação', largura: '17%', alinhar: 'right' as const, celula: situacao },
  ];

  return (
    <View break>
      <Capitulo numero="A" titulo="Anexo — quem é cada pessoa" sub={s(`As ${num(dossie.numeros.total)} pessoas do time, cada uma sob o Líder que a trouxe.`)} />

      {blocos.map(({ lider, proprio, equipe }) => (
        <View key={lider.id} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.accentSoft, padding: 6, borderRadius: 4, marginBottom: 2 }} wrap={false} minPresenceAhead={40}>
            <Chip texto="LÍDER" cor={C.white} fundo={C.accent} />
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9.5, marginLeft: 6, flex: 1 }}>{s(lider.nome)}</Text>
            <Text style={{ fontSize: 7.5, color: C.muted }}>
              {s(`${telefone(lider.telefone)} · trazido por ${lider.cadastradoPor} · ${num(equipe.length)} na Equipe`)}
            </Text>
            {proprio ? <View style={{ marginLeft: 6 }}>{situacao(proprio)}</View> : null}
          </View>
          {equipe.length ? (
            <Tabela linhas={equipe} chave={(p) => p.id} colunas={colunas} />
          ) : (
            <Text style={{ fontSize: 8, color: C.faint, paddingLeft: 6 }}>Ainda sem Equipe.</Text>
          )}
        </View>
      ))}

      {demais.length ? (
        <View>
          <Text style={st.h3}>{s(`Demais cadastros (${num(demais.length)})`)}</Text>
          <Text style={{ fontSize: 8, color: C.muted, marginBottom: 4 }}>
            Pessoas que não estão sob um Líder do time: cadastros sem origem, de responsável removido ou de quem é da Equipe.
          </Text>
          <Tabela
            linhas={demais}
            chave={(p) => p.id}
            colunas={[
              ...colunas.slice(0, 2),
              { titulo: 'Cadastrado por', largura: '18%', celula: (p: PessoaNoDossie) => p.cadastradoPor },
              ...colunas.slice(3),
            ]}
          />
        </View>
      ) : null}
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

export function RelatorioDoTime({ dossie, neo, neoErro, modelo }: RelatorioProps) {
  return (
    <Document
      title={s(`Relatório do time ${dossie.time.nome}`)}
      author={s(`NEO · ${appConfig.name}`)}
      subject="Relatório do time"
      creator={appConfig.name}
      language="pt-BR"
    >
      <Capa dossie={dossie} neo={neo} modelo={modelo} />
      <Page size="A4" style={st.page}>
        <Cabecalho dossie={dossie} />
        <Resumo dossie={dossie} neo={neo} neoErro={neoErro} />
        <Numeros dossie={dossie} />
        <Lideres dossie={dossie} neo={neo} />
        <Territorio dossie={dossie} neo={neo} />
        <Qualidade dossie={dossie} neo={neo} />
        <Plano neo={neo} />
        <Anexo dossie={dossie} />
        <Rodape dossie={dossie} />
      </Page>
    </Document>
  );
}

/** Gera o arquivo. Chamado so no clique: a biblioteca e pesada. */
export async function gerarPdfDoRelatorio(props: RelatorioProps): Promise<Blob> {
  return pdf(<RelatorioDoTime {...props} />).toBlob();
}

/** relatorio-<time>-<data>.pdf, sem acento nem espaco. */
export function nomeDoPdf(dossie: Dossie): string {
  const time = dossie.time.nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `relatorio-${time || 'time'}-${dossie.geradoEm.slice(0, 10)}.pdf`;
}
