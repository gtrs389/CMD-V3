import { Fragment } from 'react';
import { Document, Page, Text, View, pdf } from '@react-pdf/renderer';
import { appConfig } from '@/config/app.config';
import { chaveDaSecao, conversao, type Comparativo, type EscolaNoComparativo, type LiderNoRaioX } from '@/lib/domain/confronto';
import { C, Cabecalho, Kpi, LinhaDeKpis, Rodape, num, s, st } from './pdf-base';
import { FotoNoPdf } from './FotoNoPdf';
import {
  CabecalhoDosLideres,
  LinhaDoLider,
  OURO,
  OURO_FUNDO,
  Parte,
  TRILHO,
  VERDE,
  VERMELHO,
  corDaConversao,
  nomeProprio,
  rotuloDaColuna,
  semHifen,
} from './ConfrontoPdf';

/**
 * Relatorio "Estimativa x apuracao" com varios candidatos de uma vez (a
 * dobradinha de federal e estadual, por exemplo): a estimativa do time e uma
 * so — as pessoas cadastradas que votam em cada escola —, e cada candidato
 * tem o proprio apurado, escola, zona e secao. Junto, quantas pessoas cada
 * Lider cadastrou em cada escola e em cada secao.
 *
 * Cada candidato tem uma cor (a mesma do mapa), sempre com o nome ao lado.
 */

export interface CandidatoNoPdf {
  nome: string;
  numero: string;
  /** "Deputado Federal". */
  cargo: string;
  cor: string;
  /** Foto oficial (data URL); sem ela, as iniciais. */
  foto: string | null;
}

export interface LideresDaEscolaNoPdf {
  lideres: LiderNoRaioX[];
  /** Lideres e cadastros sem Lider registrado. */
  diretos: number;
}

export interface PdfDoComparativoProps {
  comparativo: Comparativo;
  candidatos: CandidatoNoPdf[];
  /** Escola (chave) -> quem cada Lider cadastrou ali, secao por secao. */
  lideres?: Record<string, LideresDaEscolaNoPdf>;
  geradoEm: string;
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v).toLocaleString('pt-BR')}%`);
const SEM_SECAO = chaveDaSecao(null, null);
const zonasDe = (e: EscolaNoComparativo) => [...new Set(e.secoes.map((x) => x.zona).filter(Boolean))].join(', ') || '—';
const primeiroNome = (nome: string) => nomeProprio(nome).split(' ')[0];

/** Diferenca com sinal, verde ou vermelha. */
function Diferenca({ valor, tamanho = 8 }: { valor: number; tamanho?: number }) {
  return (
    <Text style={{ fontSize: tamanho, fontFamily: 'Helvetica-Bold', color: valor > 0 ? VERDE : valor < 0 ? VERMELHO : C.faint }}>
      {valor > 0 ? `+${num(valor)}` : num(valor)}
    </Text>
  );
}

/** A capa: os candidatos lado a lado, com foto, numero e cargo. */
function Capa({ candidatos }: { candidatos: CandidatoNoPdf[] }) {
  return (
    <View style={{ backgroundColor: C.navy, borderRadius: 6, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 12 }}>
      <Text style={{ fontSize: 7.5, letterSpacing: 1.5, color: OURO, fontFamily: 'Helvetica-Bold' }}>
        {s('ESTIMATIVA × APURAÇÃO · TSE · COMPARATIVO')}
      </Text>
      <Text style={{ fontSize: 13, color: C.white, fontFamily: 'Helvetica-Bold', marginTop: 3 }}>
        {s(`${candidatos.length} candidatos contra a mesma estimativa do time`)}
      </Text>
      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        {candidatos.map((c, i) => (
          <View
            key={c.numero + c.cargo}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              marginLeft: i ? 8 : 0,
              padding: 7,
              borderRadius: 5,
              backgroundColor: '#16263f',
              borderLeftWidth: 3,
              borderLeftColor: c.cor,
            }}
          >
            <FotoNoPdf src={c.foto} nome={c.nome} tamanho={candidatos.length > 2 ? 36 : 46} anel={c.cor} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text hyphenationCallback={semHifen} style={{ fontSize: candidatos.length > 2 ? 8.4 : 10, fontFamily: 'Helvetica-Bold', color: C.white, maxLines: 2, textOverflow: 'ellipsis' }}>
                {s(nomeProprio(c.nome))}
              </Text>
              <Text style={{ fontSize: 6.8, color: C.navy3, marginTop: 2 }}>{s(`${c.numero} · ${c.cargo}`)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Os candidatos dentro do cartao da escola: votos, conversao, diferenca e
 * uma barra na mesma escala da estimativa (o traco marca a estimativa).
 */
function LinhasDosCandidatos({ e, candidatos }: { e: EscolaNoComparativo; candidatos: CandidatoNoPdf[] }) {
  const maior = Math.max(1, e.estimativa, ...e.apurado);
  const marca = (e.estimativa / maior) * 100;
  return (
    <View style={{ paddingHorizontal: 9, paddingTop: 5, paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 3 }}>
        <Text style={[rotuloDaColuna, { flex: 1 }]}>CANDIDATO</Text>
        <Text style={[rotuloDaColuna, { width: 48, textAlign: 'right' }]}>VOTOS</Text>
        <Text style={[rotuloDaColuna, { width: 52, textAlign: 'right' }]}>{s('CONVERSÃO')}</Text>
        <Text style={[rotuloDaColuna, { width: 52, textAlign: 'right' }]}>{s('DIFERENÇA')}</Text>
        <View style={{ width: 150, paddingLeft: 14 }} />
      </View>
      {candidatos.map((c, i) => {
        const votos = e.apurado[i] ?? 0;
        const conv = conversao({ estimativa: e.estimativa, apurado: votos });
        return (
          <View key={c.numero + c.cargo} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2.5 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 6 }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.cor, marginRight: 5 }} />
              <Text hyphenationCallback={semHifen} style={{ flex: 1, fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.ink, maxLines: 1, textOverflow: 'ellipsis' }}>
                {s(nomeProprio(c.nome))}
              </Text>
            </View>
            <Text style={{ width: 48, textAlign: 'right', fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.ink }}>{num(votos)}</Text>
            <Text style={{ width: 52, textAlign: 'right', fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: corDaConversao(conv) }}>{pct(conv)}</Text>
            <View style={{ width: 52, alignItems: 'flex-end' }}>
              {e.estimativa > 0 ? <Diferenca valor={votos - e.estimativa} tamanho={8.5} /> : <Text style={{ fontSize: 8, color: C.faint }}>—</Text>}
            </View>
            <View style={{ width: 150, paddingLeft: 14 }}>
              <View style={{ height: 6, backgroundColor: TRILHO, borderRadius: 2 }}>
                <View style={{ width: `${votos > 0 ? Math.max(3, (votos / maior) * 100) : 0}%`, height: 6, backgroundColor: c.cor, borderRadius: 2 }} />
                {/* O traco: onde fica a estimativa do time na mesma escala. */}
                {e.estimativa > 0 ? (
                  <View style={{ position: 'absolute', left: `${Math.min(99, marca)}%`, top: -2, width: 1.4, height: 10, backgroundColor: C.navy }} />
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** O cartao da escola na parte 1: estimativa, cada candidato e os lideres. */
function CartaoDaEscola({
  e,
  posicao,
  candidatos,
  lideres,
}: {
  e: EscolaNoComparativo;
  posicao: number;
  candidatos: CandidatoNoPdf[];
  lideres: LideresDaEscolaNoPdf | undefined;
}) {
  const secoes = e.secoes.filter((x) => x.zona || x.secao).length;
  const ls = lideres?.lideres ?? [];
  const escala = Math.max(1, ...ls.map((l) => l.cadastrados));
  return (
    <View wrap={ls.length > 12} style={{ borderWidth: 0.7, borderColor: C.line, borderRadius: 5, marginBottom: 8, overflow: 'hidden' }}>
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
                ls.length ? `${num(ls.length)} ${ls.length === 1 ? 'líder' : 'líderes'}` : null,
              ]
                .filter(Boolean)
                .join('  ·  '),
            )}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={rotuloDaColuna}>ESTIMATIVA DO TIME</Text>
          <Text style={{ fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 1 }}>{num(e.estimativa)}</Text>
        </View>
      </View>
      <View style={{ height: 0.6, backgroundColor: C.line }} />
      <LinhasDosCandidatos e={e} candidatos={candidatos} />
      {ls.length > 0 ? (
        <View style={{ borderTopWidth: 0.6, borderTopColor: C.line }}>
          <CabecalhoDosLideres parteDe="da escola" />
          {ls.map((l, i) => (
            <LinhaDoLider
              key={l.id}
              l={{ lider: l.nome, cadastrados: l.cadastrados, semSecao: l.porSecao[SEM_SECAO] ?? 0 }}
              escala={escala}
              total={e.estimativa}
              ultima={i === ls.length - 1 && !lideres?.diretos}
            />
          ))}
          {lideres?.diretos ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 9 }}>
              <Text style={{ flex: 1, fontSize: 7.2, fontFamily: 'Helvetica-Oblique', color: C.muted }}>{s('Líderes e cadastros sem líder registrado')}</Text>
              <Text style={{ width: 64, textAlign: 'right', fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.muted }}>{num(lideres.diretos)}</Text>
              <View style={{ width: 220 }} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A escola inteira numa grade: uma coluna por secao (zona e secao no topo);
 * em cima, quantas pessoas cada Lider cadastrou ali; embaixo, a estimativa
 * da secao e os votos de cada candidato. Escola, zona, secao, estimativa,
 * votos e lideres numa leitura so.
 */
const POR_BLOCO = 9;
function GradeDaEscola({ e, candidatos, lideres }: { e: EscolaNoComparativo; candidatos: CandidatoNoPdf[]; lideres: LideresDaEscolaNoPdf | undefined }) {
  const ls = (lideres?.lideres ?? []).filter((l) => Object.keys(l.porSecao).some((k) => k !== SEM_SECAO));
  const secoes = e.secoes.filter((x) => x.zona || x.secao);
  const semSecao = e.secoes.find((x) => !x.zona && !x.secao);
  if (secoes.length === 0) return null;
  const variasZonas = new Set(secoes.map((x) => x.zona)).size > 1;
  const blocos: (typeof secoes)[] = [];
  for (let i = 0; i < secoes.length; i += POR_BLOCO) blocos.push(secoes.slice(i, i + POR_BLOCO));
  const celula = { width: 38, textAlign: 'right' as const };
  const totalDe = (valor: (x: (typeof secoes)[number]) => number) => secoes.reduce((t, x) => t + valor(x), 0);

  return (
    <View>
      {blocos.map((bloco, b) => {
        const ultimo = b === blocos.length - 1;
        return (
          <View key={b} wrap={false} style={{ borderWidth: 0.6, borderColor: C.line, borderRadius: 3, marginBottom: 4, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', backgroundColor: '#f6f8fb', paddingVertical: 3.5, paddingHorizontal: 7 }}>
              <Text style={[rotuloDaColuna, { flex: 1 }]}>{s(variasZonas ? 'ZONA / SEÇÃO' : `ZONA ${secoes[0].zona ?? '—'} · SEÇÃO`)}</Text>
              {bloco.map((x) => (
                <View key={chaveDaSecao(x.zona, x.secao)} style={{ width: celula.width, alignItems: 'flex-end' }}>
                  {variasZonas ? <Text style={{ fontSize: 5.2, color: C.faint }}>{s(`Z ${x.zona}`)}</Text> : null}
                  <Text style={[rotuloDaColuna, { color: C.navy }]}>{s(x.secao ?? '—')}</Text>
                </View>
              ))}
              {ultimo ? <Text style={[rotuloDaColuna, { width: 42, textAlign: 'right' }]}>TOTAL</Text> : null}
            </View>

            {ls.map((l, i) => (
              <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2.6, paddingHorizontal: 7, backgroundColor: i % 2 ? '#fafbfc' : C.white }}>
                <Text hyphenationCallback={semHifen} style={{ flex: 1, fontSize: 7.2, color: C.ink2, maxLines: 1, textOverflow: 'ellipsis', paddingRight: 4 }}>
                  {s(nomeProprio(l.nome))}
                </Text>
                {bloco.map((x) => {
                  const n = l.porSecao[chaveDaSecao(x.zona, x.secao)] ?? 0;
                  return (
                    <Text key={chaveDaSecao(x.zona, x.secao)} style={[celula, { fontSize: 7.6, fontFamily: n ? 'Helvetica-Bold' : 'Helvetica', color: n ? C.ink2 : '#c3ccd6' }]}>
                      {n ? num(n) : '·'}
                    </Text>
                  );
                })}
                {ultimo ? (
                  <Text style={{ width: 42, textAlign: 'right', fontSize: 7.6, fontFamily: 'Helvetica-Bold', color: C.ink2 }}>
                    {num(Object.entries(l.porSecao).reduce((t, [k, v]) => (k === SEM_SECAO ? t : t + v), 0))}
                  </Text>
                ) : null}
              </View>
            ))}

            {/* Estimativa da secao, em azul-marinho. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3.4, paddingHorizontal: 7, backgroundColor: '#eef2f7', borderTopWidth: ls.length ? 0.6 : 0, borderTopColor: C.line }}>
              <Text style={{ flex: 1, fontSize: 7.2, fontFamily: 'Helvetica-Bold', color: C.navy }}>Estimativa do time</Text>
              {bloco.map((x) => (
                <Text key={chaveDaSecao(x.zona, x.secao)} style={[celula, { fontSize: 7.8, fontFamily: 'Helvetica-Bold', color: C.navy }]}>
                  {num(x.estimativa)}
                </Text>
              ))}
              {ultimo ? (
                <Text style={{ width: 42, textAlign: 'right', fontSize: 7.8, fontFamily: 'Helvetica-Bold', color: C.navy }}>{num(totalDe((x) => x.estimativa))}</Text>
              ) : null}
            </View>

            {/* Os votos de cada candidato, na cor dele. */}
            {candidatos.map((c, k) => (
              <View key={c.numero + c.cargo} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3.2, paddingHorizontal: 7, borderTopWidth: 0.4, borderTopColor: '#e6ebf0' }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.cor, marginRight: 4 }} />
                  <Text hyphenationCallback={semHifen} style={{ flex: 1, fontSize: 7.2, fontFamily: 'Helvetica-Bold', color: C.ink, maxLines: 1, textOverflow: 'ellipsis' }}>
                    {s(`Votos de ${nomeProprio(c.nome)}`)}
                  </Text>
                </View>
                {bloco.map((x) => {
                  const v = x.apurado[k] ?? 0;
                  return (
                    <Text
                      key={chaveDaSecao(x.zona, x.secao)}
                      style={[celula, { fontSize: 7.8, fontFamily: 'Helvetica-Bold', color: x.estimativa > 0 && v < x.estimativa ? VERMELHO : C.ink }]}
                    >
                      {num(v)}
                    </Text>
                  );
                })}
                {ultimo ? (
                  <Text style={{ width: 42, textAlign: 'right', fontSize: 7.8, fontFamily: 'Helvetica-Bold', color: C.ink }}>{num(totalDe((x) => x.apurado[k] ?? 0))}</Text>
                ) : null}
              </View>
            ))}
          </View>
        );
      })}
      {semSecao && semSecao.estimativa > 0 ? (
        <Text style={{ fontSize: 6.6, color: C.faint, marginBottom: 2 }}>
          {s(`+ ${num(semSecao.estimativa)} ${semSecao.estimativa === 1 ? 'pessoa' : 'pessoas'} da estimativa sem zona/seção no cadastro (não dá para comparar com a urna).`)}
        </Text>
      ) : null}
    </View>
  );
}

export function PdfDoComparativo({ comparativo, candidatos, lideres = {}, geradoEm }: PdfDoComparativoProps) {
  const { escolas, estimativaTotal, apuradoNasEscolasDoTime, apuradoTotal } = comparativo;
  const quando = new Date(geradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  // Os lideres do time inteiro, somados escola a escola.
  const doTime = new Map<string, { lider: string; cadastrados: number; semSecao: number; escolas: number }>();
  for (const e of escolas) {
    for (const l of lideres[e.chave]?.lideres ?? []) {
      const atual = doTime.get(l.id) ?? { lider: l.nome, cadastrados: 0, semSecao: 0, escolas: 0 };
      atual.cadastrados += l.cadastrados;
      atual.semSecao += l.porSecao[SEM_SECAO] ?? 0;
      atual.escolas += 1;
      doTime.set(l.id, atual);
    }
  }
  const lideresDoTime = [...doTime.values()].sort((a, b) => b.cadastrados - a.cadastrados || a.lider.localeCompare(b.lider, 'pt-BR'));
  const maiorLider = Math.max(1, ...lideresDoTime.map((l) => l.cadastrados));
  const nomes = candidatos.map((c) => primeiroNome(c.nome)).join(' × ');

  return (
    <Document title={s(`Estimativa x apuração · ${candidatos.map((c) => c.nome).join(' x ')}`)} author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda={`Estimativa × apuração · ${nomes}`} direita={appConfig.shortName} />
        <Rodape texto={`Estimativa: cadastros do time. Apurado: TSE, seção por seção. Gerado em ${quando}.`} />

        <Capa candidatos={candidatos} />

        <LinhaDeKpis>
          {[
            <Kpi key="est" valor={num(estimativaTotal)} rotulo="votos estimados pelo time" nota={`${num(escolas.length)} escolas`} tom={C.navy} />,
            ...candidatos.map((c, i) => {
              const conv = conversao({ estimativa: estimativaTotal, apurado: apuradoNasEscolasDoTime[i] ?? 0 });
              return (
                <Kpi
                  key={c.numero + c.cargo}
                  valor={num(apuradoNasEscolasDoTime[i] ?? 0)}
                  rotulo={`${primeiroNome(c.nome)} nas escolas do time`}
                  nota={`${pct(conv)} da estimativa · ${num(apuradoTotal[i] ?? 0)} no total`}
                  tom={c.cor}
                />
              );
            }),
          ]}
        </LinhaDeKpis>

        <View style={{ flexDirection: 'row', backgroundColor: OURO_FUNDO, borderLeftWidth: 3, borderLeftColor: OURO, paddingVertical: 6, paddingHorizontal: 8, marginTop: 4, marginBottom: 6 }}>
          <Text style={{ fontSize: 7.8, color: C.ink2, lineHeight: 1.45 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s('Como ler: ')}</Text>
            {s(
              'a estimativa é o número de pessoas cadastradas pelo time que votam na escola (uma pessoa, um voto) e vale para todos os candidatos. O apurado de cada um são os votos contados pelo TSE, seção por seção. Conversão = apurado ÷ estimativa. Nas barras, o traço marca a estimativa. Na grade da parte 2, um número em vermelho é uma seção onde o candidato teve menos votos do que o time estimava.',
            )}
          </Text>
        </View>

        <Parte
          numero={1}
          titulo="Escola por escola"
          texto="Da escola com a maior estimativa para a menor: a estimativa do time, os votos de cada candidato e os líderes que cadastraram gente ali."
        />
        {escolas.length === 0 ? <Text style={{ fontSize: 8.5, color: C.faint }}>{s('O time não tem estimativa em nenhuma escola deste recorte.')}</Text> : null}
        {escolas.map((e, i) => (
          <CartaoDaEscola key={e.chave} e={e} posicao={i + 1} candidatos={candidatos} lideres={lideres[e.chave]} />
        ))}

        {escolas.length > 0 ? (
          <Parte
            numero={2}
            titulo="Zona e seção"
            texto="Cada escola numa grade: uma coluna por seção. Em cima, quantas pessoas cada líder cadastrou na seção; embaixo, a estimativa do time e os votos de cada candidato."
            quebra
          />
        ) : null}
        {escolas.map((e, i) => (
          <Fragment key={e.chave}>
            <View
              wrap={false}
              minPresenceAhead={90}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.navy, borderRadius: 4, paddingVertical: 6, paddingHorizontal: 8, marginTop: i === 0 ? 2 : 10, marginBottom: 4 }}
            >
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: OURO, justifyContent: 'center', alignItems: 'center', marginRight: 7 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.navy }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text hyphenationCallback={semHifen} style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.white }}>
                  {s(e.titulo)}
                </Text>
                <Text style={{ fontSize: 6.8, color: C.navy3, marginTop: 1 }}>{s([e.endereco, e.cidade, `Zona ${zonasDe(e)}`].filter(Boolean).join(' · '))}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.white }}>{s(`estimativa ${num(e.estimativa)}`)}</Text>
                <View style={{ flexDirection: 'row', marginTop: 2 }}>
                  {candidatos.map((c, k) => (
                    <View key={c.numero + c.cargo} style={{ flexDirection: 'row', alignItems: 'center', marginLeft: k ? 7 : 0 }}>
                      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.cor, marginRight: 3 }} />
                      <Text style={{ fontSize: 7.4, fontFamily: 'Helvetica-Bold', color: C.white }}>{num(e.apurado[k] ?? 0)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
            <GradeDaEscola e={e} candidatos={candidatos} lideres={lideres[e.chave]} />
          </Fragment>
        ))}

        {lideresDoTime.length > 0 ? (
          <>
            <Parte
              numero={3}
              titulo="Os líderes do time"
              texto="Quantas pessoas cada líder cadastrou nas escolas do time, em quantas escolas, e quanto isso é da estimativa do time. Do maior cadastro para o menor."
              quebra
            />
            <View style={{ borderWidth: 0.7, borderColor: C.line, borderRadius: 5, overflow: 'hidden' }}>
              <View fixed>
                <CabecalhoDosLideres parteDe="do time" comEscolas />
              </View>
              {lideresDoTime.map((l, i) => (
                <LinhaDoLider key={l.lider} l={l} posicao={i + 1} escala={maiorLider} total={estimativaTotal} ultima={i === lideresDoTime.length - 1} />
              ))}
            </View>
          </>
        ) : null}
      </Page>
    </Document>
  );
}

export async function gerarPdfDoComparativo(props: PdfDoComparativoProps): Promise<Blob> {
  return pdf(<PdfDoComparativo {...props} />).toBlob();
}
