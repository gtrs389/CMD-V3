import type { ReactNode } from 'react';
import { Path, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import { initials } from '@/lib/utils/text';

/**
 * Pecas comuns dos PDFs do sistema: o relatorio estrategico do NEO, o
 * relatorio de inconsistencias e a lista filtrada. Uma identidade so — o
 * mesmo azul-marinho, o mesmo dourado, a mesma tabela.
 */

export const C = {
  navy: '#0b1b33',
  navy2: '#16305a',
  navy3: '#8ea3c0',
  navySoft: '#e9eef5',
  gold: '#b8912f',
  goldSoft: '#f7f0de',
  blue: '#1f5fbf',
  blueSoft: '#e8f0fb',
  ink: '#141d27',
  ink2: '#2c3a48',
  muted: '#4f5d6b',
  faint: '#7d8d9c',
  line: '#d8dfe7',
  bg: '#f3f5f8',
  success: '#17693a',
  successSoft: '#e6f3eb',
  warning: '#8f5a00',
  warningSoft: '#fbf2e0',
  danger: '#b3261e',
  dangerSoft: '#fcebea',
  white: '#ffffff',
};

/**
 * Helvetica e Times embutidas falam WinAnsi: todo o portugues cabe, mas uma
 * seta ou um emoji vindo do texto do NEO viraria um quadrado. Troca o que da
 * e tira o resto.
 */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export function s(texto: string | number | null | undefined): string {
  return String(texto ?? '')
    .replace(/→/g, '›')
    .replace(/←/g, '‹')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/×/g, 'x')
    .split('')
    .filter((c) => c.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.has(c))
    .join('');
}

export const num = (n: number) => n.toLocaleString('pt-BR');
export const data = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
export const dataLonga = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
export const telefone = (t: string) => {
  const d = (t ?? '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || '—';
};
export const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

/** Nome de arquivo sem acento nem espaco. */
export function slug(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'time'
  );
}

export const st = StyleSheet.create({
  page: {
    paddingTop: 64,
    paddingBottom: 58,
    paddingHorizontal: 46,
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: C.ink,
    // Sem `lineHeight` aqui, de proposito: a biblioteca recalcula o valor
    // relativo HERDADO a cada pagina nos blocos `fixed` (cabecalho e
    // rodape), multiplicando-o pelo tamanho da fonte de novo e de novo — num
    // relatorio de muitas paginas o numero estoura e o PDF nao sai. Cada
    // texto que precisa de entrelinha diz a sua.
  },
  cabecalho: {
    position: 'absolute',
    top: 26,
    left: 46,
    right: 46,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.6,
    borderBottomColor: C.line,
    paddingBottom: 7,
    fontSize: 7,
    color: C.faint,
    letterSpacing: 0.6,
  },
  rodape: {
    position: 'absolute',
    bottom: 24,
    left: 46,
    right: 46,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.6,
    borderTopColor: C.line,
    paddingTop: 6,
    fontSize: 6.8,
    color: C.faint,
  },
  h3: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.navy,
    marginBottom: 6,
    marginTop: 16,
    letterSpacing: 0.2,
  },
  paragrafo: { fontSize: 9.6, color: C.ink2, marginBottom: 7, textAlign: 'justify', lineHeight: 1.55 },
  serifa: { fontFamily: 'Times-Roman', fontSize: 11.2, color: C.ink, lineHeight: 1.55, textAlign: 'justify', marginBottom: 8 },
  kicker: { fontSize: 7, color: C.gold, letterSpacing: 2, fontFamily: 'Helvetica-Bold' },
  rotulo: { fontSize: 6.8, color: C.faint, letterSpacing: 1, textTransform: 'uppercase' },
  tabelaCab: {
    flexDirection: 'row',
    backgroundColor: C.navy,
    color: C.white,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    letterSpacing: 0.4,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  tabelaLinha: {
    flexDirection: 'row',
    fontSize: 8,
    paddingVertical: 4.2,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    alignItems: 'center',
  },
  chip: {
    fontSize: 6.6,
    paddingVertical: 1.6,
    paddingHorizontal: 5,
    borderRadius: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.3,
  },
});

export function Chip({ texto, cor, fundo }: { texto: string; cor: string; fundo: string }) {
  return <Text style={[st.chip, { color: cor, backgroundColor: fundo }]}>{s(texto)}</Text>;
}

/** Abertura de secao: numero, titulo e uma linha dourada. */
export function Secao({ numero, titulo, sub }: { numero: string; titulo: string; sub?: string }) {
  return (
    <View style={{ marginBottom: 14 }} wrap={false} minPresenceAhead={120}>
      <Text style={st.kicker}>{s(numero)}</Text>
      <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.navy, lineHeight: 1.15, marginTop: 3 }}>{s(titulo)}</Text>
      {sub ? <Text style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>{s(sub)}</Text> : null}
      <View style={{ width: 42, height: 2, backgroundColor: C.gold, marginTop: 8 }} />
    </View>
  );
}

export function Paragrafos({ texto, estilo = 'sans' }: { texto: string; estilo?: 'sans' | 'serifa' }) {
  return (
    <>
      {s(texto)
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <Text key={i} style={estilo === 'serifa' ? st.serifa : st.paragrafo}>
            {p}
          </Text>
        ))}
    </>
  );
}

/** Numero grande com rotulo. */
export function Kpi({
  valor,
  rotulo,
  nota,
  tom = C.navy,
}: {
  valor: string;
  rotulo: string;
  nota?: string;
  tom?: string;
}) {
  return (
    <View style={{ flex: 1, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: C.bg, borderTopWidth: 2, borderTopColor: tom }}>
      <Text style={{ fontSize: 17, fontFamily: 'Helvetica-Bold', color: tom, lineHeight: 1.1 }}>{s(valor)}</Text>
      <Text style={{ fontSize: 7.4, color: C.ink2, marginTop: 3 }}>{s(rotulo)}</Text>
      {nota ? <Text style={{ fontSize: 6.6, color: C.faint, marginTop: 1.5 }}>{s(nota)}</Text> : null}
    </View>
  );
}

export function LinhaDeKpis({ children }: { children: ReactNode[] }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 6 }} wrap={false}>
      {children.map((filho, i) => (
        <View key={i} style={{ flex: 1, marginLeft: i ? 6 : 0, flexDirection: 'row' }}>
          {filho}
        </View>
      ))}
    </View>
  );
}

/** Anel: arco proporcional, desenhado com Path para nao depender de dasharray. */
export function Anel({
  valor,
  cor,
  tamanho = 84,
  rotulo,
  sufixo = '',
}: {
  valor: number;
  cor: string;
  tamanho?: number;
  rotulo?: string;
  sufixo?: string;
}) {
  const r = 40;
  const v = Math.max(0, Math.min(100, valor));
  const ang = (v / 100) * 2 * Math.PI - Math.PI / 2;
  const x = 50 + r * Math.cos(ang);
  const y = 50 + r * Math.sin(ang);
  const grande = v > 50 ? 1 : 0;
  return (
    <View style={{ width: tamanho, height: tamanho, position: 'relative' }}>
      <Svg viewBox="0 0 100 100" style={{ width: tamanho, height: tamanho }}>
        <Path d="M 50 10 A 40 40 0 1 1 49.99 10" stroke="#e4e9ef" strokeWidth={9} fill="none" />
        {v >= 99.9 ? (
          <Path d="M 50 10 A 40 40 0 1 1 49.99 10" stroke={cor} strokeWidth={9} fill="none" />
        ) : v > 0 ? (
          <Path d={`M 50 10 A 40 40 0 ${grande} 1 ${x.toFixed(2)} ${y.toFixed(2)}`} stroke={cor} strokeWidth={9} fill="none" strokeLinecap="round" />
        ) : null}
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, width: tamanho, height: tamanho, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: tamanho / (sufixo ? 4.7 : 3.9), fontFamily: 'Helvetica-Bold', color: cor, lineHeight: 1 }}>
          {`${v}${sufixo}`}
        </Text>
        {rotulo ? <Text style={{ fontSize: 6.2, color: C.muted, marginTop: 2 }}>{s(rotulo)}</Text> : null}
      </View>
    </View>
  );
}

export interface ItemDeBarra {
  rotulo: string;
  quantidade: number;
  cor?: string;
}

/** Barras horizontais com rotulo e valor. */
export function Barras({
  itens,
  cor = C.blue,
  total,
  larguraDoRotulo = 118,
  vazio = 'Sem dados.',
}: {
  itens: ItemDeBarra[];
  cor?: string;
  total?: number;
  larguraDoRotulo?: number;
  vazio?: string;
}) {
  const maior = Math.max(1, ...itens.map((i) => i.quantidade));
  if (itens.length === 0) return <Text style={{ fontSize: 8.5, color: C.faint }}>{s(vazio)}</Text>;
  return (
    <View>
      {itens.map((item) => (
        <View key={item.rotulo} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }} wrap={false}>
          <Text style={{ width: larguraDoRotulo, fontSize: 7.8, color: C.ink2 }}>{s(item.rotulo)}</Text>
          <View style={{ flex: 1, height: 6.5, backgroundColor: '#e7ecf1', borderRadius: 3 }}>
            <View
              style={{
                width: `${item.quantidade ? Math.max(2, (item.quantidade / maior) * 100) : 0}%`,
                height: 6.5,
                backgroundColor: item.cor ?? cor,
                borderRadius: 3,
              }}
            />
          </View>
          <Text style={{ width: 54, textAlign: 'right', fontSize: 7.8, fontFamily: 'Helvetica-Bold' }}>
            {num(item.quantidade)}
            {total ? <Text style={{ fontFamily: 'Helvetica', color: C.faint }}>{` · ${pct(item.quantidade, total)}%`}</Text> : null}
          </Text>
        </View>
      ))}
    </View>
  );
}

export interface ColunaDaTabela<T> {
  titulo: string;
  largura: number | string;
  celula: (item: T, indice: number) => ReactNode;
  alinhar?: 'right' | 'left' | 'center';
}

export function Tabela<T>({
  colunas,
  linhas,
  chave,
  vazio = 'Nada a listar.',
}: {
  colunas: ColunaDaTabela<T>[];
  linhas: T[];
  chave: (item: T, indice: number) => string;
  vazio?: string;
}) {
  if (linhas.length === 0) return <Text style={{ fontSize: 8.5, color: C.faint }}>{s(vazio)}</Text>;
  const justificar = (a?: 'right' | 'left' | 'center') =>
    a === 'right' ? 'flex-end' : a === 'center' ? 'center' : 'flex-start';
  return (
    <View>
      {/* `fixed` dentro da tabela: o cabecalho se repete em cada pagina por
          onde ela passa. */}
      <View style={st.tabelaCab} fixed>
        {colunas.map((c) => (
          <Text key={c.titulo} style={{ width: c.largura, textAlign: c.alinhar ?? 'left', paddingRight: 3 }}>
            {s(c.titulo.toUpperCase())}
          </Text>
        ))}
      </View>
      {linhas.map((item, i) => (
        <View key={chave(item, i)} style={[st.tabelaLinha, i % 2 === 1 ? { backgroundColor: '#f7f9fb' } : {}]} wrap={false}>
          {colunas.map((c) => (
            <View key={c.titulo} style={{ width: c.largura, alignItems: justificar(c.alinhar), paddingRight: 3 }}>
              {(() => {
                const conteudo = c.celula(item, i);
                return typeof conteudo === 'string' || typeof conteudo === 'number' ? <Text>{s(conteudo)}</Text> : conteudo;
              })()}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Cabecalho corrido das paginas internas. */
export function Cabecalho({ esquerda, direita }: { esquerda: string; direita: string }) {
  return (
    <View style={st.cabecalho} fixed>
      <Text>{s(esquerda.toUpperCase())}</Text>
      <Text>{s(direita.toUpperCase())}</Text>
    </View>
  );
}

export function Rodape({ texto }: { texto: string }) {
  return (
    <View style={st.rodape} fixed>
      <Text>{s(texto)}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}

export const TOM_GRAVIDADE: Record<string, { cor: string; fundo: string; rotulo: string }> = {
  alta: { cor: C.danger, fundo: C.dangerSoft, rotulo: 'ALTA' },
  media: { cor: C.warning, fundo: C.warningSoft, rotulo: 'MÉDIA' },
  baixa: { cor: C.muted, fundo: C.bg, rotulo: 'BAIXA' },
};

export const TOM_SELO: Record<string, { cor: string; fundo: string }> = {
  Motor: { cor: C.success, fundo: C.successSoft },
  Constante: { cor: C.blue, fundo: C.blueSoft },
  Esfriando: { cor: C.warning, fundo: C.warningSoft },
  Parado: { cor: C.danger, fundo: C.dangerSoft },
  'Sem Equipe': { cor: C.muted, fundo: C.bg },
};

/* -------------------------------------------------------------------------
   Por lideranca: o grafico e a lista agrupada
   ------------------------------------------------------------------------- */

/** Cores das categorias empilhadas: distintas entre si, legiveis impressas. */
export const CORES_DE_CATEGORIA = [C.danger, C.warning, C.blue, C.gold, C.navy2, C.success, '#7a4db0', '#0f7d86'];

export interface CategoriaDoGrafico {
  rotulo: string;
  cor: string;
}

export interface BarraDoGrafico {
  responsavel: string;
  quantidades: number[];
  total: number;
  base: number | null;
}

export function Legenda({ categorias }: { categorias: CategoriaDoGrafico[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 }}>
      {categorias.map((c) => (
        <View key={c.rotulo} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 3 }}>
          <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: c.cor, marginRight: 4 }} />
          <Text style={{ fontSize: 7.2, color: C.ink2 }}>{s(c.rotulo)}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Uma barra por lideranca, empilhada por categoria. Ao lado, a quantidade e
 * — quando a base da lideranca e conhecida — quanto isso e DA BASE DELA: 12
 * pendencias numa base de 300 e diferente de 12 numa base de 15.
 */
export function GraficoPorLideranca({
  barras,
  categorias,
  totalDaLista,
  limite = 30,
}: {
  barras: BarraDoGrafico[];
  categorias: CategoriaDoGrafico[];
  totalDaLista: number;
  limite?: number;
}) {
  if (barras.length === 0) return null;
  const maior = Math.max(1, ...barras.map((b) => b.total));
  const mostradas = barras.slice(0, limite);
  const resto = barras.slice(limite);
  return (
    <View>
      {categorias.length > 1 ? <Legenda categorias={categorias} /> : null}
      {mostradas.map((b, i) => (
        <View key={b.responsavel} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }} wrap={false}>
          <Text style={{ width: 16, fontSize: 7, color: C.faint }}>{String(i + 1)}</Text>
          <Text style={{ width: 150, fontSize: 7.8, color: C.ink, fontFamily: i < 3 ? 'Helvetica-Bold' : 'Helvetica', paddingRight: 6 }}>
            {s(b.responsavel)}
          </Text>
          <View style={{ flex: 1, height: 8, backgroundColor: '#edf1f5', borderRadius: 2, flexDirection: 'row' }}>
            {b.quantidades.map((q, ci) =>
              q ? (
                <View
                  key={ci}
                  style={{ width: `${(q / maior) * 100}%`, height: 8, backgroundColor: categorias[ci]?.cor ?? C.blue }}
                />
              ) : null,
            )}
          </View>
          <Text style={{ width: 96, textAlign: 'right', fontSize: 7.8 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{num(b.total)}</Text>
            <Text style={{ color: C.faint }}>
              {b.base ? ` · ${pct(b.total, b.base)}% da base` : ` · ${pct(b.total, totalDaLista)}% da lista`}
            </Text>
          </Text>
        </View>
      ))}
      {resto.length ? (
        <Text style={{ fontSize: 7.4, color: C.faint, marginTop: 2 }}>
          {s(`E mais ${num(resto.length)} ${resto.length === 1 ? 'responsável' : 'responsáveis'}, com ${num(resto.reduce((soma, b) => soma + b.total, 0))} no total — todos na lista abaixo.`)}
        </Text>
      ) : null}
    </View>
  );
}

/** Faixa de abertura de cada grupo "cadastrado por". */
export function FaixaDoResponsavel({
  responsavel,
  quantidade,
  totalDaLista,
  base,
  rotulo = 'pessoas',
}: {
  responsavel: string;
  quantidade: number;
  totalDaLista: number;
  base: number | null;
  rotulo?: string;
}) {
  return (
      <View
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.navySoft, paddingVertical: 5, paddingRight: 6, marginTop: 10, marginBottom: 2 }}
      >
        <View style={{ width: 2.5, height: 14, backgroundColor: C.gold, marginRight: 7 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 6.4, color: C.faint, letterSpacing: 1 }}>CADASTRADO POR</Text>
          <Text style={{ fontSize: 9.4, fontFamily: 'Helvetica-Bold', color: C.navy }}>{s(responsavel)}</Text>
        </View>
        <Text style={{ fontSize: 8, color: C.ink2 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold' }}>{`${num(quantidade)} ${quantidade === 1 ? rotulo.replace(/s$/, '') : rotulo}`}</Text>
          <Text style={{ color: C.faint }}>
            {` · ${pct(quantidade, totalDaLista)}% da lista${base ? ` · ${pct(quantidade, base)}% da base` : ''}`}
          </Text>
        </Text>
      </View>
  );
}

/**
 * Um grupo inteiro (faixa + tabela, e o titulo da secao quando e o
 * primeiro) numa pagina so, quando cabe: a biblioteca desenha por cima
 * quando uma faixa e empurrada sozinha para a pagina seguinte. Grupo grande
 * quebra normalmente — a faixa na abertura e o cabecalho da tabela
 * repetido em cada pagina.
 */
export function BlocoDoGrupo({ linhas, children }: { linhas: number; children: ReactNode }) {
  return <View wrap={linhas > 22}>{children}</View>;
}

/** Faixa de abertura de um grupo qualquer: rotulo pequeno, titulo e um resumo a direita. */
export function FaixaDeGrupo({ rotulo, titulo, direita }: { rotulo: string; titulo: string; direita: ReactNode }) {
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.navySoft, paddingVertical: 5, paddingRight: 6, marginTop: 10, marginBottom: 2 }}
    >
      <View style={{ width: 2.5, height: 14, backgroundColor: C.gold, marginRight: 7 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 6.4, color: C.faint, letterSpacing: 1 }}>{s(rotulo.toUpperCase())}</Text>
        <Text style={{ fontSize: 9.4, fontFamily: 'Helvetica-Bold', color: C.navy }}>{s(titulo)}</Text>
      </View>
      <Text style={{ fontSize: 8, color: C.ink2, maxWidth: 280, textAlign: 'right' }}>{direita}</Text>
    </View>
  );
}

/* -------------------------------------------------------------------------
   Cadastrado mais de uma vez: o mesmo cartao da tela
   ------------------------------------------------------------------------- */

export interface RegistroRepetidoPdf {
  id: string;
  nome: string;
  /** "Líder" ou "Equipe". */
  nivel: string;
  cadastradoEm: string;
  /** "Pelo link" ou "Pelo painel". */
  como: string;
  ondeMora: string;
  cadastradoPor: string;
  telefone: string;
  votaEm: string;
  primeiro: boolean;
}

export interface GrupoRepetidoPdf {
  nome: string;
  /** "Repetido com certeza", "Muito provável", "Possível repetição". */
  certeza: string;
  nivel: 'certa' | 'provavel' | 'possivel';
  evidencias: string[];
  /** "telefone e bairro" — ja no jeito que se fala. */
  divergencias: string;
  responsaveis: string[];
  registros: RegistroRepetidoPdf[];
}

const TOM_DA_CERTEZA = {
  certa: { cor: C.danger, fundo: C.dangerSoft },
  provavel: { cor: C.warning, fundo: C.warningSoft },
  possivel: { cor: C.muted, fundo: C.bg },
};



function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Text style={{ fontSize: 7.8, color: C.muted, marginBottom: 1.5 }}>
      {s(`${rotulo}: `)}
      <Text style={{ color: C.ink2 }}>{s(valor || '—')}</Text>
    </Text>
  );
}

/**
 * A pessoa cadastrada mais de uma vez, como na tela: cabecalho, os avisos
 * (conta para mais de um responsavel, registros que discordam) e a linha do
 * tempo dos cadastros — o primeiro em verde, as copias em vermelho.
 */
export function CartaoRepetido({ grupo }: { grupo: GrupoRepetidoPdf }) {
  const tom = TOM_DA_CERTEZA[grupo.nivel];
  const avisos = grupo.responsaveis.length > 1 || grupo.divergencias;
  return (
    <View style={{ borderWidth: 0.7, borderColor: C.line, borderRadius: 5, marginBottom: 8 }} wrap={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f6f8fa', paddingHorizontal: 9, paddingVertical: 7, borderBottomWidth: 0.6, borderBottomColor: C.line }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.white, borderWidth: 0.6, borderColor: C.line, justifyContent: 'center', alignItems: 'center', marginRight: 8 }}>
          <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.muted }}>{s(initials(grupo.nome))}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.ink }}>{s(grupo.nome)}</Text>
          <Text style={{ fontSize: 7.6, color: C.muted, marginTop: 1 }}>{s(`${grupo.registros.length} registros`)}</Text>
        </View>
        <Chip texto={grupo.certeza} cor={tom.cor} fundo={tom.fundo} />
      </View>

      {/* Por que e a mesma pessoa, com o dado repetido, em destaque. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', backgroundColor: tom.fundo, paddingHorizontal: 9, paddingVertical: 6, borderBottomWidth: 0.6, borderBottomColor: C.line }}>
        <Text style={{ fontSize: 6.6, fontFamily: 'Helvetica-Bold', color: C.muted, letterSpacing: 0.6, marginRight: 6 }}>
          {s('POR QUE É A MESMA PESSOA')}
        </Text>
        {grupo.evidencias.map((evidencia, i) => (
          <View key={i} style={{ borderWidth: 0.7, borderColor: tom.cor, backgroundColor: C.white, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2.5, marginRight: 4, marginVertical: 1 }}>
            <Text style={{ fontSize: 8.4, fontFamily: 'Helvetica-Bold', color: tom.cor }}>{s(evidencia)}</Text>
          </View>
        ))}
      </View>

      {avisos ? (
        <View style={{ paddingHorizontal: 9, paddingVertical: 6, borderBottomWidth: 0.6, borderBottomColor: C.line }}>
          {grupo.responsaveis.length > 1 ? (
            <Text style={{ fontSize: 7.8, color: C.warning, marginBottom: grupo.divergencias ? 2 : 0 }}>
              {s(`! Conta para ${grupo.responsaveis.length} responsáveis no ranking: `)}
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(grupo.responsaveis.join(' e '))}</Text>.
            </Text>
          ) : null}
          {grupo.divergencias ? (
            <Text style={{ fontSize: 7.8, color: C.muted }}>
              {s('Os registros discordam em ')}
              <Text style={{ fontFamily: 'Helvetica-Bold', color: C.ink2 }}>{s(grupo.divergencias)}</Text>
              {s(': confira qual está certo antes de excluir a cópia.')}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 9, paddingTop: 7, paddingBottom: 3 }}>
        {grupo.registros.map((r, i) => {
          const ultimo = i === grupo.registros.length - 1;
          return (
            <View key={i} style={{ flexDirection: 'row', marginBottom: ultimo ? 4 : 8 }}>
              {/* Linha do tempo: o ponto e o traco ate o proximo cadastro. */}
              <View style={{ width: 14, alignItems: 'center' }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: r.primeiro ? C.success : C.danger, marginTop: 2 }} />
                {!ultimo ? <View style={{ width: 0.8, flexGrow: 1, backgroundColor: C.line, marginTop: 2, marginBottom: -8 }} /> : null}
              </View>
              <View style={{ flex: 1, paddingLeft: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                  <Text style={{ fontSize: 9.2, fontFamily: 'Helvetica-Bold', color: C.blue, marginRight: 5 }}>{s(r.nome)}</Text>
                  <Chip
                    texto={`${i + 1}º cadastro`}
                    cor={r.primeiro ? C.success : C.danger}
                    fundo={r.primeiro ? C.successSoft : C.dangerSoft}
                  />
                  <View style={{ width: 4 }} />
                  {/* Lider desativado em vermelho, como na tela. */}
                  <Chip
                    texto={r.nivel}
                    cor={r.nivel === 'Líder desativado' ? C.danger : C.ink2}
                    fundo={r.nivel === 'Líder desativado' ? C.dangerSoft : C.navySoft}
                  />
                </View>
                {/* No PDF so o que serve para decidir: quem cadastrou, o
                    telefone e onde vota. Quando, como e onde mora ficam na
                    tela. */}
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ flex: 1.3, paddingRight: 8 }}>
                    <Dado rotulo="Por" valor={r.cadastradoPor} />
                  </View>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Dado rotulo="Telefone" valor={telefone(r.telefone)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Dado rotulo="Vota em" valor={r.votaEm} />
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
