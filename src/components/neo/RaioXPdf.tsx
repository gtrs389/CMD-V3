import { Document, Page, Text, View, pdf } from '@react-pdf/renderer';
import { appConfig } from '@/config/app.config';
import { chaveDaSecao, conversao, leitura, type EscolaNoComparativo, type LiderNoRaioX } from '@/lib/domain/confronto';
import { initials } from '@/lib/utils/text';
import { C, Cabecalho, Rodape, num, s, st } from './pdf-base';
import { FotoNoPdf } from './FotoNoPdf';
import { semHifen } from './ConfrontoPdf';

/**
 * O Raio-X da escola em PDF: o MESMO quadro que abre na tela.
 *
 *   1. a etiqueta "Raio-X · Fulano × Beltrano", o nome e o endereco;
 *   2. o quadro azul-marinho: a estimativa do time e cada candidato com
 *      foto, votos, conversao e quanto ficou acima ou abaixo — e as barras,
 *      todas na mesma escala;
 *   3. a frase amarela que diz o que a escola mostrou;
 *   4. os Lideres que cadastraram a estimativa, do maior para o menor;
 *   5. secao por secao: a estimativa e os votos de cada candidato.
 *
 * As cores sao as da tela (e do mapa): azul-marinho e a estimativa; cada
 * candidato tem a sua; com um candidato so, o apurado e ouro.
 */

export interface CandidatoNoRaioXPdf {
  nome: string;
  /** "Fulano (15123) · Deputado Estadual". */
  rotulo: string;
  cor: string;
  /** Foto oficial (data URL); sem ela, as iniciais. */
  foto: string | null;
}

export interface PdfDoRaioXProps {
  escola: EscolaNoComparativo;
  candidatos: CandidatoNoRaioXPdf[];
  lideres: LiderNoRaioX[];
  geradoEm: string;
}

const OURO = '#e0a426';
const NAVY_BARRA = '#16263f';
const TRILHO = '#e7ecf1';
const conv = (estimativa: number, apurado: number) => conversao({ estimativa, apurado });
const corDaConversao = (c: number | null) => (c === null ? '#94a3b8' : c >= 100 ? '#4ade80' : c >= 80 ? '#f2c14e' : '#f87171');
const largura = (v: number, maior: number) => (v > 0 ? Math.max(2, (v / Math.max(1, maior)) * 100) : 0);

const LEITURA: Record<ReturnType<typeof leitura>, { texto: string; cor: string; fundo: string } | null> = {
  ACIMA: { texto: 'Acima da estimativa', cor: C.success, fundo: C.successSoft },
  PERTO: { texto: 'Perto da estimativa', cor: '#7a5410', fundo: '#fdf6e3' },
  ABAIXO: { texto: 'Abaixo da estimativa', cor: C.danger, fundo: C.dangerSoft },
  ZERADA: { texto: 'Nenhum voto', cor: C.danger, fundo: C.dangerSoft },
  SEM_ESTIMATIVA: null,
};

function frase(escola: EscolaNoComparativo, candidatos: CandidatoNoRaioXPdf[]): string {
  if (candidatos.length === 1) {
    const apurado = escola.apurado[0] ?? 0;
    const nome = candidatos[0].nome;
    const c = conv(escola.estimativa, apurado);
    if (escola.estimativa <= 0) return `${nome} teve ${num(apurado)} votos aqui, onde o time não tinha estimativa.`;
    if (apurado <= 0) return `O time estimava ${num(escola.estimativa)} votos aqui, e ${nome} não teve nenhum até agora.`;
    if ((c ?? 0) >= 100) return `${nome} teve ${num(apurado)} votos onde o time estimava ${num(escola.estimativa)}: ${Math.round(c!)}% da estimativa.`;
    return `${nome} teve ${num(apurado)} dos ${num(escola.estimativa)} votos estimados: ${Math.round(c!)}% da estimativa.`;
  }
  const partes = candidatos.map((c, i) => {
    const v = escola.apurado[i] ?? 0;
    const p = conv(escola.estimativa, v);
    return `${c.nome} teve ${num(v)}${p !== null ? ` (${Math.round(p)}%)` : ''}`;
  });
  const lista = `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;
  return escola.estimativa > 0
    ? `${lista}, contra ${num(escola.estimativa)} votos estimados pelo time nesta escola.`
    : `${lista}. O time não tinha estimativa aqui.`;
}

function Barra({ valor, maior, cor, fundo = TRILHO, altura = 6 }: { valor: number; maior: number; cor: string; fundo?: string; altura?: number }) {
  return (
    <View style={{ height: altura, borderRadius: altura / 2, backgroundColor: fundo, flex: 1, overflow: 'hidden' }}>
      <View style={{ height: altura, borderRadius: altura / 2, width: `${largura(valor, maior)}%`, backgroundColor: cor }} />
    </View>
  );
}

function Diferenca({ diferenca }: { diferenca: number }) {
  const sobe = diferenca > 0;
  const desce = diferenca < 0;
  return (
    <View
      style={{
        paddingVertical: 2,
        paddingHorizontal: 6,
        borderRadius: 7,
        backgroundColor: sobe ? 'rgba(74,222,128,0.18)' : desce ? 'rgba(180,35,24,0.45)' : 'rgba(255,255,255,0.12)',
      }}
    >
      <Text style={{ fontSize: 7.6, fontFamily: 'Helvetica-Bold', color: sobe ? '#4ade80' : desce ? '#f3c6c2' : C.white }}>
        {s(sobe ? `+${num(diferenca)}` : desce ? `${num(diferenca)}` : '= estimativa')}
      </Text>
    </View>
  );
}

/** O quadro azul-marinho do topo, igual ao da tela. */
function Quadro({ escola, candidatos }: { escola: EscolaNoComparativo; candidatos: CandidatoNoRaioXPdf[] }) {
  const maior = Math.max(1, escola.estimativa, ...escola.apurado);
  const varios = candidatos.length > 1;
  return (
    <View style={{ backgroundColor: C.navy, borderRadius: 8, padding: 14, marginTop: 12 }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 130, paddingRight: 12, borderRightWidth: 0.6, borderRightColor: 'rgba(255,255,255,0.15)' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 6, height: 6, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.8)', marginRight: 4 }} />
            <Text style={{ fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: C.navy3, letterSpacing: 0.8 }}>{s('ESTIMATIVA DO TIME')}</Text>
          </View>
          <Text style={{ fontSize: 34, fontFamily: 'Helvetica-Bold', color: C.white, marginTop: 4 }}>{num(escola.estimativa)}</Text>
          <Text style={{ fontSize: 7.4, color: C.navy3, marginTop: 3, lineHeight: 1.4 }}>
            {s(varios ? 'pessoas cadastradas que votam aqui: a mesma conta para todos os candidatos' : 'pessoas cadastradas que votam aqui')}
          </Text>
        </View>

        <View style={{ flex: 1, paddingLeft: 12, flexDirection: 'row', flexWrap: 'wrap' }}>
          {candidatos.map((c, i) => {
            const votos = escola.apurado[i] ?? 0;
            const p = conv(escola.estimativa, votos);
            const cor = varios ? c.cor : OURO;
            return (
              <View
                key={c.rotulo}
                wrap={false}
                style={{
                  width: varios ? '48%' : '100%',
                  marginRight: varios && i % 2 === 0 ? '4%' : 0,
                  marginBottom: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderWidth: 0.6,
                  borderColor: 'rgba(255,255,255,0.12)',
                  borderLeftWidth: 3,
                  borderLeftColor: cor,
                  borderRadius: 5,
                  padding: 7,
                }}
              >
                <FotoNoPdf src={c.foto} nome={c.nome} tamanho={34} anel="rgba(255,255,255,0.35)" />
                <View style={{ flex: 1, marginLeft: 7 }}>
                  <Text hyphenationCallback={semHifen} style={{ fontSize: 8.6, fontFamily: 'Helvetica-Bold', color: C.white }}>{s(c.nome)}</Text>
                  <Text style={{ fontSize: 6.6, color: C.navy3, marginTop: 1 }}>{s(c.rotulo.split(' · ').slice(1).join(' · ') || c.rotulo)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                    <Text style={{ fontSize: 17, fontFamily: 'Helvetica-Bold', color: varios ? C.white : OURO }}>{num(votos)}</Text>
                    <Text style={{ fontSize: 7, color: C.navy3, marginLeft: 3, marginRight: 5 }}>{s('votos')}</Text>
                    {p !== null ? (
                      <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: corDaConversao(p), marginRight: 5 }}>{`${Math.round(p)}%`}</Text>
                    ) : null}
                    {escola.estimativa > 0 ? <Diferenca diferenca={votos - escola.estimativa} /> : null}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* As barras na mesma escala: a distancia entre elas e a historia. */}
      <View style={{ marginTop: 10 }}>
        {[{ rotulo: 'Estimativa', valor: escola.estimativa, cor: 'rgba(255,255,255,0.88)' }, ...candidatos.map((c, i) => ({ rotulo: c.nome, valor: escola.apurado[i] ?? 0, cor: varios ? c.cor : OURO }))].map(
          (b) => (
            <View key={b.rotulo} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
              <Text hyphenationCallback={semHifen} style={{ width: 110, fontSize: 7.2, color: 'rgba(255,255,255,0.75)', paddingRight: 6 }}>{s(b.rotulo)}</Text>
              <Barra valor={b.valor} maior={maior} cor={b.cor} fundo="rgba(255,255,255,0.10)" altura={7} />
              <Text style={{ width: 38, textAlign: 'right', fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.white }}>{num(b.valor)}</Text>
            </View>
          ),
        )}
      </View>
    </View>
  );
}

/**
 * Os Lideres da escola, cada um com quantas PESSOAS cadastrou que votam ali.
 * No PDF nao entra a linha "sem lider registrado": ela fecha a conta na
 * tela, mas no papel so confunde quem le a lista de Lideres.
 */
function Lideres({ escola, lideres }: { escola: EscolaNoComparativo; lideres: LiderNoRaioX[] }) {
  const maior = Math.max(1, ...lideres.map((l) => l.cadastrados));
  return (
    <View style={{ borderWidth: 0.7, borderColor: C.line, borderRadius: 7, marginTop: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 0.7, borderBottomColor: C.line }}>
        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.ink }}>{s('Líderes nesta escola')}</Text>
        <Text style={{ fontSize: 7.6, color: C.muted }}>{s(`${num(lideres.length)} ${lideres.length === 1 ? 'líder' : 'líderes'}`)}</Text>
      </View>
      {lideres.length === 0 ? (
        <Text style={{ fontSize: 8.4, color: C.muted, padding: 10, textAlign: 'center' }}>{s('Nenhum líder registrado nos cadastros desta escola.')}</Text>
      ) : null}
      {lideres.map((l, i) => {
        const parte = escola.estimativa > 0 ? Math.round((l.cadastrados / escola.estimativa) * 100) : 0;
        return (
          <View
            key={l.id}
            wrap={false}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5.5, borderBottomWidth: i === lideres.length - 1 ? 0 : 0.5, borderBottomColor: C.line }}
          >
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.navy, justifyContent: 'center', alignItems: 'center', marginRight: 8 }}>
              <Text style={{ fontSize: 7.4, fontFamily: 'Helvetica-Bold', color: '#f2c14e' }}>{s(initials(l.nome))}</Text>
            </View>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text hyphenationCallback={semHifen} style={{ fontSize: 8.8, fontFamily: 'Helvetica-Bold', color: C.ink }}>{s(l.nome)}</Text>
              <View style={{ flexDirection: 'row', marginTop: 3 }}>
                <Barra valor={l.cadastrados} maior={maior} cor={NAVY_BARRA} altura={4} />
              </View>
            </View>
            <View style={{ width: 150, alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.navy }}>{num(l.cadastrados)}</Text>
              <Text style={{ fontSize: 7.2, color: C.ink2, marginTop: 1 }}>
                {s(l.cadastrados === 1 ? 'pessoa cadastrada nesta escola' : 'pessoas cadastradas nesta escola')}
              </Text>
              <Text style={{ fontSize: 6.6, color: C.faint, marginTop: 1 }}>{s(`${parte}% da escola`)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Secoes({ escola, candidatos }: { escola: EscolaNoComparativo; candidatos: CandidatoNoRaioXPdf[] }) {
  const varios = candidatos.length > 1;
  const maior = Math.max(1, ...escola.secoes.map((x) => Math.max(x.estimativa, ...x.apurado)));
  const comNumero = escola.secoes.filter((x) => x.zona || x.secao);
  const zonas = [...new Set(comNumero.map((x) => x.zona).filter(Boolean))];
  return (
    <View style={{ borderWidth: 0.7, borderColor: C.line, borderRadius: 7, marginTop: 12 }}>
      <View
        wrap={false}
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 0.7, borderBottomColor: C.line }}
      >
        <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.ink }}>
          {s(`${zonas.length ? `Zona ${zonas.join(', ')} · ` : ''}${comNumero.length} ${comNumero.length === 1 ? 'seção' : 'seções'}`)}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {[{ rotulo: 'estimativa', cor: NAVY_BARRA }, ...(varios ? candidatos.map((c) => ({ rotulo: c.nome.split(' ')[0], cor: c.cor })) : [{ rotulo: 'apurado', cor: OURO }])].map((l) => (
            <View key={l.rotulo} style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
              <View style={{ width: 8, height: 5, borderRadius: 1.5, backgroundColor: l.cor, marginRight: 3 }} />
              <Text style={{ fontSize: 7, color: C.muted }}>{s(l.rotulo)}</Text>
            </View>
          ))}
        </View>
      </View>
      {escola.secoes.map((x, i) => {
        const comSecao = Boolean(x.zona || x.secao);
        const lido = !varios && comSecao ? LEITURA[leitura({ estimativa: x.estimativa, apurado: x.apurado[0] ?? 0 })] : null;
        return (
          <View
            key={`${chaveDaSecao(x.zona, x.secao)}-${i}`}
            wrap={false}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: i === escola.secoes.length - 1 ? 0 : 0.5, borderBottomColor: C.line }}
          >
            <View style={{ width: 66 }}>
              {comSecao ? (
                <>
                  <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.ink }}>{s(`Seção ${x.secao ?? '?'}`)}</Text>
                  <Text style={{ fontSize: 7, color: C.muted }}>{s(`Zona ${x.zona ?? '?'}`)}</Text>
                </>
              ) : (
                <Text style={{ fontSize: 7.4, color: C.muted }}>{s('Sem zona/seção no cadastro')}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              {[{ chave: 'est', valor: x.estimativa, cor: NAVY_BARRA }, ...candidatos.map((c, k) => ({ chave: c.rotulo, valor: x.apurado[k] ?? 0, cor: varios ? c.cor : OURO }))].map((b, k) => (
                <View key={b.chave} style={{ flexDirection: 'row', alignItems: 'center', marginTop: k ? 3 : 0 }}>
                  <Barra valor={b.valor} maior={maior} cor={b.cor} />
                  <Text style={{ width: 30, textAlign: 'right', fontSize: 8, fontFamily: 'Helvetica-Bold', color: k && !varios ? '#7a5410' : C.ink }}>{num(b.valor)}</Text>
                </View>
              ))}
            </View>
            {!varios ? (
              <View style={{ width: 88, alignItems: 'flex-end' }}>
                {lido ? (
                  <Text style={{ fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: lido.cor, backgroundColor: lido.fundo, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 6 }}>
                    {s(lido.texto)}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 8, color: C.faint }}>—</Text>
                )}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function PdfDoRaioX({ escola, candidatos, lideres, geradoEm }: PdfDoRaioXProps) {
  const quando = new Date(geradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const varios = candidatos.length > 1;
  const onde = [escola.endereco, [escola.cidade, escola.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ');
  const etiqueta = `Raio-X · ${varios ? candidatos.map((c) => c.nome).join(' × ') : (candidatos[0]?.rotulo ?? '')}`;

  return (
    <Document title={s(`Raio-X · ${escola.titulo}`)} author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda="Raio-X da escola" direita={appConfig.shortName} />
        <Rodape texto={`Estimativa: cadastros do time. Apurado: TSE, seção por seção. Gerado em ${quando}.`} />

        <View style={{ alignSelf: 'flex-start', backgroundColor: C.navy, borderRadius: 9, paddingVertical: 3.5, paddingHorizontal: 9 }}>
          <Text hyphenationCallback={semHifen} style={{ fontSize: 7.6, fontFamily: 'Helvetica-Bold', color: '#f2c14e' }}>{s(etiqueta)}</Text>
        </View>
        <Text hyphenationCallback={semHifen} style={{ fontSize: 17, fontFamily: 'Helvetica-Bold', color: C.ink, marginTop: 7 }}>{s(escola.titulo)}</Text>
        {onde ? <Text hyphenationCallback={semHifen} style={{ fontSize: 8.6, color: C.muted, marginTop: 2 }}>{s(onde)}</Text> : null}

        <Quadro escola={escola} candidatos={candidatos} />

        <View style={{ marginTop: 10, backgroundColor: '#fdf6e3', borderLeftWidth: 3, borderLeftColor: OURO, borderRadius: 4, paddingVertical: 7, paddingHorizontal: 9 }}>
          <Text hyphenationCallback={semHifen} style={{ fontSize: 8.8, color: C.ink, lineHeight: 1.45 }}>{s(frase(escola, candidatos))}</Text>
        </View>

        <Lideres escola={escola} lideres={lideres} />
        <Secoes escola={escola} candidatos={candidatos} />
      </Page>
    </Document>
  );
}

export async function gerarPdfDoRaioX(props: PdfDoRaioXProps): Promise<Blob> {
  return pdf(<PdfDoRaioX {...props} />).toBlob();
}
