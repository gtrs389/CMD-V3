import { Document, Page, Text, View, pdf } from '@react-pdf/renderer';
import { appConfig } from '@/config/app.config';
import { agruparPorResponsavel, barrasPorResponsavel } from '@/lib/domain/por-responsavel';
import {
  C,
  CORES_DE_CATEGORIA,
  Cabecalho,
  Chip,
  BlocoDoGrupo,
  FaixaDoResponsavel,
  GraficoPorLideranca,
  Kpi,
  LinhaDeKpis,
  Marcadores,
  Rodape,
  TOM_GRAVIDADE,
  Tabela,
  data,
  dataLonga,
  num,
  pct,
  s,
  st,
  telefone,
  type CategoriaDoGrafico,
} from './pdf-base';

/**
 * Os PDFs do quadro de inconsistencias.
 *
 *   `ListaFiltrada`             so quem caiu nos filtros marcados, com o
 *                               grafico por lideranca e a lista agrupada
 *                               por quem cadastrou;
 *   `RelatorioDeInconsistencias` o quadro inteiro (ou o recorte de um
 *                               responsavel): repetidos, dados faltando,
 *                               dados para conferir e as demais pendencias.
 *
 * Montados no navegador de quem pediu, como o relatorio do NEO.
 */

const AVISO = 'Documento reservado · contém dados pessoais (LGPD). Não compartilhe fora da coordenação.';

/* -------------------------------------------------------------------------
   Lista filtrada
   ------------------------------------------------------------------------- */

export interface PessoaDaLista {
  nome: string;
  telefone: string;
  bairro: string;
  cadastradoPor: string;
  cadastradoEm: string;
  /** Em quais dos `filtros` a pessoa caiu (indices). */
  filtros: number[];
}

export interface ListaFiltradaProps {
  time: string;
  filtros: string[];
  responsavel: string | null;
  pessoas: PessoaDaLista[];
  geradaEm: string;
  /** Tamanho da base de cada responsavel (pelo texto de "cadastrado por"). */
  basePorResponsavel?: Record<string, number>;
}

function Titulo({ titulo, sub, chips }: { titulo: string; sub: string; chips: { texto: string; cor: string; fundo: string }[] }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={st.kicker}>PENDÊNCIAS DE INTEGRIDADE</Text>
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

/**
 * A lista que vai para a coordenacao — ou para cada lideranca corrigir a
 * sua parte: primeiro QUEM concentra (o grafico), depois a lista separada
 * por quem cadastrou, de quem tem mais para quem tem menos.
 */
export function ListaFiltrada({ time, filtros, responsavel, pessoas, geradaEm, basePorResponsavel = {} }: ListaFiltradaProps) {
  const categorias: CategoriaDoGrafico[] = filtros.map((rotulo, i) => ({ rotulo, cor: CORES_DE_CATEGORIA[i % CORES_DE_CATEGORIA.length] }));
  const barras = barrasPorResponsavel(pessoas, filtros.length, (p) => p.filtros, basePorResponsavel);
  const grupos = agruparPorResponsavel(pessoas);
  const top3 = barras.slice(0, 3).reduce((soma, b) => soma + b.total, 0);
  const variosFiltros = filtros.length > 1;

  return (
    <Document title={s(`Dados para corrigir — ${time}`)} author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda={`Dados para corrigir · ${time}`} direita={appConfig.shortName} />
        <Rodape texto={AVISO} />
        <Titulo
          titulo={`${num(pessoas.length)} ${pessoas.length === 1 ? 'pessoa' : 'pessoas'} para corrigir`}
          sub={`${time} · ${dataLonga(geradaEm)}`}
          chips={[
            ...categorias.map((c) => ({ texto: c.rotulo, cor: C.white, fundo: c.cor })),
            ...(responsavel ? [{ texto: `Cadastrados por ${responsavel}`, cor: C.navy, fundo: C.bg }] : []),
          ]}
        />

        {pessoas.length === 0 ? (
          <Text style={{ fontSize: 9, color: C.faint }}>Ninguém nesse filtro.</Text>
        ) : (
          <>
            <LinhaDeKpis>
              <Kpi valor={num(pessoas.length)} rotulo="pessoas para corrigir" tom={C.danger} />
              <Kpi valor={num(grupos.length)} rotulo={grupos.length === 1 ? 'responsável envolvido' : 'responsáveis envolvidos'} />
              <Kpi
                valor={`${pct(top3, pessoas.length)}%`}
                rotulo={grupos.length > 3 ? 'nos 3 responsáveis com mais pendências' : 'da lista com quem mais tem'}
                nota={barras[0] ? `${barras[0].responsavel}: ${num(barras[0].total)}` : undefined}
                tom={C.gold}
              />
            </LinhaDeKpis>

            <Text style={st.h3}>Por liderança</Text>
            <GraficoPorLideranca barras={barras} categorias={categorias} totalDaLista={pessoas.length} />

            <Text style={[st.h3, { marginTop: 18 }]}>Lista por quem cadastrou</Text>
            {variosFiltros ? (
              <Text style={{ fontSize: 7.4, color: C.muted, marginBottom: 2 }}>
                Os quadradinhos ao lado do nome mostram em quais filtros a pessoa caiu, nas cores da legenda.
              </Text>
            ) : null}
            {grupos.map((grupo) => (
              <BlocoDoGrupo key={grupo.responsavel} linhas={grupo.itens.length}>
                <FaixaDoResponsavel
                  responsavel={grupo.responsavel}
                  quantidade={grupo.itens.length}
                  totalDaLista={pessoas.length}
                  base={basePorResponsavel[grupo.responsavel] ?? null}
                />
                <Tabela<PessoaDaLista>
                  linhas={grupo.itens}
                  chave={(p, i) => `${grupo.responsavel}-${i}`}
                  colunas={[
                    { titulo: '#', largura: '6%', celula: (_, i) => String(i + 1) },
                    {
                      titulo: 'Pessoa',
                      largura: '36%',
                      celula: (p) => (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text>{s(p.nome)}</Text>
                          {variosFiltros ? <Marcadores indices={p.filtros} categorias={categorias} /> : null}
                        </View>
                      ),
                    },
                    { titulo: 'Telefone', largura: '20%', celula: (p) => telefone(p.telefone) },
                    { titulo: 'Bairro', largura: '24%', celula: (p) => p.bairro || '—' },
                    { titulo: 'Cadastro', largura: '14%', alinhar: 'right', celula: (p) => data(p.cadastradoEm) },
                  ]}
                />
              </BlocoDoGrupo>
            ))}
          </>
        )}
      </Page>
    </Document>
  );
}

export async function gerarPdfDaLista(props: ListaFiltradaProps): Promise<Blob> {
  return pdf(<ListaFiltrada {...props} />).toBlob();
}

/* -------------------------------------------------------------------------
   Relatorio do quadro inteiro
   ------------------------------------------------------------------------- */

export interface RegistroParaPdf {
  nome: string;
  telefone: string;
  cadastradoPor: string;
  cadastradoEm: string;
  primeiro: boolean;
}

export interface GrupoParaPdf {
  nome: string;
  certeza: string;
  /** "certa", "provavel" ou "possivel": pinta o grupo. */
  nivel: 'certa' | 'provavel' | 'possivel';
  evidencias: string[];
  divergencias: string[];
  responsaveis: string[];
  registros: RegistroParaPdf[];
}

export interface SecaoParaPdf {
  titulo: string;
  explicacao: string;
  gravidade: 'alta' | 'media' | 'baixa';
  pessoas: { nome: string; telefone: string; detalhe: string; cadastradoPor: string }[];
}

export interface RelatorioDeInconsistenciasProps {
  time: string;
  responsavel: string | null;
  geradoEm: string;
  total: number;
  pessoasComProblema: number;
  saude: number;
  repetidos: GrupoParaPdf[];
  secoes: SecaoParaPdf[];
  basePorResponsavel?: Record<string, number>;
}

const TOM_CERTEZA = {
  certa: { cor: C.danger, fundo: C.dangerSoft },
  provavel: { cor: C.warning, fundo: C.warningSoft },
  possivel: { cor: C.muted, fundo: C.bg },
};

export function RelatorioDeInconsistencias(props: RelatorioDeInconsistenciasProps) {
  const { time, responsavel, geradoEm, total, pessoasComProblema, saude, repetidos, secoes, basePorResponsavel = {} } = props;
  const certos = repetidos.filter((g) => g.nivel !== 'possivel');
  const sobrando = certos.reduce((soma, g) => soma + g.registros.length - 1, 0);
  const pendencias = secoes.reduce((soma, sec) => soma + sec.pessoas.length, 0);

  // O grafico por lideranca: cada PESSOA uma vez, com todas as categorias
  // em que caiu — repetidos primeiro, depois cada secao.
  const categorias: CategoriaDoGrafico[] = [
    ...(repetidos.length ? [{ rotulo: 'Cadastrados mais de uma vez', cor: CORES_DE_CATEGORIA[0] }] : []),
    ...secoes.map((sec, i) => ({ rotulo: sec.titulo, cor: CORES_DE_CATEGORIA[(i + 1) % CORES_DE_CATEGORIA.length] })),
  ];
  const deslocamento = repetidos.length ? 1 : 0;
  const porPessoa = new Map<string, { nome: string; cadastradoPor: string; categorias: Set<number> }>();
  const marcar = (nome: string, tel: string, cadastradoPor: string, categoria: number) => {
    const chave = `${nome}|${tel}|${cadastradoPor}`;
    const atual = porPessoa.get(chave) ?? { nome, cadastradoPor, categorias: new Set<number>() };
    atual.categorias.add(categoria);
    porPessoa.set(chave, atual);
  };
  for (const g of repetidos) for (const r of g.registros) if (!r.primeiro) marcar(r.nome, r.telefone, r.cadastradoPor, 0);
  secoes.forEach((sec, i) => sec.pessoas.forEach((p) => marcar(p.nome, p.telefone, p.cadastradoPor, i + deslocamento)));
  const pessoasDoGrafico = [...porPessoa.values()];
  const barras = barrasPorResponsavel(pessoasDoGrafico, categorias.length, (p) => [...p.categorias], basePorResponsavel);

  return (
    <Document title={s(`Inconsistências — ${time}`)} author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda={`Inconsistências · ${time}`} direita={appConfig.shortName} />
        <Rodape texto={AVISO} />

        <Titulo
          titulo="Relatório de inconsistências"
          sub={`${time} · ${dataLonga(geradoEm)}`}
          chips={responsavel ? [{ texto: `Cadastrados por ${responsavel}`, cor: C.navy, fundo: C.bg }] : []}
        />

        <LinhaDeKpis>
          <Kpi valor={`${saude}%`} rotulo="da base em ordem" tom={saude >= 90 ? C.success : saude >= 70 ? C.warning : C.danger} />
          <Kpi valor={num(pessoasComProblema)} rotulo="pessoas com pendência" nota={`de ${num(total)} no time`} />
          <Kpi valor={num(sobrando)} rotulo="cadastros repetidos sobrando" tom={C.danger} />
          <Kpi valor={num(pendencias)} rotulo="pendências nas fichas" tom={C.warning} />
        </LinhaDeKpis>

        {/* Resumo: uma linha por tipo, antes dos nomes. */}
        <Text style={st.h3}>Resumo</Text>
        <Tabela
          linhas={[
            ...(repetidos.length
              ? [{ titulo: 'Cadastrados mais de uma vez', gravidade: 'alta' as const, quantidade: repetidos.length }]
              : []),
            ...secoes.map((sec) => ({ titulo: sec.titulo, gravidade: sec.gravidade, quantidade: sec.pessoas.length })),
          ]}
          chave={(l) => l.titulo}
          vazio="Nenhuma inconsistência."
          colunas={[
            { titulo: 'Pendência', largura: '62%', celula: (l) => l.titulo },
            {
              titulo: 'Gravidade',
              largura: '20%',
              celula: (l) => <Chip texto={TOM_GRAVIDADE[l.gravidade].rotulo} cor={TOM_GRAVIDADE[l.gravidade].cor} fundo={TOM_GRAVIDADE[l.gravidade].fundo} />,
            },
            { titulo: 'Quantidade', largura: '18%', alinhar: 'right', celula: (l) => num(l.quantidade) },
          ]}
        />

        {barras.length ? (
          <View>
            <Text style={st.h3}>Pendências por liderança</Text>
            <Text style={{ fontSize: 7.4, color: C.muted, marginBottom: 6 }}>
              Cada pessoa conta uma vez por tipo de pendência. Nos repetidos, conta a cópia — o primeiro cadastro fica.
            </Text>
            <GraficoPorLideranca barras={barras} categorias={categorias} totalDaLista={pessoasDoGrafico.length} />
          </View>
        ) : null}

        {repetidos.length ? (
          <View>
            <Text style={st.h3}>{s(`Cadastrados mais de uma vez (${num(repetidos.length)})`)}</Text>
            {repetidos.map((g, gi) => {
              const tom = TOM_CERTEZA[g.nivel];
              return (
                <View key={`${g.nome}-${gi}`} style={{ marginBottom: 6, borderWidth: 0.6, borderColor: C.line }} wrap={false}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 6, backgroundColor: C.bg }}>
                    <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9, flex: 1 }}>{s(g.nome)}</Text>
                    <Chip texto={g.certeza} cor={tom.cor} fundo={tom.fundo} />
                  </View>
                  <Text style={{ fontSize: 7.4, color: C.muted, paddingHorizontal: 6, paddingTop: 3 }}>
                    {s(`Por quê: ${g.evidencias.join(', ')}${g.divergencias.length ? ` · discordam em ${g.divergencias.join(', ')}` : ''}`)}
                  </Text>
                  {g.registros.map((r, ri) => (
                    <View key={ri} style={{ flexDirection: 'row', paddingHorizontal: 6, paddingVertical: 2.5, fontSize: 7.8 }}>
                      <Text style={{ width: '14%', color: r.primeiro ? C.success : C.danger, fontFamily: 'Helvetica-Bold' }}>
                        {r.primeiro ? '1º cadastro' : `${ri + 1}º cadastro`}
                      </Text>
                      <Text style={{ width: '27%' }}>{s(r.nome)}</Text>
                      <Text style={{ width: '17%', color: C.muted }}>{s(telefone(r.telefone))}</Text>
                      <Text style={{ width: '30%', color: C.muted }}>{s(`por ${r.cadastradoPor}`)}</Text>
                      <Text style={{ width: '12%', textAlign: 'right', color: C.muted }}>{data(r.cadastradoEm)}</Text>
                    </View>
                  ))}
                  {g.responsaveis.length > 1 ? (
                    <Text style={{ fontSize: 7.4, color: C.warning, paddingHorizontal: 6, paddingBottom: 4 }}>
                      {s(`Conta para ${g.responsaveis.length} responsáveis no ranking: ${g.responsaveis.join(' e ')}.`)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {secoes.map((sec) => {
          const tom = TOM_GRAVIDADE[sec.gravidade];
          return (
            <View key={sec.titulo}>
              {agruparPorResponsavel(sec.pessoas).map((grupo, gi) => (
                <BlocoDoGrupo key={grupo.responsavel} linhas={grupo.itens.length}>
                  {gi === 0 ? (
                    // Titulo e explicacao no bloco do primeiro grupo: nunca
                    // um titulo sozinho no pe da pagina.
                    <View style={{ marginTop: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                        <Text style={[st.h3, { marginTop: 0, marginBottom: 0, marginRight: 6 }]}>{s(`${sec.titulo} (${num(sec.pessoas.length)})`)}</Text>
                        <Chip texto={tom.rotulo} cor={tom.cor} fundo={tom.fundo} />
                      </View>
                      <Text style={{ fontSize: 7.8, color: C.muted, marginBottom: 2 }}>{s(sec.explicacao)}</Text>
                    </View>
                  ) : null}
                  <FaixaDoResponsavel
                    responsavel={grupo.responsavel}
                    quantidade={grupo.itens.length}
                    totalDaLista={sec.pessoas.length}
                    base={basePorResponsavel[grupo.responsavel] ?? null}
                  />
                  <Tabela
                    linhas={grupo.itens}
                    chave={(p, i) => `${sec.titulo}-${grupo.responsavel}-${i}`}
                    colunas={[
                      { titulo: '#', largura: '6%', celula: (_, i) => String(i + 1) },
                      { titulo: 'Pessoa', largura: '38%', celula: (p) => p.nome },
                      { titulo: 'Telefone', largura: '22%', celula: (p) => telefone(p.telefone) },
                      { titulo: 'Detalhe', largura: '34%', celula: (p) => <Text style={{ color: tom.cor }}>{s(p.detalhe)}</Text> },
                    ]}
                  />
                </BlocoDoGrupo>
              ))}
            </View>
          );
        })}

      </Page>
    </Document>
  );
}

export async function gerarPdfDasInconsistencias(props: RelatorioDeInconsistenciasProps): Promise<Blob> {
  return pdf(<RelatorioDeInconsistencias {...props} />).toBlob();
}
