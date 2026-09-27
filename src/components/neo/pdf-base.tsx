import type { ReactNode } from 'react';
import { Path, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';

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
