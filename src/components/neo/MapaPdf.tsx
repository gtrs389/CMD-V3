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
  dataLonga,
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

function Titulo({ kicker, titulo, sub, chips = [] }: { kicker: string; titulo: string; sub: string; chips?: { texto: string; cor: string; fundo: string }[] }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={st.kicker}>{s(kicker)}</Text>
      <Text style={{ fontSize: 19, fontFamily: 'Helvetica-Bold', color: C.navy, lineHeight: 1.2, marginTop: 3 }}>{s(titulo)}</Text>
      <Text style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>{s(sub)}</Text>
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
  time: string;
  escola: PollingPlacePin;
  /** Quem vota ali, como a lista "Ver pessoas" mostra. */
  pessoas: PlaceMember[];
  geradoEm: string;
}

export function PdfDaEscola({ time, escola, pessoas, geradoEm }: PdfDaEscolaProps) {
  const votos = estimatedVotes(escola);
  const nome = escola.title ?? 'Local de votação';
  const municipio = [escola.city, escola.state].filter(Boolean).join('/');
  const secoes = [...escola.sections].sort((a, b) => b.total - a.total);

  return (
    <Document title={s(`${nome} — ${time}`)} author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda={`Local de votação · ${time}`} direita={appConfig.shortName} />
        <Rodape texto={AVISO} />

        <Titulo
          kicker="LOCAL DE VOTAÇÃO"
          titulo={nome}
          sub={[escola.address, municipio].filter(Boolean).join(' · ') || municipio || '—'}
          chips={[{ texto: `${time} · ${dataLonga(geradoEm)}`, cor: C.navy, fundo: C.bg }]}
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
  time: string;
  lider: Member;
  equipe: Member[];
  /** Quantas pessoas da Equipe tem alguma inconsistencia (a mesma conta do quadro). */
  comInconsistencia: number;
  geradoEm: string;
}

export function PdfDaEquipe({ time, lider, equipe, comInconsistencia, geradoEm }: PdfDaEquipeProps) {
  const agora = new Date(geradoEm).getTime();
  const ultimos7 = equipe.filter(
    (m) => !m.semDataDeCadastro && agora - new Date(m.createdAt).getTime() <= 7 * 86_400_000,
  ).length;
  const comFoto = equipe.filter((m) => m.photoVerified === true).length;
  const ordenada = [...equipe].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return (
    <Document title={s(`Equipe de ${lider.name} — ${time}`)} author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda={`Equipe do Líder · ${time}`} direita={appConfig.shortName} />
        <Rodape texto={AVISO} />

        <Titulo
          kicker="EQUIPE DO LÍDER"
          titulo={lider.name}
          sub={[lider.phone ? telefone(lider.phone) : null, `${time} · ${dataLonga(geradoEm)}`].filter(Boolean).join(' · ')}
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

function Podio({ itens }: { itens: { titulo: string; sub?: string | null; valor: string; nota?: string }[] }) {
  // 2o, 1o, 3o: o primeiro no meio e mais alto, como num podio de verdade.
  const ordem = [1, 0, 2].filter((i) => itens[i]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 4, marginBottom: 10 }} wrap={false}>
      {ordem.map((i) => {
        const item = itens[i];
        const alto = i === 0;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              marginHorizontal: 3,
              paddingVertical: alto ? 14 : 10,
              paddingHorizontal: 9,
              borderRadius: 6,
              backgroundColor: alto ? C.navy : C.bg,
              borderTopWidth: 3,
              borderTopColor: MEDALHA[i],
            }}
          >
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: MEDALHA[i], justifyContent: 'center', alignItems: 'center', marginBottom: 5 }}>
              <Text style={{ fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.white }}>{i + 1}</Text>
            </View>
            <Text style={{ fontSize: alto ? 10 : 9, fontFamily: 'Helvetica-Bold', color: alto ? C.white : C.ink, lineHeight: 1.25 }}>{s(item.titulo)}</Text>
            {item.sub ? <Text style={{ fontSize: 7, color: alto ? C.navy3 : C.muted, marginTop: 1.5 }}>{s(item.sub)}</Text> : null}
            <Text style={{ fontSize: alto ? 20 : 15, fontFamily: 'Helvetica-Bold', color: alto ? MEDALHA[0] : C.navy, marginTop: 6 }}>{s(item.valor)}</Text>
            {item.nota ? <Text style={{ fontSize: 6.8, color: alto ? C.navy3 : C.faint, marginTop: 1 }}>{s(item.nota)}</Text> : null}
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

/** "144 (20) · 145 (12)" — as secoes de uma escola, com os votos de cada uma. */
function secoesEmLinha(secoes: { zone: string | null; section: string | null; total: number }[], limite = 8): string {
  const partes = secoes
    .filter((linha) => linha.section)
    .slice(0, limite)
    .map((linha) => `${linha.section} (${num(linha.total)})`);
  const resto = secoes.filter((linha) => linha.section).length - partes.length;
  return partes.length ? `${partes.join(' · ')}${resto > 0 ? ` +${resto}` : ''}` : '—';
}

/* -------------------------------------------------------------------------
   Onde voce tem mais votos
   ------------------------------------------------------------------------- */

export interface PdfDoRankingDeVotosProps {
  time: string;
  ranking: RankingDeVotos;
  /** O recorte do mapa, em palavras ("Zona 10 · Palmeira dos Índios"). Vazio: tudo. */
  filtro: string | null;
  geradoEm: string;
}

export function PdfDoRankingDeVotos({ time, ranking, filtro, geradoEm }: PdfDoRankingDeVotosProps) {
  const { escolas, zonas, total } = ranking;
  const maiorZona = Math.max(1, ...zonas.map((z) => z.votos));
  return (
    <Document title={s(`Onde você tem mais votos — ${time}`)} author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda={`Onde você tem mais votos · ${time}`} direita={appConfig.shortName} />
        <Rodape texto={AVISO} />

        <Titulo
          kicker="ONDE VOCÊ TEM MAIS VOTOS"
          titulo={`${num(total)} ${total === 1 ? 'voto' : 'votos'} em ${num(escolas.length)} ${escolas.length === 1 ? 'local' : 'locais'}`}
          sub={`${time} · ${dataLonga(geradoEm)}`}
          chips={[
            { texto: filtro ? `Recorte: ${filtro}` : 'Todo o mapa', cor: C.navy, fundo: C.bg },
            { texto: 'Uma pessoa cadastrada que vota no local, um voto', cor: C.muted, fundo: C.bg },
          ]}
        />

        <LinhaDeKpis>
          <Kpi valor={num(total)} rotulo="votos estimados" tom={C.navy} />
          <Kpi valor={num(escolas.length)} rotulo="locais de votação" tom={C.blue} />
          <Kpi valor={num(zonas.length)} rotulo={zonas.length === 1 ? 'zona' : 'zonas'} tom={C.gold} />
          <Kpi valor={num(ranking.totalDeSecoes)} rotulo="seções com votos" tom={C.success} />
        </LinhaDeKpis>

        {escolas.length ? (
          <>
            <Text style={st.h3}>Pódio</Text>
            <Podio
              itens={escolas.slice(0, 3).map((e) => ({
                titulo: e.place.title ?? 'Local de votação',
                sub: [e.place.city, e.place.state].filter(Boolean).join('/'),
                valor: num(e.votos),
                nota: `${pct(e.votos, total)}% dos votos`,
              }))}
            />
          </>
        ) : null}

        <Text style={st.h3}>Por zona eleitoral</Text>
        <Tabela
          linhas={zonas}
          chave={(z) => z.zona}
          vazio="Nenhuma zona com votos neste recorte."
          colunas={[
            { titulo: 'Zona', largura: '11%', celula: (z) => <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(z.zona)}</Text> },
            { titulo: 'Votos', largura: '27%', celula: (z) => (
              <View style={{ width: '100%' }}>
                <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>{s(`${num(z.votos)} · ${pct(z.votos, total)}%`)}</Text>
                <BarraNaCelula fatia={z.votos / maiorZona} cor={C.gold} />
              </View>
            ) },
            { titulo: 'Locais', largura: '10%', alinhar: 'center', celula: (z) => num(z.escolas) },
            { titulo: 'Seções', largura: '10%', alinhar: 'center', celula: (z) => num(z.secoes) },
            { titulo: 'Local mais forte', largura: '42%', celula: (z) => <Text style={{ paddingLeft: 6 }}>{s(z.escolaForte ?? '—')}</Text> },
          ]}
        />

        <Text style={st.h3} break={escolas.length > 12}>Ranking dos locais de votação</Text>
        <Tabela
          linhas={escolas}
          chave={(e) => e.place.locationId}
          vazio="Nenhum local com votos neste recorte."
          colunas={[
            {
              titulo: '#',
              largura: '6%',
              celula: (e) =>
                e.posicao <= 3 ? (
                  <View style={{ width: 13, height: 13, borderRadius: 6.5, backgroundColor: MEDALHA[e.posicao - 1], justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.white }}>{e.posicao}</Text>
                  </View>
                ) : (
                  String(e.posicao)
                ),
            },
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
                  <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>{s(`${num(e.votos)} · ${pct(e.votos, total)}%`)}</Text>
                  <BarraNaCelula fatia={escolas[0] ? e.votos / escolas[0].votos : 0} />
                </View>
              ),
            },
            {
              titulo: 'Zona · seções (votos)',
              largura: '36%',
              celula: (e) => {
                const zonasDaEscola = [...new Set(e.secoes.map((linha) => linha.zone).filter(Boolean))];
                return (
                  <View>
                    <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 7.4 }}>
                      {s(zonasDaEscola.length ? `Zona ${zonasDaEscola.join(', ')}` : 'Sem zona')}
                    </Text>
                    <Text style={{ fontSize: 7, color: C.muted, marginTop: 1 }}>{s(`Seções ${secoesEmLinha(e.secoes)}`)}</Text>
                  </View>
                );
              },
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
  time: string;
  ranking: RankingDeLideres;
  geradoEm: string;
}

function ColunaDeBarras({ titulo, linhas, total, cor }: { titulo: string; linhas: LinhaContada[]; total: number; cor: string }) {
  const maior = Math.max(1, ...linhas.map((l) => l.votos));
  return (
    <View style={{ flex: 1, marginRight: 8 }}>
      <Text style={{ fontSize: 6.6, fontFamily: 'Helvetica-Bold', color: C.faint, letterSpacing: 0.8, marginBottom: 4 }}>{s(titulo.toUpperCase())}</Text>
      {linhas.length === 0 ? (
        <Text style={{ fontSize: 7.4, color: C.faint }}>—</Text>
      ) : (
        linhas.slice(0, 5).map((linha) => (
          <View key={linha.rotulo} style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 7.4, color: C.ink2, flex: 1, paddingRight: 4 }}>{s(linha.rotulo)}</Text>
              <Text style={{ fontSize: 7.4, fontFamily: 'Helvetica-Bold' }}>{s(`${num(linha.votos)} · ${pct(linha.votos, total)}%`)}</Text>
            </View>
            {linha.detalhe ? <Text style={{ fontSize: 6.4, color: C.faint }}>{s(linha.detalhe)}</Text> : null}
            <View style={{ marginTop: 1.5 }}>
              <BarraNaCelula fatia={linha.votos / maior} cor={cor} />
            </View>
          </View>
        ))
      )}
      {linhas.length > 5 ? <Text style={{ fontSize: 6.6, color: C.faint }}>{s(`e mais ${linhas.length - 5}`)}</Text> : null}
    </View>
  );
}

function FichaDoLider({ item }: { item: LiderNoRanking }) {
  const { lider } = item;
  const medalha = item.posicao <= 3 ? MEDALHA[item.posicao - 1] : C.navy2;
  return (
    <View style={{ borderWidth: 0.7, borderColor: C.line, borderRadius: 5, marginBottom: 9 }} wrap={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.navy, paddingHorizontal: 9, paddingVertical: 7, borderTopLeftRadius: 5, borderTopRightRadius: 5 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: medalha, justifyContent: 'center', alignItems: 'center', marginRight: 7 }}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.white }}>{item.posicao}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.white }}>{s(lider.name)}</Text>
          <Text style={{ fontSize: 6.8, color: C.navy3, marginTop: 1 }}>
            {s([lider.tag, lider.phone ? telefone(lider.phone) : null].filter(Boolean).join(' · ') || 'Líder')}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 15, fontFamily: 'Helvetica-Bold', color: MEDALHA[0] }}>{num(item.equipe)}</Text>
          <Text style={{ fontSize: 6.6, color: C.navy3 }}>{s(`na Equipe · ${Math.round(item.fatia * 100)}% dos liderados`)}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 9, paddingTop: 7, paddingBottom: 3 }}>
        <ColunaDeBarras titulo="Locais de votação" linhas={item.escolas} total={item.equipe} cor={C.navy} />
        <ColunaDeBarras titulo="Zonas" linhas={item.zonas} total={item.equipe} cor={C.gold} />
        <ColunaDeBarras titulo="Seções" linhas={item.secoes} total={item.equipe} cor={C.blue} />
      </View>
      <Text style={{ fontSize: 6.6, color: C.faint, paddingHorizontal: 9, paddingBottom: 6 }}>
        {s(
          `${num(item.comEscola)} de ${num(item.equipe)} com local de votação identificado` +
            (item.semSecao ? ` · ${num(item.semSecao)} sem zona e seção no cadastro` : ''),
        )}
      </Text>
    </View>
  );
}

export function PdfDoRankingDeLideres({ time, ranking, geradoEm }: PdfDoRankingDeLideresProps) {
  const { lideres, totalDeLiderados, comEquipe } = ranking;
  const media = lideres.length ? totalDeLiderados / lideres.length : 0;
  const comGente = lideres.filter((l) => l.equipe > 0);
  const semGente = lideres.filter((l) => l.equipe === 0);
  return (
    <Document title={s(`Ranking dos Líderes — ${time}`)} author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda={`Ranking dos Líderes · ${time}`} direita={appConfig.shortName} />
        <Rodape texto={AVISO} />

        <Titulo
          kicker="RANKING DOS LÍDERES"
          titulo={`${num(lideres.length)} ${lideres.length === 1 ? 'Líder' : 'Líderes'}, ${num(totalDeLiderados)} ${totalDeLiderados === 1 ? 'liderado' : 'liderados'}`}
          sub={`${time} · ${dataLonga(geradoEm)}`}
          chips={[{ texto: 'A mesma pessoa repetida pelo mesmo Líder conta uma vez', cor: C.muted, fundo: C.bg }]}
        />

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
                sub: l.escolas[0] ? `Mais forte em ${l.escolas[0].rotulo}` : null,
                valor: num(l.equipe),
                nota: `${pct(l.equipe, totalDeLiderados)}% dos liderados`,
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
              largura: '27%',
              celula: (l) => (
                <View>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{s(l.lider.name)}</Text>
                  {l.lider.tag ? <Text style={{ fontSize: 6.6, color: C.blue, marginTop: 1 }}>{s(l.lider.tag)}</Text> : null}
                </View>
              ),
            },
            {
              titulo: 'Equipe',
              largura: '15%',
              celula: (l) => (
                <View style={{ width: '100%' }}>
                  <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>{s(`${num(l.equipe)} · ${pct(l.equipe, totalDeLiderados)}%`)}</Text>
                  <BarraNaCelula fatia={lideres[0]?.equipe ? l.equipe / lideres[0].equipe : 0} cor={C.navy} />
                </View>
              ),
            },
            {
              titulo: 'Local mais forte',
              largura: '30%',
              celula: (l) =>
                l.escolas[0] ? (
                  <View>
                    <Text>{s(l.escolas[0].rotulo)}</Text>
                    <Text style={{ fontSize: 6.6, color: C.faint, marginTop: 1 }}>{s(`${num(l.escolas[0].votos)} ${l.escolas[0].votos === 1 ? 'voto' : 'votos'}`)}</Text>
                  </View>
                ) : (
                  '—'
                ),
            },
            { titulo: 'Zona forte', largura: '10%', celula: (l) => (l.zonas[0] ? `${l.zonas[0].rotulo.replace('Zona ', '')} (${num(l.zonas[0].votos)})` : '—') },
            { titulo: 'Seção forte', largura: '12%', celula: (l) => (l.secoes[0] ? `${l.secoes[0].rotulo.split('Seção ')[1] ?? '—'} (${num(l.secoes[0].votos)})` : '—') },
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
