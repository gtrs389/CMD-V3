import { Document, Page, Text, View, pdf } from '@react-pdf/renderer';
import { appConfig } from '@/config/app.config';
import { agruparPorResponsavel, agruparPorTelefone, barrasPorResponsavel } from '@/lib/domain/por-responsavel';
import {
  C,
  CORES_DE_CATEGORIA,
  Cabecalho,
  Chip,
  BlocoDoGrupo,
  CartaoRepetido,
  FaixaDeGrupo,
  FaixaDoResponsavel,
  GraficoPorLideranca,
  Kpi,
  LinhaDeKpis,
  Rodape,
  TOM_GRAVIDADE,
  Tabela,
  data,
  dataLonga,
  num,
  s,
  st,
  telefone,
  type CategoriaDoGrafico,
  type GrupoRepetidoPdf,
} from './pdf-base';

/**
 * Os PDFs do quadro de inconsistencias.
 *
 *   `ListaFiltrada`             os filtros marcados, cada um na sua
 *                               estrutura (por quem cadastrou, por numero,
 *                               ou o cartao dos repetidos), num PDF so;
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
  /** Identifica a pessoa entre as secoes (a mesma pode cair em varios filtros). */
  id: string;
  nome: string;
  telefone: string;
  bairro: string;
  cadastradoPor: string;
  cadastradoEm: string;
  /** O nome do problema NESTE filtro: "Número compartilhado", "Título incompleto"... */
  problema: string;
}

/**
 * Uma secao por filtro marcado, cada uma na estrutura que faz sentido para
 * ele:
 *
 *   `pessoas`   quem caiu no filtro, agrupado por quem cadastrou;
 *   `telefones` "Telefone compartilhado": organizado por NUMERO;
 *   `repetidos` "Cadastrado mais de uma vez": o cartao de cada pessoa,
 *               como na tela.
 */
export type SecaoDoFiltro =
  | { tipo: 'pessoas'; rotulo: string; pessoas: PessoaDaLista[] }
  | { tipo: 'telefones'; rotulo: string; pessoas: PessoaDaLista[] }
  | { tipo: 'repetidos'; rotulo: string; grupos: GrupoRepetidoPdf[] };

export interface ListaFiltradaProps {
  time: string;
  responsavel: string | null;
  geradaEm: string;
  secoes: SecaoDoFiltro[];
  /** Tamanho da base de cada responsavel (pelo texto de "cadastrado por"). */
  basePorResponsavel?: Record<string, number>;
}

type Chip3 = { texto: string; cor: string; fundo: string };

function Titulo({ kicker = 'PENDÊNCIAS DE INTEGRIDADE', titulo, sub, chips }: { kicker?: string; titulo: string; sub: string; chips: Chip3[] }) {
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

const corDaSecao = (i: number) => CORES_DE_CATEGORIA[i % CORES_DE_CATEGORIA.length];

/** Quem a secao aponta, contado por quem cadastrou (nos repetidos, as copias). */
function itensDaSecao(secao: SecaoDoFiltro): { id: string; cadastradoPor: string }[] {
  if (secao.tipo === 'repetidos') {
    return secao.grupos.flatMap((g) => g.registros.filter((r) => !r.primeiro).map((r) => ({ id: r.id, cadastradoPor: r.cadastradoPor })));
  }
  return secao.pessoas;
}

/** Repetidos contam CADASTROS (as fichas, originais e copias), como o filtro na tela. */
function quantosNaSecao(secao: SecaoDoFiltro): number {
  return secao.tipo === 'repetidos'
    ? secao.grupos.reduce((soma, g) => soma + g.registros.length, 0)
    : secao.pessoas.length;
}

/* --- as tres estruturas ------------------------------------------------ */

/** Quem caiu no filtro, agrupado por quem cadastrou. */
function SecaoDePessoas({ pessoas, cor, base }: { pessoas: PessoaDaLista[]; cor: string; base: Record<string, number> }) {
  const barras = barrasPorResponsavel(pessoas, 1, () => [0], base);
  return (
    <>
      <Text style={st.h3}>Por liderança</Text>
      <GraficoPorLideranca barras={barras} categorias={[{ rotulo: 'pessoas', cor }]} totalDaLista={pessoas.length} />

      <Text style={[st.h3, { marginTop: 18 }]}>Por quem cadastrou</Text>
      {agruparPorResponsavel(pessoas).map((grupo) => (
        <BlocoDoGrupo key={grupo.responsavel} linhas={grupo.itens.length}>
          <FaixaDoResponsavel
            responsavel={grupo.responsavel}
            quantidade={grupo.itens.length}
            totalDaLista={pessoas.length}
            base={base[grupo.responsavel] ?? null}
          />
          <Tabela<PessoaDaLista>
            linhas={grupo.itens}
            chave={(p) => p.id}
            colunas={[
              { titulo: '#', largura: '6%', celula: (_, i) => String(i + 1) },
              { titulo: 'Pessoa', largura: '28%', celula: (p) => p.nome },
              { titulo: 'Telefone', largura: '17%', celula: (p) => telefone(p.telefone) },
              { titulo: 'Bairro', largura: '16%', celula: (p) => p.bairro || '—' },
              { titulo: 'Problema', largura: '21%', celula: (p) => <Text style={{ color: C.danger }}>{s(p.problema)}</Text> },
              { titulo: 'Cadastro', largura: '12%', alinhar: 'right', celula: (p) => data(p.cadastradoEm) },
            ]}
          />
        </BlocoDoGrupo>
      ))}
    </>
  );
}

/** "Telefone compartilhado": quantos numeros, por lideranca, e cada numero com as suas fichas. */
function SecaoDeTelefones({ pessoas, cor, base }: { pessoas: PessoaDaLista[]; cor: string; base: Record<string, number> }) {
  const grupos = agruparPorTelefone(pessoas);
  const barras = barrasPorResponsavel(pessoas, 1, () => [0], base);
  const maior = grupos[0];
  return (
    <>
      <LinhaDeKpis>
        <Kpi valor={num(grupos.length)} rotulo="números compartilhados" tom={cor} />
        <Kpi valor={num(pessoas.length)} rotulo="fichas envolvidas" />
        <Kpi valor={num(maior?.itens.length ?? 0)} rotulo="fichas no número mais usado" nota={maior ? telefone(maior.telefone) : undefined} tom={C.gold} />
        <Kpi valor={num(barras.length)} rotulo={barras.length === 1 ? 'responsável envolvido' : 'responsáveis envolvidos'} />
      </LinhaDeKpis>

      <Text style={st.h3}>Por liderança</Text>
      <GraficoPorLideranca barras={barras} categorias={[{ rotulo: 'fichas', cor }]} totalDaLista={pessoas.length} />

      <Text style={[st.h3, { marginTop: 18 }]}>Por número</Text>
      <Text style={{ fontSize: 7.4, color: C.muted, marginBottom: 2 }}>
        Cada número e as fichas que o usam. Pode ser família — ou o número de uma liderança digitado no lugar do da pessoa.
      </Text>
      {grupos.map((grupo) => {
        const responsaveis = [...new Set(grupo.itens.map((p) => p.cadastradoPor))];
        return (
          <BlocoDoGrupo key={grupo.telefone} linhas={grupo.itens.length}>
            <FaixaDeGrupo
              rotulo="Telefone"
              titulo={telefone(grupo.telefone)}
              direita={
                <>
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{`${num(grupo.itens.length)} fichas`}</Text>
                  <Text style={{ color: C.faint }}>
                    {s(responsaveis.length > 1 ? ` · ${num(responsaveis.length)} responsáveis diferentes` : ` · ${responsaveis[0]}`)}
                  </Text>
                </>
              }
            />
            <Tabela<PessoaDaLista>
              linhas={grupo.itens}
              chave={(p) => `${grupo.telefone}-${p.id}`}
              colunas={[
                { titulo: '#', largura: '6%', celula: (_, i) => String(i + 1) },
                { titulo: 'Pessoa', largura: '28%', celula: (p) => p.nome },
                { titulo: 'Cadastrado por', largura: '34%', celula: (p) => p.cadastradoPor },
                { titulo: 'Problema', largura: '20%', celula: (p) => <Text style={{ color: C.danger }}>{s(p.problema)}</Text> },
                { titulo: 'Cadastro', largura: '12%', alinhar: 'right', celula: (p) => data(p.cadastradoEm) },
              ]}
            />
          </BlocoDoGrupo>
        );
      })}
    </>
  );
}

/** "Cadastrado mais de uma vez": o cartao da tela para cada pessoa. */
function SecaoDeRepetidos({ grupos, cor, base }: { grupos: GrupoRepetidoPdf[]; cor: string; base: Record<string, number> }) {
  const sobrando = grupos.reduce((soma, g) => soma + g.registros.length - 1, 0);
  const emDois = grupos.filter((g) => g.responsaveis.length > 1).length;
  const copias = grupos.flatMap((g) => g.registros.filter((r) => !r.primeiro));
  const barras = barrasPorResponsavel(copias, 1, () => [0], base);
  return (
    <>
      <LinhaDeKpis>
        <Kpi valor={num(sobrando + grupos.length)} rotulo="cadastros repetidos" nota="originais e cópias" tom={cor} />
        <Kpi valor={num(grupos.length)} rotulo={grupos.length === 1 ? 'pessoa' : 'pessoas'} nota="cada uma em mais de um cadastro" />
        <Kpi valor={num(sobrando)} rotulo="cópias sobrando" nota="a excluir" tom={C.warning} />
        <Kpi valor={num(emDois)} rotulo="contam para mais de um responsável" nota="inflam o ranking" tom={C.gold} />
      </LinhaDeKpis>

      <Text style={st.h3}>Por liderança</Text>
      <Text style={{ fontSize: 7.4, color: C.muted, marginBottom: 6 }}>As cópias (o 2º cadastro em diante), por quem as cadastrou.</Text>
      <GraficoPorLideranca barras={barras} categorias={[{ rotulo: 'cópias', cor }]} totalDaLista={copias.length} />

      <Text style={[st.h3, { marginTop: 18 }]}>Cadastrados mais de uma vez</Text>
      <Text style={{ fontSize: 7.8, color: C.muted, marginBottom: 8 }}>
        {s(
          `${num(sobrando + grupos.length)} cadastros de ${num(grupos.length)} ${grupos.length === 1 ? 'pessoa' : 'pessoas'}: o primeiro de cada uma costuma ser o original, e ${sobrando === 1 ? 'o outro é cópia' : `os outros ${num(sobrando)} são cópias`}.`,
        )}
      </Text>
      {grupos.map((g, i) => (
        <CartaoRepetido key={`${g.nome}-${i}`} grupo={g} />
      ))}
    </>
  );
}

function CorpoDaSecao({ secao, cor, base }: { secao: SecaoDoFiltro; cor: string; base: Record<string, number> }) {
  if (secao.tipo === 'repetidos') return <SecaoDeRepetidos grupos={secao.grupos} cor={cor} base={base} />;
  if (secao.tipo === 'telefones') return <SecaoDeTelefones pessoas={secao.pessoas} cor={cor} base={base} />;
  return <SecaoDePessoas pessoas={secao.pessoas} cor={cor} base={base} />;
}

function tituloDaSecao(secao: SecaoDoFiltro): string {
  const n = quantosNaSecao(secao);
  if (secao.tipo === 'repetidos') {
    const pessoas = secao.grupos.length;
    return `${num(n)} cadastros de ${num(pessoas)} ${pessoas === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'} mais de uma vez`;
  }
  if (secao.tipo === 'telefones') {
    const numeros = agruparPorTelefone(secao.pessoas).length;
    return `${num(numeros)} ${numeros === 1 ? 'número compartilhado' : 'números compartilhados'}`;
  }
  return `${secao.rotulo}: ${num(n)} ${n === 1 ? 'pessoa' : 'pessoas'}`;
}

/* --- o documento ------------------------------------------------------- */

/**
 * A lista dos filtros marcados, num PDF so.
 *
 * Um filtro: o documento e a secao dele, na estrutura dele. Varios: uma
 * abertura com o resumo (quantos em cada filtro e o grafico por lideranca
 * de todos juntos) e, depois, uma secao por filtro — cada uma na SUA
 * estrutura, comecando em pagina nova.
 */
export function ListaFiltrada({ time, responsavel, geradaEm, secoes, basePorResponsavel = {} }: ListaFiltradaProps) {
  const chipDoResponsavel: Chip3[] = responsavel ? [{ texto: `Cadastrados por ${responsavel}`, cor: C.navy, fundo: C.bg }] : [];
  const sub = `${time} · ${dataLonga(geradaEm)}`;
  const unica = secoes.length === 1 ? secoes[0] : null;

  // Varias secoes: cada pessoa conta uma vez por filtro em que caiu.
  const categorias: CategoriaDoGrafico[] = secoes.map((sec, i) => ({ rotulo: sec.rotulo, cor: corDaSecao(i) }));
  const porPessoa = new Map<string, { cadastradoPor: string; secoes: number[] }>();
  secoes.forEach((sec, i) =>
    itensDaSecao(sec).forEach((item) => {
      const atual = porPessoa.get(item.id) ?? { cadastradoPor: item.cadastradoPor, secoes: [] };
      if (!atual.secoes.includes(i)) atual.secoes.push(i);
      porPessoa.set(item.id, atual);
    }),
  );
  const todas = [...porPessoa.values()];
  const barras = barrasPorResponsavel(todas, secoes.length, (p) => p.secoes, basePorResponsavel);

  return (
    <Document title={s(`Dados para corrigir — ${time}`)} author={s(appConfig.name)} language="pt-BR">
      <Page size="A4" style={st.page}>
        <Cabecalho esquerda={`Dados para corrigir · ${time}`} direita={appConfig.shortName} />
        <Rodape texto={AVISO} />

        {secoes.length === 0 || todas.length === 0 ? (
          <>
            <Titulo titulo="Dados para corrigir" sub={sub} chips={chipDoResponsavel} />
            <Text style={{ fontSize: 9, color: C.faint }}>Ninguém nesse filtro.</Text>
          </>
        ) : unica ? (
          <>
            <Titulo
              titulo={tituloDaSecao(unica)}
              sub={sub}
              chips={[{ texto: unica.rotulo, cor: C.white, fundo: corDaSecao(0) }, ...chipDoResponsavel]}
            />
            <CorpoDaSecao secao={unica} cor={corDaSecao(0)} base={basePorResponsavel} />
          </>
        ) : (
          <>
            <Titulo
              titulo={`${num(todas.length)} ${todas.length === 1 ? 'pessoa para corrigir' : 'pessoas para corrigir'}`}
              sub={sub}
              chips={[...categorias.map((c) => ({ texto: c.rotulo, cor: C.white, fundo: c.cor })), ...chipDoResponsavel]}
            />
            <LinhaDeKpis>
              <Kpi valor={num(todas.length)} rotulo="pessoas para corrigir" tom={C.danger} />
              <Kpi valor={num(secoes.length)} rotulo="filtros neste documento" />
              <Kpi valor={num(barras.length)} rotulo={barras.length === 1 ? 'responsável envolvido' : 'responsáveis envolvidos'} tom={C.gold} />
            </LinhaDeKpis>

            <Text style={st.h3}>Neste documento</Text>
            <Tabela
              linhas={secoes.map((sec, i) => ({ sec, i }))}
              chave={(x) => x.sec.rotulo}
              colunas={[
                {
                  titulo: 'Filtro',
                  largura: '46%',
                  celula: (x) => (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: corDaSecao(x.i), marginRight: 5 }} />
                      <Text>{s(x.sec.rotulo)}</Text>
                    </View>
                  ),
                },
                { titulo: 'Como vem', largura: '32%', celula: (x) => (x.sec.tipo === 'repetidos' ? 'um cartão por pessoa' : x.sec.tipo === 'telefones' ? 'por número' : 'por quem cadastrou') },
                {
                  titulo: 'Quantos',
                  largura: '22%',
                  alinhar: 'right',
                  celula: (x) => {
                    const n = quantosNaSecao(x.sec);
                    const [um, varios] =
                      x.sec.tipo === 'telefones' ? ['ficha', 'fichas'] : x.sec.tipo === 'repetidos' ? ['cadastro', 'cadastros'] : ['pessoa', 'pessoas'];
                    return `${num(n)} ${n === 1 ? um : varios}`;
                  },
                },
              ]}
            />

            <Text style={st.h3}>Por liderança</Text>
            <Text style={{ fontSize: 7.4, color: C.muted, marginBottom: 6 }}>
              Cada pessoa conta uma vez por filtro em que caiu. Nos cadastrados mais de uma vez, contam as cópias.
            </Text>
            <GraficoPorLideranca barras={barras} categorias={categorias} totalDaLista={todas.length} />

            {secoes.map((sec, i) => (
              <View key={sec.rotulo} break>
                <Titulo kicker={`FILTRO ${i + 1} DE ${secoes.length}`} titulo={tituloDaSecao(sec)} sub={sec.rotulo} chips={[]} />
                <CorpoDaSecao secao={sec} cor={corDaSecao(i)} base={basePorResponsavel} />
              </View>
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

/** O grupo de repetidos no formato do cartao (ver `CartaoRepetido`). */
export type GrupoParaPdf = GrupoRepetidoPdf;

export interface SecaoParaPdf {
  titulo: string;
  explicacao: string;
  gravidade: 'alta' | 'media' | 'baixa';
  pessoas: { nome: string; telefone: string; detalhe: string; cadastradoPor: string; cadastradoEm?: string }[];
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
              ? [{ titulo: 'Cadastrados mais de uma vez', gravidade: 'alta' as const, quantidade: repetidos.reduce((soma, g) => soma + g.registros.length, 0) }]
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
            <Text style={st.h3}>{s(`Cadastrados mais de uma vez (${num(repetidos.reduce((soma, g) => soma + g.registros.length, 0))} cadastros de ${num(repetidos.length)} ${repetidos.length === 1 ? 'pessoa' : 'pessoas'})`)}</Text>
            {repetidos.map((g, gi) => (
              <CartaoRepetido key={`${g.nome}-${gi}`} grupo={g} />
            ))}
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
                      { titulo: 'Pessoa', largura: '32%', celula: (p) => p.nome },
                      { titulo: 'Telefone', largura: '18%', celula: (p) => telefone(p.telefone) },
                      { titulo: 'Problema', largura: '30%', celula: (p) => <Text style={{ color: tom.cor }}>{s(p.detalhe)}</Text> },
                      { titulo: 'Cadastro', largura: '14%', alinhar: 'right', celula: (p) => data(p.cadastradoEm) },
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
