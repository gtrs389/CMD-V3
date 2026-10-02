import { Document, Page, Text, View, pdf } from '@react-pdf/renderer';
import { appConfig } from '@/config/app.config';
import type { Member } from '@/lib/types';
import type { PlaceMember, PollingPlacePin } from '@/lib/domain/map-pin';
import { estimatedVotes } from '@/lib/domain/map-pin';
import { recruiterText } from '@/lib/domain/recruitment';
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
