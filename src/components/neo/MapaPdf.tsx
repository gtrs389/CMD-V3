import type { ReactNode } from 'react';
import { Document, Page, Text, View, pdf } from '@react-pdf/renderer';
import { appConfig } from '@/config/app.config';
import type { Member } from '@/lib/types';
import type { PlaceMember, PollingPlacePin } from '@/lib/domain/map-pin';
import { estimatedVotes } from '@/lib/domain/map-pin';
import { recruiterText } from '@/lib/domain/recruitment';
import type {
  LiderNoRanking,
  LinhaContada,
  RankingDeLideres,
  RankingDeVotos,
} from '@/lib/domain/votos-por-lideranca';
import {
  Barras,
  C,
  Cabecalho,
  Chip,
  Kpi,
  LinhaDeKpis,
  Rodape,
  Tabela,
  data,
  num,
  pct,
  s,
  st,
  telefone,
} from './pdf-base';

/**
 * Os PDFs que saem do MAPA: a escola (local de votacao) e a Equipe de um
 * Lider. Montados no navegador, como os outros: nada vai a servidor nenhum,
 * e o arquivo baixa de verdade — nao e a janela de impressao.
 */

const AVISO = 'Documento reservado · contém dados pessoais (LGPD). Não compartilhe fora da coordenação.';

function Titulo({ kicker, titulo, sub, chips = [] }: { kicker: string; titulo: string; sub?: string; chips?: { texto: string; cor: string; fundo: string }[] }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={st.kicker}>{s(kicker)}</Text>
      <Text style={{ fontSize: 19, fontFamily: 'Helvetica-Bold', color: C.navy, lineHeight: 1.2, marginTop: 3 }}>{s(titulo)}</Text>
      {sub ? <Text style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>{s(sub)}</Text> : null}
      <View style={{ width: 42, height: 2, backgroundColor: C.gold, marginTop: 8 }} />
      {chips.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {chips.map((c) => (
            <View key={c.texto} style={{ marginRight: 4, marginBottom: 4 }}>
              <Chip {...c} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------
   Escola
   ------------------------------------------------------------------------- */

export interface PdfDaEscolaProps {
  escola: PollingPlacePin;
  /** Quem vota ali, como a lista "Ver pessoas" mostra. */
  pessoas: PlaceMember[];
  geradoEm: string;
}

export function PdfDaEscola({ escola, pessoas }: PdfDaEscolaProps) {
  const votos = estimatedVotes(escola);
  const nome = escola.title ?? 'Local de votação';
  const municipio = [escola.city, escola.state].filter(Boolean).join('/');
  const secoes = [...escola.sections].sort((a, b) => b.total - a.total);

  return (
    <Document title={s(nome)} author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda="Local de votação" direita={appConfig.shortName} />
        <Rodape texto={AVISO} />

        <Titulo
          kicker="LOCAL DE VOTAÇÃO"
          titulo={nome}
          sub={[escola.address, municipio].filter(Boolean).join(' · ') || municipio || '—'}
        />

        <LinhaDeKpis>
          <Kpi valor={num(votos)} rotulo="estimativa de votos" nota="uma pessoa cadastrada que vota aqui, um voto" tom={C.navy} />
          <Kpi valor={num(escola.women)} rotulo="mulheres" nota={`${pct(escola.women, votos)}% do total`} tom={C.danger} />
          <Kpi valor={num(escola.men)} rotulo="homens" nota={`${pct(escola.men, votos)}% do total`} tom={C.blue} />
          <Kpi valor={num(escola.others)} rotulo="não informado" nota={`${pct(escola.others, votos)}% do total`} tom={C.gold} />
        </LinhaDeKpis>

        <Text style={st.h3}>Votos por seção</Text>
        <Barras
          itens={secoes.map((linha) => ({
            rotulo:
              linha.zone || linha.section
                ? `Zona ${linha.zone ?? '?'} · Seção ${linha.section ?? '?'}`
                : 'Sem zona ou seção',
            quantidade: linha.total,
          }))}
          total={votos}
          cor={C.navy}
          unidade={['voto', 'votos']}
          larguraDoRotulo={140}
          vazio="Nenhuma seção informada."
        />

        <Text style={st.h3}>{s(`Quem vota aqui (${num(pessoas.length)})`)}</Text>
        <Tabela
          linhas={pessoas}
          chave={(p) => p.memberId}
          vazio="Ninguém listado neste local."
          colunas={[
            { titulo: '#', largura: '6%', celula: (_p, i) => String(i + 1) },
            { titulo: 'Pessoa', largura: '34%', celula: (p) => p.name },
            { titulo: 'Telefone', largura: '18%', celula: (p) => (p.phone ? telefone(p.phone) : '—') },
            {
              titulo: 'Zona · Seção',
              largura: '14%',
              celula: (p) => (p.zone || p.section ? `${p.zone ?? '?'} · ${p.section ?? '?'}` : '—'),
            },
            { titulo: 'Cadastrado por', largura: '28%', celula: (p) => p.cadastradoPor ?? '—' },
          ]}
        />
      </Page>
    </Document>
  );
}

export async function gerarPdfDaEscola(props: PdfDaEscolaProps): Promise<Blob> {
  return pdf(<PdfDaEscola {...props} />).toBlob();
}

/* -------------------------------------------------------------------------
   Equipe do Lider
   ------------------------------------------------------------------------- */

export interface PdfDaEquipeProps {
  lider: Member;
  equipe: Member[];
  /** Quantas pessoas da Equipe tem alguma inconsistencia (a mesma conta do quadro). */
  comInconsistencia: number;
  geradoEm: string;
}

export function PdfDaEquipe({ lider, equipe, comInconsistencia, geradoEm }: PdfDaEquipeProps) {
  const agora = new Date(geradoEm).getTime();
  const ultimos7 = equipe.filter(
    (m) => !m.semDataDeCadastro && agora - new Date(m.createdAt).getTime() <= 7 * 86_400_000,
  ).length;
  const comFoto = equipe.filter((m) => m.photoVerified === true).length;
  const ordenada = [...equipe].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return (
    <Document title={s(`Equipe de ${lider.name}`)} author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda="Equipe do Líder" direita={appConfig.shortName} />
        <Rodape texto={AVISO} />

        <Titulo
          kicker="EQUIPE DO LÍDER"
          titulo={lider.name}
          chips={[
            ...(lider.tag ? [{ texto: lider.tag, cor: C.white, fundo: C.navy }] : []),
            ...(lider.access === 'DISABLED' ? [{ texto: 'Líder desativado', cor: C.danger, fundo: C.dangerSoft }] : []),
          ]}
        />

        <LinhaDeKpis>
          <Kpi valor={num(equipe.length)} rotulo={equipe.length === 1 ? 'pessoa na Equipe' : 'pessoas na Equipe'} tom={C.navy} />
          <Kpi valor={num(ultimos7)} rotulo="cadastradas nos últimos 7 dias" tom={C.success} />
          <Kpi valor={num(comInconsistencia)} rotulo="com inconsistência" nota="ver o PDF de inconsistências" tom={comInconsistencia ? C.danger : C.success} />
          <Kpi valor={num(comFoto)} rotulo="verificadas por foto" nota={`${pct(comFoto, equipe.length)}% da Equipe`} tom={C.gold} />
        </LinhaDeKpis>

        <Text style={st.h3}>{s(`A Equipe (${num(equipe.length)})`)}</Text>
        <Tabela
          linhas={ordenada}
          chave={(m) => m.id}
          vazio="Este Líder ainda não trouxe ninguém."
          colunas={[
            { titulo: '#', largura: '6%', celula: (_m, i) => String(i + 1) },
            { titulo: 'Pessoa', largura: '32%', celula: (m) => m.name },
            { titulo: 'Telefone', largura: '17%', celula: (m) => (m.phone ? telefone(m.phone) : '—') },
            { titulo: 'Zona · Seção', largura: '13%', celula: (m) => (m.zone || m.section ? `${m.zone ?? '?'} · ${m.section ?? '?'}` : '—') },
            { titulo: 'Referência', largura: '17%', celula: (m) => m.reference ?? '—' },
            {
              titulo: 'Cadastro',
              largura: '15%',
              alinhar: 'right',
              celula: (m) => (m.semDataDeCadastro ? '—' : data(m.createdAt)),
            },
          ]}
        />

        <Text style={{ fontSize: 7, color: C.faint, marginTop: 8 }}>
          {s(`Cadastrado por: ${recruiterText(lider.recruitedBy)}.`)}
        </Text>
      </Page>
    </Document>
  );
}

export async function gerarPdfDaEquipe(props: PdfDaEquipeProps): Promise<Blob> {
  return pdf(<PdfDaEquipe {...props} />).toBlob();
}

/* -------------------------------------------------------------------------
   Podio e barra (os dois rankings)
   ------------------------------------------------------------------------- */

const MEDALHA = ['#e0a426', '#8e9aa7', '#b06a2c'];

/** "72 votos", "1 voto": o numero sempre com o que ele conta. */
const votos = (n: number) => `${num(n)} ${n === 1 ? 'voto' : 'votos'}`;
const pessoas = (n: number) => `${num(n)} ${n === 1 ? 'pessoa' : 'pessoas'}`;

/** Faixa de leitura: diz, em uma frase, o que e um voto neste documento. */
function ComoLer({ texto }: { texto: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.goldSoft, borderLeftWidth: 3, borderLeftColor: C.gold, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 10 }}>
      <Text style={{ fontSize: 8, color: C.ink2, lineHeight: 1.4 }}>
        <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s('Como ler: ')}</Text>
        {s(texto)}
      </Text>
    </View>
  );
}

/** Altura de cada degrau (1o, 2o, 3o): fixa, para o desenho nao depender do texto. */
const DEGRAU = [62, 44, 30];

function Podio({ itens }: { itens: { titulo: string; sub?: string | null; valor: string; nota?: string }[] }) {
  // 2o, 1o, 3o: o primeiro no meio e mais alto, como num podio de verdade. O
  // texto fica em cima do degrau; o degrau e que marca a posicao.
  const ordem = [1, 0, 2].filter((i) => itens[i]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 4, marginBottom: 10 }} wrap={false}>
      {ordem.map((i) => {
        const item = itens[i];
        const alto = i === 0;
        return (
          <View key={i} style={{ flex: 1, marginHorizontal: 1, justifyContent: 'flex-end' }}>
            <View style={{ alignItems: 'center', paddingHorizontal: 6, marginBottom: 5 }}>
              <Text style={{ fontSize: alto ? 10 : 9, fontFamily: 'Helvetica-Bold', color: C.ink, lineHeight: 1.25, textAlign: 'center' }}>{s(item.titulo)}</Text>
              {item.sub ? <Text style={{ fontSize: 7, color: C.muted, marginTop: 1.5, textAlign: 'center' }}>{s(item.sub)}</Text> : null}
              <Text style={{ fontSize: alto ? 20 : 15, fontFamily: 'Helvetica-Bold', color: alto ? MEDALHA[0] : C.navy, marginTop: 4 }}>{s(item.valor)}</Text>
              {item.nota ? <Text style={{ fontSize: 6.8, color: C.faint, marginTop: 1 }}>{s(item.nota)}</Text> : null}
            </View>
            <View
              style={{
                height: DEGRAU[i],
                backgroundColor: alto ? C.navy : C.bg,
                borderTopWidth: 3,
                borderTopColor: MEDALHA[i],
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
                alignItems: 'center',
                paddingTop: 6,
              }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: MEDALHA[i], justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.white }}>{`${i + 1}º`}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function BarraNaCelula({ fatia, cor = C.navy }: { fatia: number; cor?: string }) {
  return (
    <View style={{ width: '100%', height: 5, backgroundColor: '#e7ecf1', borderRadius: 2.5 }}>
      <View style={{ width: `${Math.max(fatia > 0 ? 3 : 0, Math.round(fatia * 100))}%`, height: 5, backgroundColor: cor, borderRadius: 2.5 }} />
    </View>
  );
}

/** "23%", e "<1%" quando ha voto mas a fatia arredonda para zero. */
const fatiaEmTexto = (parte: number, total: number) => {
  const p = pct(parte, total);
  return p === 0 && parte > 0 ? '<1%' : `${p}%`;
};

/** A posicao no ranking: medalha para os tres primeiros, numero para o resto. */
function Posicao({ n }: { n: number }) {
  if (n > 3) return <Text>{n}</Text>;
  return (
    <View style={{ width: 13, height: 13, borderRadius: 6.5, backgroundColor: MEDALHA[n - 1], justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.white }}>{n}</Text>
    </View>
  );
}

/** "1 · Ranking das zonas", com uma linha dizendo o que a lista mostra. */
function Parte({ numero, titulo, texto, quebra = false }: { numero: number; titulo: string; texto: string; quebra?: boolean }) {
  return (
    <View break={quebra} wrap={false} style={{ marginTop: quebra ? 0 : 14, marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: C.gold, justifyContent: 'center', alignItems: 'center', marginRight: 6 }}>
          <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.white }}>{numero}</Text>
        </View>
        <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.navy }}>{s(titulo)}</Text>
      </View>
      <Text style={{ fontSize: 7.6, color: C.muted, marginTop: 3 }}>{s(texto)}</Text>
    </View>
  );
}

/** "Seção 144: 20 votos · Seção 145: 12 votos" — TODAS as secoes da escola. */
function secoesEmLinha(secoes: { zone: string | null; section: string | null; total: number }[]): string {
  const comVoto = secoes.filter((linha) => linha.section && linha.total > 0);
  // Escola com mais de uma zona: a secao leva a zona junto, senao "Seção 10" fica ambigua.
  const variasZonas = new Set(comVoto.map((linha) => linha.zone)).size > 1;
  const partes = comVoto.map(
    (linha) => `${variasZonas ? `Zona ${linha.zone ?? '?'} · ` : ''}Seção ${linha.section}: ${votos(linha.total)}`,
  );
  return partes.length ? partes.join(' · ') : '—';
}

/* -------------------------------------------------------------------------
   Onde voce tem mais votos
   ------------------------------------------------------------------------- */

export interface PdfDoRankingDeVotosProps {
  ranking: RankingDeVotos;
  /** O recorte do mapa, em palavras ("Zona 10 · Palmeira dos Índios"). Vazio: tudo. */
  filtro: string | null;
  geradoEm: string;
}

export function PdfDoRankingDeVotos({ ranking, filtro }: PdfDoRankingDeVotosProps) {
  const { escolas, zonas, secoes, total } = ranking;
  const maiorZona = Math.max(1, ...zonas.map((z) => z.votos));
  return (
    <Document title="Onde você tem mais votos" author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda="Onde você tem mais votos" direita={appConfig.shortName} />
        <Rodape texto={AVISO} />

        <Titulo
          kicker="ONDE VOCÊ TEM MAIS VOTOS"
          titulo={`${num(total)} ${total === 1 ? 'voto' : 'votos'} em ${num(escolas.length)} ${escolas.length === 1 ? 'local' : 'locais'}`}
          chips={[
            { texto: filtro ? `Recorte: ${filtro}` : 'Todo o mapa', cor: C.navy, fundo: C.bg },
            { texto: 'Uma pessoa cadastrada que vota no local, um voto', cor: C.muted, fundo: C.bg },
          ]}
        />

        <ComoLer texto="cada pessoa cadastrada que vota num local é 1 voto para esse local. Ex.: 72 votos = 72 pessoas cadastradas votam ali." />

        <LinhaDeKpis>
          <Kpi valor={num(total)} rotulo="votos estimados" tom={C.navy} />
          <Kpi valor={num(escolas.length)} rotulo="locais de votação" tom={C.blue} />
          <Kpi valor={num(zonas.length)} rotulo={zonas.length === 1 ? 'zona' : 'zonas'} tom={C.gold} />
          <Kpi valor={num(ranking.totalDeSecoes)} rotulo="seções com votos" tom={C.success} />
        </LinhaDeKpis>

        {escolas.length ? (
          <>
            <Text style={st.h3}>Pódio dos locais de votação</Text>
            <Podio
              itens={escolas.slice(0, 3).map((e) => ({
                titulo: e.place.title ?? 'Local de votação',
                sub: [e.place.city, e.place.state].filter(Boolean).join('/'),
                valor: votos(e.votos),
                nota: `${pct(e.votos, total)}% de todos os votos`,
              }))}
            />
          </>
        ) : null}

        <Parte
          numero={1}
          titulo="Ranking das zonas eleitorais"
          texto={`Os votos de cada zona, da que tem mais para a que tem menos (${zonas.length === 1 ? '1 zona' : `${num(zonas.length)} zonas`}).`}
        />
        <Tabela
          linhas={zonas}
          chave={(z) => z.zona}
          vazio="Nenhuma zona com votos neste recorte."
          colunas={[
            { titulo: '#', largura: '6%', celula: (_z, i) => <Posicao n={i + 1} /> },
            { titulo: 'Zona', largura: '11%', celula: (z) => <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(z.zona === 'Sem zona' ? z.zona : `Zona ${z.zona}`)}</Text> },
            { titulo: 'Votos', largura: '27%', celula: (z) => (
              <View style={{ width: '100%' }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>{s(`${votos(z.votos)} · ${fatiaEmTexto(z.votos, total)}`)}</Text>
                <BarraNaCelula fatia={z.votos / maiorZona} cor={C.gold} />
              </View>
            ) },
            { titulo: 'Locais', largura: '9%', alinhar: 'center', celula: (z) => num(z.escolas) },
            { titulo: 'Seções', largura: '9%', alinhar: 'center', celula: (z) => num(z.secoes) },
            { titulo: 'Local mais forte', largura: '38%', celula: (z) => <Text style={{ paddingLeft: 6 }}>{s(z.escolaForte ?? '—')}</Text> },
          ]}
        />

        <Parte
          numero={2}
          titulo="Ranking dos locais de votação"
          texto={`Os votos de cada local, com as seções que funcionam nele (${num(escolas.length)} ${escolas.length === 1 ? 'local' : 'locais'}).`}
          quebra={escolas.length > 12}
        />
        <Tabela
          linhas={escolas}
          chave={(e) => e.place.locationId}
          vazio="Nenhum local com votos neste recorte."
          colunas={[
            { titulo: '#', largura: '6%', celula: (e) => <Posicao n={e.posicao} /> },
            {
              titulo: 'Local de votação',
              largura: '38%',
              celula: (e) => (
                <View>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(e.place.title ?? 'Local de votação')}</Text>
                  <Text style={{ fontSize: 6.8, color: C.faint, marginTop: 1 }}>
                    {s([e.place.address, [e.place.city, e.place.state].filter(Boolean).join('/')].filter(Boolean).join(' · ') || '—')}
                  </Text>
                </View>
              ),
            },
            {
              titulo: 'Votos',
              largura: '20%',
              celula: (e) => (
                <View style={{ width: '100%' }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>{s(`${votos(e.votos)} · ${fatiaEmTexto(e.votos, total)}`)}</Text>
                  <BarraNaCelula fatia={escolas[0] ? e.votos / escolas[0].votos : 0} />
                </View>
              ),
            },
            {
              titulo: 'Zona e seções',
              largura: '36%',
              celula: (e) => {
                const zonasDaEscola = [...new Set(e.secoes.map((linha) => linha.zone).filter(Boolean))];
                return (
                  <View>
                    <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.4 }}>
                      {s(zonasDaEscola.length ? `Zona ${zonasDaEscola.join(', ')}` : 'Sem zona')}
                    </Text>
                    <Text style={{ fontSize: 7, color: C.muted, marginTop: 1 }}>{s(secoesEmLinha(e.secoes))}</Text>
                  </View>
                );
              },
            },
          ]}
        />

        <Parte
          numero={3}
          titulo="Ranking das seções eleitorais"
          texto={`Todas as seções com voto, da que tem mais para a que tem menos, e o local onde cada uma funciona (${num(secoes.length)} ${secoes.length === 1 ? 'seção' : 'seções'}).`}
          quebra={secoes.length > 0}
        />
        {secoes.length >= 3 ? (
          <Podio
            itens={secoes.slice(0, 3).map((x) => ({
              titulo: `Zona ${x.zona} · Seção ${x.secao}`,
              sub: x.local,
              valor: votos(x.votos),
              nota: `${fatiaEmTexto(x.votos, total)} de todos os votos`,
            }))}
          />
        ) : null}
        <Tabela
          linhas={secoes}
          chave={(x) => `${x.posicao}`}
          vazio="Nenhuma seção com votos neste recorte."
          colunas={[
            { titulo: '#', largura: '6%', celula: (x) => <Posicao n={x.posicao} /> },
            { titulo: 'Zona', largura: '9%', celula: (x) => <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(x.zona)}</Text> },
            { titulo: 'Seção', largura: '9%', celula: (x) => <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(x.secao)}</Text> },
            {
              titulo: 'Local de votação',
              largura: '46%',
              celula: (x) => (
                <Text>
                  {s(x.local)}
                  {x.municipio ? <Text style={{ fontSize: 6.8, color: C.faint }}>{s(`  ·  ${x.municipio}`)}</Text> : null}
                </Text>
              ),
            },
            {
              titulo: 'Votos',
              largura: '30%',
              celula: (x) => (
                <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', width: 72 }}>{s(`${votos(x.votos)} · ${fatiaEmTexto(x.votos, total)}`)}</Text>
                  <View style={{ flex: 1 }}>
                    <BarraNaCelula fatia={secoes[0] ? x.votos / secoes[0].votos : 0} cor={C.success} />
                  </View>
                </View>
              ),
            },
          ]}
        />
      </Page>
    </Document>
  );
}

export async function gerarPdfDoRankingDeVotos(props: PdfDoRankingDeVotosProps): Promise<Blob> {
  return pdf(<PdfDoRankingDeVotos {...props} />).toBlob();
}

/* -------------------------------------------------------------------------
   Ranking dos Lideres
   ------------------------------------------------------------------------- */

export interface PdfDoRankingDeLideresProps {
  ranking: RankingDeLideres;
  geradoEm: string;
}

/** Uma linha de "votos por ...": rotulo, detalhe, valor e barra. */
function CelulaDeVoto({ linha, total, maior, cor }: { linha: LinhaContada; total: number; maior: number; cor: string }) {
  return (
    <View style={{ flex: 1, paddingRight: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 7.6, color: C.ink2, flex: 1, paddingRight: 4 }}>{s(linha.rotulo)}</Text>
        <Text style={{ fontSize: 7.6, fontFamily: 'Helvetica-Bold' }}>{s(`${votos(linha.votos)} · ${fatiaEmTexto(linha.votos, total)}`)}</Text>
      </View>
      {linha.detalhe ? <Text style={{ fontSize: 6.4, color: C.faint }}>{s(linha.detalhe)}</Text> : null}
      <View style={{ marginTop: 1.5 }}>
        <BarraNaCelula fatia={linha.votos / maior} cor={cor} />
      </View>
    </View>
  );
}

/**
 * "Votos por local / zona / secao": TODAS as linhas, nenhuma escondida em
 * "e mais N". Em duas colunas, para caber; cada par de linhas e indivisivel,
 * e a lista continua na pagina seguinte quando for longa.
 */
function ListaDeVotos({
  titulo,
  linhas,
  total,
  cor,
  cabecalho,
}: {
  titulo: string;
  linhas: LinhaContada[];
  total: number;
  cor: string;
  /** Vai PRESO ao titulo e ao primeiro par: nunca fica sozinho no pe da pagina. */
  cabecalho?: ReactNode;
}) {
  const maior = Math.max(1, ...linhas.map((l) => l.votos));
  const pares: LinhaContada[][] = [];
  for (let i = 0; i < linhas.length; i += 2) pares.push(linhas.slice(i, i + 2));
  const par = (dupla: LinhaContada[], i: number) => (
    <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }} wrap={false}>
      <CelulaDeVoto linha={dupla[0]} total={total} maior={maior} cor={cor} />
      {dupla[1] ? <CelulaDeVoto linha={dupla[1]} total={total} maior={maior} cor={cor} /> : <View style={{ flex: 1 }} />}
    </View>
  );
  return (
    <View style={{ marginBottom: 8 }}>
      {/* Titulo + primeiro par juntos (e o cabecalho do Lider, quando vem):
          a lista nunca comeca no pe de uma pagina e termina na outra. */}
      <View wrap={false}>
        {cabecalho}
        <View style={cabecalho ? { paddingHorizontal: 9, paddingTop: 8 } : undefined}>
          <Text style={{ fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: C.faint, letterSpacing: 0.8, marginBottom: 4 }}>
            {s(`${titulo.toUpperCase()} (${num(linhas.length)})`)}
          </Text>
          {linhas.length === 0 ? <Text style={{ fontSize: 7.4, color: C.faint }}>—</Text> : par(pares[0], 0)}
        </View>
      </View>
      <View style={cabecalho ? { paddingHorizontal: 9 } : undefined}>{pares.slice(1).map((dupla, i) => par(dupla, i + 1))}</View>
    </View>
  );
}

function FichaDoLider({ item }: { item: LiderNoRanking }) {
  const { lider } = item;
  const medalha = item.posicao <= 3 ? MEDALHA[item.posicao - 1] : C.navy2;
  return (
    <View style={{ borderWidth: 0.7, borderColor: C.line, borderRadius: 5, marginBottom: 10 }}>
      <ListaDeVotos
        titulo="Votos por local de votação"
        linhas={item.escolas}
        total={item.equipe}
        cor={C.navy}
        cabecalho={
          <>
            {/* Sem telefone: o PDF circula, e o numero do Lider nao vai junto. */}
            <View
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.navy, paddingHorizontal: 9, paddingVertical: 7, borderTopLeftRadius: 5, borderTopRightRadius: 5 }}
            >
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: medalha, justifyContent: 'center', alignItems: 'center', marginRight: 7 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.white }}>{item.posicao}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.white }}>{s(lider.name)}</Text>
                <Text style={{ fontSize: 6.8, color: C.navy3, marginTop: 1 }}>{s(lider.tag ? `Líder · ${lider.tag}` : 'Líder')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 15, fontFamily: 'Helvetica-Bold', color: MEDALHA[0] }}>{s(pessoas(item.equipe))}</Text>
                <Text style={{ fontSize: 6.6, color: C.navy3 }}>{s(`na Equipe = ${votos(item.equipe)} · ${Math.round(item.fatia * 100)}% dos liderados`)}</Text>
              </View>
            </View>
          </>
        }
      />
      <View style={{ paddingHorizontal: 9, paddingBottom: 2 }}>
        <ListaDeVotos titulo="Votos por zona" linhas={item.zonas} total={item.equipe} cor={C.gold} />
        <ListaDeVotos titulo="Votos por seção" linhas={item.secoes} total={item.equipe} cor={C.blue} />
      </View>
      <Text style={{ fontSize: 6.6, color: C.faint, paddingHorizontal: 9, paddingBottom: 6 }}>
        {s(
          `${pessoas(item.comEscola)} de ${num(item.equipe)} com local de votação identificado` +
            (item.semSecao ? ` · ${pessoas(item.semSecao)} sem zona e seção no cadastro` : ''),
        )}
      </Text>
    </View>
  );
}

export function PdfDoRankingDeLideres({ ranking }: PdfDoRankingDeLideresProps) {
  const { lideres, totalDeLiderados, comEquipe } = ranking;
  const media = lideres.length ? totalDeLiderados / lideres.length : 0;
  const comGente = lideres.filter((l) => l.equipe > 0);
  const semGente = lideres.filter((l) => l.equipe === 0);
  return (
    <Document title="Ranking dos Líderes" author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda="Ranking dos Líderes" direita={appConfig.shortName} />
        <Rodape texto={AVISO} />

        <Titulo
          kicker="RANKING DOS LÍDERES"
          titulo={`${num(lideres.length)} ${lideres.length === 1 ? 'Líder' : 'Líderes'}, ${num(totalDeLiderados)} ${totalDeLiderados === 1 ? 'liderado' : 'liderados'}`}
          chips={[{ texto: 'A mesma pessoa repetida pelo mesmo Líder conta uma vez', cor: C.muted, fundo: C.bg }]}
        />

        <ComoLer texto="cada pessoa da Equipe de um Líder é 1 voto no local, na zona e na seção onde ela vota. Ex.: 72 votos no Colégio X = 72 pessoas da Equipe votam lá." />

        <LinhaDeKpis>
          <Kpi valor={num(lideres.length)} rotulo="Líderes" tom={C.navy} />
          <Kpi valor={num(comEquipe)} rotulo="já trouxeram alguém" tom={C.success} />
          <Kpi valor={num(totalDeLiderados)} rotulo="liderados" tom={C.blue} />
          <Kpi valor={media.toFixed(1).replace('.', ',')} rotulo="média por Líder" tom={C.gold} />
        </LinhaDeKpis>

        {comGente.length ? (
          <>
            <Text style={st.h3}>Pódio</Text>
            <Podio
              itens={comGente.slice(0, 3).map((l) => ({
                titulo: l.lider.name,
                sub: l.escolas[0] ? `Mais forte em ${l.escolas[0].rotulo} (${votos(l.escolas[0].votos)})` : null,
                valor: pessoas(l.equipe),
                nota: `${votos(l.equipe)} · ${pct(l.equipe, totalDeLiderados)}% dos liderados`,
              }))}
            />
          </>
        ) : null}

        <Text style={st.h3}>Classificação</Text>
        <Tabela
          linhas={lideres}
          chave={(l) => l.lider.id}
          vazio="Nenhum Líder neste time."
          colunas={[
            {
              titulo: '#',
              largura: '6%',
              celula: (l) =>
                l.posicao <= 3 && l.equipe > 0 ? (
                  <View style={{ width: 13, height: 13, borderRadius: 6.5, backgroundColor: MEDALHA[l.posicao - 1], justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.white }}>{l.posicao}</Text>
                  </View>
                ) : (
                  String(l.posicao)
                ),
            },
            {
              titulo: 'Líder',
              largura: '25%',
              celula: (l) => (
                <View>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(l.lider.name)}</Text>
                  {l.lider.tag ? <Text style={{ fontSize: 6.6, color: C.blue, marginTop: 1 }}>{s(l.lider.tag)}</Text> : null}
                </View>
              ),
            },
            {
              titulo: 'Equipe',
              largura: '16%',
              celula: (l) => (
                <View style={{ width: '100%' }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>{s(`${pessoas(l.equipe)} · ${pct(l.equipe, totalDeLiderados)}%`)}</Text>
                  <BarraNaCelula fatia={lideres[0]?.equipe ? l.equipe / lideres[0].equipe : 0} cor={C.navy} />
                </View>
              ),
            },
            {
              titulo: 'Local mais forte',
              largura: '31%',
              celula: (l) =>
                l.escolas[0] ? (
                  <View>
                    <Text>{s(l.escolas[0].rotulo)}</Text>
                    <Text style={{ fontSize: 7.4, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 1 }}>{s(votos(l.escolas[0].votos))}</Text>
                  </View>
                ) : (
                  '—'
                ),
            },
            {
              titulo: 'Zona mais forte',
              largura: '11%',
              celula: (l) =>
                l.zonas[0] ? (
                  <View>
                    <Text>{s(l.zonas[0].rotulo)}</Text>
                    <Text style={{ fontSize: 7.4, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 1 }}>{s(votos(l.zonas[0].votos))}</Text>
                  </View>
                ) : (
                  '—'
                ),
            },
            {
              titulo: 'Seção mais forte',
              largura: '11%',
              celula: (l) =>
                l.secoes[0] ? (
                  <View>
                    <Text>{s(`Seção ${l.secoes[0].rotulo.split('Seção ')[1] ?? '—'}`)}</Text>
                    <Text style={{ fontSize: 7.4, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 1 }}>{s(votos(l.secoes[0].votos))}</Text>
                  </View>
                ) : (
                  '—'
                ),
            },
          ]}
        />

        {comGente.length ? (
          <View break>
            <Titulo
              kicker="ONDE A EQUIPE DE CADA LÍDER VOTA"
              titulo="Locais, zonas e seções por Líder"
              sub="Pela zona e seção do cadastro de cada pessoa da Equipe. Uma pessoa, um voto."
            />
            {comGente.map((item) => (
              <FichaDoLider key={item.lider.id} item={item} />
            ))}
          </View>
        ) : null}

        {semGente.length ? (
          <View wrap={false} style={{ marginTop: 6 }}>
            <Text style={st.h3}>{s(`Ainda sem Equipe (${num(semGente.length)})`)}</Text>
            <Text style={{ fontSize: 8, color: C.muted, lineHeight: 1.5 }}>{s(semGente.map((l) => l.lider.name).join(' · '))}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

export async function gerarPdfDoRankingDeLideres(props: PdfDoRankingDeLideresProps): Promise<Blob> {
  return pdf(<PdfDoRankingDeLideres {...props} />).toBlob();
}
