import { Document, Page, Text, View, pdf } from '@react-pdf/renderer';
import { appConfig } from '@/config/app.config';
import type { EscolaComZeradas, RelatorioDeZeradas, SecaoZerada } from '@/lib/domain/secoes-zeradas';
import { C, Cabecalho, Kpi, LinhaDeKpis, Rodape, num, s, st } from './pdf-base';
import { FotoNoPdf } from './FotoNoPdf';
import { OURO, OURO_FUNDO, Parte, VERMELHO, nomeProprio, rotuloDaColuna, semHifen } from './ConfrontoPdf';

/**
 * PDF das secoes zeradas: em cada escola do municipio, as secoes onde os
 * candidatos escolhidos tiveram 0 voto — e, em cada uma, quantas pessoas do
 * time votam ali e quantas cada Lider cadastrou. Secao zerada com gente do
 * time vem em vermelho: tinha voto prometido e nao veio nenhum.
 */

export interface CandidatoDasZeradas {
  nome: string;
  numero: string;
  cargo: string;
  cor: string;
  foto: string | null;
}

export interface PdfDasZeradasProps {
  relatorio: RelatorioDeZeradas;
  candidatos: CandidatoDasZeradas[];
  /** O recorte do mapa em palavras (Lider, referencia...), quando ha. */
  recorte?: string | null;
  geradoEm: string;
}

const VERMELHO_FUNDO = '#fdecea';
const primeiroNome = (nome: string) => nomeProprio(nome).split(' ')[0];
const plural = (n: number, um: string, varios: string) => `${num(n)} ${n === 1 ? um : varios}`;

/** Larguras das colunas da tabela de secoes. */
const COL = { zona: 30, secao: 38, candidato: 40, gente: 46 };

function Capa({ relatorio, candidatos, recorte }: Pick<PdfDasZeradasProps, 'relatorio' | 'candidatos' | 'recorte'>) {
  const nomes = candidatos.map((c) => primeiroNome(c.nome));
  const quem = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
  const onde = relatorio.municipios.join(', ');
  return (
    <View style={{ backgroundColor: C.navy, borderRadius: 6, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 12 }}>
      <Text style={{ fontSize: 7.5, letterSpacing: 1.5, color: OURO, fontFamily: 'Helvetica-Bold' }}>{s('SEÇÕES ZERADAS · VOTAÇÃO DO TSE')}</Text>
      <Text style={{ fontSize: 14, color: C.white, fontFamily: 'Helvetica-Bold', marginTop: 3, lineHeight: 1.25 }}>
        {s(
          relatorio.modo === 'TODOS'
            ? `Onde ${quem} ${candidatos.length === 1 ? 'teve' : 'tiveram'} 0 voto em ${onde}`
            : `Onde ${candidatos.length === 1 ? quem : 'algum dos candidatos'} teve 0 voto em ${onde}`,
        )}
      </Text>
      <Text style={{ fontSize: 7.6, color: C.navy3, marginTop: 3 }}>
        {s(
          [
            relatorio.modo === 'TODOS' || candidatos.length === 1
              ? 'Seções em que nenhum dos candidatos escolhidos teve voto'
              : 'Seções em que pelo menos um dos candidatos escolhidos teve 0 voto',
            recorte ? `gente do time: ${recorte}` : null,
          ]
            .filter(Boolean)
            .join(' · '),
        )}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
        {candidatos.map((c, i) => (
          <View
            key={c.numero + c.cargo}
            style={{
              width: candidatos.length > 2 ? '32%' : '49%',
              flexDirection: 'row',
              alignItems: 'center',
              marginRight: '1%',
              marginTop: i >= (candidatos.length > 2 ? 3 : 2) ? 6 : 0,
              padding: 6,
              borderRadius: 5,
              backgroundColor: '#16263f',
              borderLeftWidth: 3,
              borderLeftColor: c.cor,
            }}
          >
            <FotoNoPdf src={c.foto} nome={c.nome} tamanho={32} anel={c.cor} />
            <View style={{ flex: 1, marginLeft: 7 }}>
              <Text hyphenationCallback={semHifen} style={{ fontSize: 8.4, fontFamily: 'Helvetica-Bold', color: C.white, maxLines: 1, textOverflow: 'ellipsis' }}>
                {s(nomeProprio(c.nome))}
              </Text>
              <Text style={{ fontSize: 6.6, color: C.navy3, marginTop: 1.5 }}>{s(`${c.numero} · ${c.cargo}`)}</Text>
              <Text style={{ fontSize: 6.6, color: OURO, marginTop: 1.5, fontFamily: 'Helvetica-Bold' }}>
                {s(`0 voto em ${plural(relatorio.totais.zeradasPorCandidato[i] ?? 0, 'seção', 'seções')} de ${num(relatorio.totais.secoesDoMunicipio)}`)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** "Félix 7 · Ana 2": os Lideres da secao, numa linha que quebra. */
function TextoDosLideres({ lideres, max = 6 }: { lideres: { nome: string; pessoas: number }[]; max?: number }) {
  if (lideres.length === 0) return <Text style={{ fontSize: 7, color: C.faint }}>—</Text>;
  const resto = lideres.length - max;
  return (
    <Text style={{ fontSize: 7, color: C.ink2, lineHeight: 1.35 }}>
      {lideres.slice(0, max).map((l, i) => (
        <Text key={l.nome + i}>
          {i ? s(' · ') : ''}
          {s(nomeProprio(l.nome))} <Text style={{ fontFamily: 'Helvetica-Bold', color: C.navy }}>{num(l.pessoas)}</Text>
        </Text>
      ))}
      {resto > 0 ? s(` · +${resto}`) : ''}
    </Text>
  );
}

/** O voto de um candidato na secao: 0 em vermelho, com a bolinha da cor dele. */
function Voto({ votos, cor }: { votos: number; cor: string }) {
  return (
    <View style={{ width: COL.candidato, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={{ width: 4.5, height: 4.5, borderRadius: 2.25, backgroundColor: cor, marginRight: 3 }} />
      <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: votos <= 0 ? VERMELHO : C.ink }}>{num(votos)}</Text>
    </View>
  );
}

function CabecalhoDaTabela({ candidatos }: { candidatos: CandidatoDasZeradas[] }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f6f8fb', paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 0.6, borderBottomColor: C.line }}>
      <Text style={[rotuloDaColuna, { width: COL.zona }]}>ZONA</Text>
      <Text style={[rotuloDaColuna, { width: COL.secao }]}>{s('SEÇÃO')}</Text>
      {candidatos.map((c) => (
        <Text key={c.numero + c.cargo} style={[rotuloDaColuna, { width: COL.candidato, textAlign: 'right', maxLines: 1 }]}>
          {s(primeiroNome(c.nome).toUpperCase().slice(0, 9))}
        </Text>
      ))}
      <Text style={[rotuloDaColuna, { width: COL.gente, textAlign: 'right' }]}>DO TIME</Text>
      <Text style={[rotuloDaColuna, { flex: 1, paddingLeft: 10 }]}>{s('LÍDERES QUE CADASTRARAM NA SEÇÃO')}</Text>
    </View>
  );
}

function LinhaDaSecao({ z, candidatos, ultima }: { z: SecaoZerada; candidatos: CandidatoDasZeradas[]; ultima: boolean }) {
  const alarme = z.gente > 0;
  return (
    <View
      wrap={false}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
        backgroundColor: alarme ? VERMELHO_FUNDO : C.white,
        borderBottomWidth: ultima ? 0 : 0.5,
        borderBottomColor: C.line,
        borderLeftWidth: 2.5,
        borderLeftColor: alarme ? VERMELHO : C.white,
      }}
    >
      <Text style={{ width: COL.zona - 2.5, fontSize: 8, color: C.muted }}>{z.zona}</Text>
      <Text style={{ width: COL.secao, fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy }}>{z.secao}</Text>
      {candidatos.map((c, i) => (
        <Voto key={c.numero + c.cargo} votos={z.votos[i] ?? 0} cor={c.cor} />
      ))}
      <Text style={{ width: COL.gente, textAlign: 'right', fontSize: 9, fontFamily: 'Helvetica-Bold', color: alarme ? VERMELHO : C.faint }}>
        {alarme ? num(z.gente) : '0'}
      </Text>
      <View style={{ flex: 1, paddingLeft: 10 }}>
        <TextoDosLideres lideres={z.lideres} />
      </View>
    </View>
  );
}

function CartaoDaEscola({ e, posicao, candidatos }: { e: EscolaComZeradas; posicao: number; candidatos: CandidatoDasZeradas[] }) {
  const todasZeradas = e.zeradas.length === e.totalDeSecoes;
  return (
    <View style={{ borderWidth: 0.7, borderColor: C.line, borderRadius: 5, marginBottom: 9, overflow: 'hidden' }}>
      <View wrap={false} minPresenceAhead={60}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.navy, paddingVertical: 7, paddingHorizontal: 9 }}>
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: OURO, justifyContent: 'center', alignItems: 'center', marginRight: 8 }}>
            <Text style={{ fontSize: 7.6, fontFamily: 'Helvetica-Bold', color: C.navy }}>{posicao}</Text>
          </View>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text hyphenationCallback={semHifen} style={{ fontSize: 9.4, fontFamily: 'Helvetica-Bold', color: C.white, maxLines: 2, textOverflow: 'ellipsis' }}>
              {s(e.titulo)}
            </Text>
            <Text style={{ fontSize: 6.8, color: C.navy3, marginTop: 1.5 }}>
              {s([e.endereco, e.cidade, `Zona ${e.zonas.join(', ')}`].filter(Boolean).join(' · '))}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: todasZeradas ? '#ff9b91' : OURO }}>
              {s(`${num(e.zeradas.length)} de ${plural(e.totalDeSecoes, 'seção zerada', 'seções zeradas')}`)}
            </Text>
            <Text style={{ fontSize: 6.8, color: C.navy3, marginTop: 1.5 }}>
              {s(`${plural(e.genteNaEscola, 'pessoa', 'pessoas')} do time na escola · ${num(e.genteNasZeradas)} nas zeradas`)}
            </Text>
          </View>
        </View>

        {/* Os votos da escola inteira: zerou nas secoes, mas teve voto ao lado? */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 9, backgroundColor: '#f6f8fb', borderBottomWidth: 0.6, borderBottomColor: C.line }}>
          <Text style={[rotuloDaColuna, { marginRight: 6 }]}>VOTOS NA ESCOLA</Text>
          {candidatos.map((c, i) => (
            <View key={c.numero + c.cargo} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 9 }}>
              <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.cor, marginRight: 3 }} />
              <Text style={{ fontSize: 7.2, color: C.ink2 }}>{s(primeiroNome(c.nome))} </Text>
              <Text style={{ fontSize: 7.4, fontFamily: 'Helvetica-Bold', color: (e.votosNaEscola[i] ?? 0) > 0 ? C.ink : VERMELHO }}>{num(e.votosNaEscola[i] ?? 0)}</Text>
            </View>
          ))}
        </View>

        {e.lideres.length ? (
          <View style={{ paddingVertical: 5, paddingHorizontal: 9, borderBottomWidth: 0.6, borderBottomColor: C.line }}>
            <Text style={[rotuloDaColuna, { marginBottom: 3 }]}>{s('LÍDERES NA ESCOLA · CADASTROU NA ESCOLA (NAS SEÇÕES ZERADAS)')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {e.lideres.map((l) => (
                <View
                  key={l.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderWidth: 0.6,
                    borderColor: l.nasZeradas ? '#f2b8b3' : C.line,
                    backgroundColor: l.nasZeradas ? VERMELHO_FUNDO : C.white,
                    borderRadius: 8,
                    paddingVertical: 2,
                    paddingHorizontal: 6,
                    marginRight: 4,
                    marginBottom: 3,
                  }}
                >
                  <Text style={{ fontSize: 7, color: C.ink2 }}>{s(nomeProprio(l.nome))} </Text>
                  <Text style={{ fontSize: 7.2, fontFamily: 'Helvetica-Bold', color: C.navy }}>{num(l.pessoas)}</Text>
                  {l.nasZeradas ? <Text style={{ fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: VERMELHO }}>{s(` (${num(l.nasZeradas)})`)}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ) : (
          <Text style={{ fontSize: 7, color: C.faint, paddingVertical: 4, paddingHorizontal: 9, borderBottomWidth: 0.6, borderBottomColor: C.line }}>
            {s('Nenhuma pessoa do time cadastrada nesta escola.')}
          </Text>
        )}
        <CabecalhoDaTabela candidatos={candidatos} />
      </View>
      {e.zeradas.map((z, i) => (
        <LinhaDaSecao key={z.chave} z={z} candidatos={candidatos} ultima={i === e.zeradas.length - 1} />
      ))}
    </View>
  );
}

export function PdfDasZeradas({ relatorio, candidatos, recorte, geradoEm }: PdfDasZeradasProps) {
  const { totais } = relatorio;
  const quando = new Date(geradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const maiorLider = Math.max(1, ...relatorio.lideres.map((l) => l.nasZeradas));
  return (
    <Document title={`Seções zeradas · ${relatorio.municipios.join(', ')}`} author={appConfig.name}>
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda={`Seções zeradas · ${relatorio.municipios.join(', ')}`} direita={appConfig.name} />
        <Rodape texto={`Gerado em ${quando} · votação oficial do TSE × cadastro do time`} />

        <Capa relatorio={relatorio} candidatos={candidatos} recorte={recorte} />

        <LinhaDeKpis>
          {[
            <Kpi
              key="s"
              valor={num(totais.secoesZeradas)}
              rotulo="seções zeradas"
              nota={`de ${num(totais.secoesDoMunicipio)} seções do município`}
              tom={VERMELHO}
            />,
            <Kpi key="e" valor={num(totais.escolasComZerada)} rotulo="escolas com seção zerada" nota={`de ${num(totais.escolasDoMunicipio)} escolas`} />,
            <Kpi key="g" valor={num(totais.zeradasComGente)} rotulo="zeradas com gente do time" nota="tinha gente e veio zero" tom={VERMELHO} />,
            <Kpi key="p" valor={num(totais.genteNasZeradas)} rotulo="pessoas do time nas zeradas" nota="cadastradas pelo time" tom={C.gold} />,
          ]}
        </LinhaDeKpis>

        <View style={{ flexDirection: 'row', backgroundColor: OURO_FUNDO, borderLeftWidth: 3, borderLeftColor: OURO, paddingVertical: 6, paddingHorizontal: 8, marginTop: 2, marginBottom: 4 }}>
          <Text style={{ fontSize: 7.6, color: C.ink2, lineHeight: 1.45 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s('Como ler: ')}</Text>
            {s(
              'todas as seções do município entram na conta — inclusive as que não aparecem no mapa, porque o TSE não lista o zero. "Do time" são as pessoas cadastradas pelo time que votam na seção; ao lado, quantas cada líder cadastrou ali. Linha em vermelho: seção zerada onde o time tinha gente. Nos líderes da escola, o número é quanto ele cadastrou na escola e, entre parênteses, quanto disso está nas seções zeradas.',
            )}
          </Text>
        </View>

        {totais.secoesZeradas === 0 ? (
          <View style={{ marginTop: 16, padding: 14, borderRadius: 5, backgroundColor: C.successSoft }}>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.success }}>{s('Nenhuma seção zerada.')}</Text>
            <Text style={{ fontSize: 8, color: C.ink2, marginTop: 3 }}>
              {s(totais.secoesDoMunicipio ? 'Os candidatos escolhidos tiveram voto em todas as seções do município.' : 'A votação não tem as seções deste município.')}
            </Text>
          </View>
        ) : null}

        {relatorio.alarmes.length ? (
          <>
            <Parte numero={1} titulo="O alarme: tinha gente do time e veio zero" texto="As seções zeradas onde o time tem mais gente cadastrada — o primeiro lugar para olhar." />
            <View style={{ borderWidth: 0.7, borderColor: C.line, borderRadius: 5, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', backgroundColor: '#f6f8fb', paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 0.6, borderBottomColor: C.line }}>
                <Text style={[rotuloDaColuna, { width: 18 }]}>#</Text>
                <Text style={[rotuloDaColuna, { width: 62 }]}>{s('ZONA / SEÇÃO')}</Text>
                <Text style={[rotuloDaColuna, { flex: 1.2 }]}>ESCOLA</Text>
                <Text style={[rotuloDaColuna, { width: 44, textAlign: 'right' }]}>DO TIME</Text>
                <Text style={[rotuloDaColuna, { flex: 1, paddingLeft: 10 }]}>{s('LÍDERES')}</Text>
              </View>
              {relatorio.alarmes.map((z, i) => (
                <View
                  key={`${z.escola}-${z.chave}`}
                  wrap={false}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: i === relatorio.alarmes.length - 1 ? 0 : 0.5, borderBottomColor: C.line }}
                >
                  <Text style={{ width: 18, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.faint }}>{i + 1}</Text>
                  <Text style={{ width: 62, fontSize: 8.6, fontFamily: 'Helvetica-Bold', color: C.navy }}>{s(`${z.zona} / ${z.secao}`)}</Text>
                  <Text hyphenationCallback={semHifen} style={{ flex: 1.2, fontSize: 7.6, color: C.ink, maxLines: 2, textOverflow: 'ellipsis', paddingRight: 6 }}>
                    {s(z.escola)}
                  </Text>
                  <Text style={{ width: 44, textAlign: 'right', fontSize: 10, fontFamily: 'Helvetica-Bold', color: VERMELHO }}>{num(z.gente)}</Text>
                  <View style={{ flex: 1, paddingLeft: 10 }}>
                    <TextoDosLideres lideres={z.lideres} max={4} />
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {relatorio.escolas.length ? (
          <Parte
            numero={relatorio.alarmes.length ? 2 : 1}
            titulo="Escola por escola, seção por seção"
            texto="Da escola com mais gente do time nas seções zeradas para a com menos. Em cada uma, os votos da escola inteira, os líderes e cada seção zerada com quem do time vota ali."
            quebra={relatorio.alarmes.length > 0}
          />
        ) : null}
        {relatorio.escolas.map((e, i) => (
          <CartaoDaEscola key={e.chave} e={e} posicao={i + 1} candidatos={candidatos} />
        ))}

        {relatorio.lideres.length ? (
          <>
            <Parte
              numero={relatorio.alarmes.length ? 3 : 2}
              titulo="Os líderes nas seções zeradas"
              texto="Quantas pessoas cada líder cadastrou em seções onde veio zero, em quantas seções e em quantas escolas."
              quebra
            />
            <View style={{ borderWidth: 0.7, borderColor: C.line, borderRadius: 5, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', backgroundColor: '#f6f8fb', paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 0.6, borderBottomColor: C.line }}>
                <Text style={[rotuloDaColuna, { width: 18 }]}>#</Text>
                <Text style={[rotuloDaColuna, { flex: 1 }]}>{s('LÍDER')}</Text>
                <Text style={[rotuloDaColuna, { width: 56, textAlign: 'right' }]}>NAS ZERADAS</Text>
                <Text style={[rotuloDaColuna, { width: 46, textAlign: 'right' }]}>{s('SEÇÕES')}</Text>
                <Text style={[rotuloDaColuna, { width: 46, textAlign: 'right' }]}>ESCOLAS</Text>
                <View style={{ width: 130, paddingLeft: 12 }} />
              </View>
              {relatorio.lideres.map((l, i) => (
                <View
                  key={l.id}
                  wrap={false}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: i === relatorio.lideres.length - 1 ? 0 : 0.5, borderBottomColor: C.line }}
                >
                  <Text style={{ width: 18, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.faint }}>{i + 1}</Text>
                  <Text hyphenationCallback={semHifen} style={{ flex: 1, fontSize: 8.2, fontFamily: 'Helvetica-Bold', color: C.ink, maxLines: 1, textOverflow: 'ellipsis' }}>
                    {s(nomeProprio(l.nome))}
                  </Text>
                  <Text style={{ width: 56, textAlign: 'right', fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: VERMELHO }}>{num(l.nasZeradas)}</Text>
                  <Text style={{ width: 46, textAlign: 'right', fontSize: 8.5, color: C.ink2 }}>{num(l.secoes)}</Text>
                  <Text style={{ width: 46, textAlign: 'right', fontSize: 8.5, color: C.ink2 }}>{num(l.escolas)}</Text>
                  <View style={{ width: 130, paddingLeft: 12 }}>
                    <View style={{ height: 6, backgroundColor: '#edf1f5', borderRadius: 2 }}>
                      <View style={{ width: `${Math.max(4, (l.nasZeradas / maiorLider) * 100)}%`, height: 6, backgroundColor: VERMELHO, borderRadius: 2 }} />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </Page>
    </Document>
  );
}

export async function gerarPdfDasZeradas(props: PdfDasZeradasProps): Promise<Blob> {
  return pdf(<PdfDasZeradas {...props} />).toBlob();
}
