import { Document, Page, Text, View, pdf } from "@react-pdf/renderer";
import type {
  GrupoDeReferencia,
  LiderComReferencia,
} from "@/lib/domain/lideres-por-referencia";
import { C, Cabecalho, Rodape, dataLonga, num, s, st } from "./pdf-base";
import { semHifen } from "./ConfrontoPdf";

/**
 * "Líderes por referência" em PDF: duas colunas — o Lider e a referencia
 * dele —, em ordem alfabetica, so com as referencias que a pessoa escolheu.
 *
 * Duas formas de sair: uma lista unica (de A a Z pelo nome) ou um bloco por
 * referencia (as referencias de A a Z, e os Lideres de cada uma de A a Z).
 */

const AVISO =
  "Documento reservado · contém dados pessoais (LGPD). Não compartilhe fora da coordenação.";

export type FormaDoPdfDeLideres = "lista" | "grupos";

export interface PdfDeLideresProps {
  lideres: LiderComReferencia[];
  grupos: GrupoDeReferencia[];
  /** As referencias escolhidas, na ordem do seletor. */
  referencias: { rotulo: string; quantidade: number }[];
  forma: FormaDoPdfDeLideres;
  geradoEm: string;
}

const LARGURA = { numero: "9%", lider: "53%", referencia: "38%" } as const;

/** `fixo`: repete no alto de cada pagina por onde a tabela passa (lista unica). */
function CabecalhoDaTabela({ fixo = false }: { fixo?: boolean }) {
  return (
    <View style={[st.tabelaCab, { paddingVertical: 6 }]} fixed={fixo}>
      <Text style={{ width: LARGURA.numero }}>{s("Nº")}</Text>
      <Text style={{ width: LARGURA.lider }}>{s("LÍDER")}</Text>
      <Text style={{ width: LARGURA.referencia }}>{s("REFERÊNCIA")}</Text>
    </View>
  );
}

function Linha({
  lider,
  numero,
  par,
}: {
  lider: LiderComReferencia;
  numero: number;
  par: boolean;
}) {
  return (
    <View
      style={[
        st.tabelaLinha,
        { paddingVertical: 5.5 },
        par ? { backgroundColor: "#f7f9fb" } : {},
      ]}
      wrap={false}
    >
      <View style={{ width: LARGURA.numero }}>
        <Text
          style={{
            fontSize: 7,
            fontFamily: "Helvetica-Bold",
            color: C.gold,
            backgroundColor: C.goldSoft,
            borderRadius: 6,
            paddingVertical: 1.5,
            paddingHorizontal: 4,
            alignSelf: "flex-start",
          }}
        >
          {num(numero)}
        </Text>
      </View>
      <View style={{ width: LARGURA.lider, paddingRight: 8 }}>
        <Text
          hyphenationCallback={semHifen}
          style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: C.ink }}
        >
          {s(lider.nome)}
        </Text>
      </View>
      <View
        style={{
          width: LARGURA.referencia,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: lider.referencia ? C.gold : C.line,
            marginRight: 5,
          }}
        />
        <Text
          hyphenationCallback={semHifen}
          style={{
            fontSize: 8.6,
            color: lider.referencia ? C.ink2 : C.faint,
            flex: 1,
          }}
        >
          {s(lider.referencia ?? "Sem referência")}
        </Text>
      </View>
    </View>
  );
}

function Abertura({
  lideres,
  referencias,
  geradoEm,
}: Pick<PdfDeLideresProps, "lideres" | "referencias" | "geradoEm">) {
  return (
    <View
      style={{
        backgroundColor: C.navy,
        borderRadius: 6,
        padding: 18,
        marginBottom: 16,
      }}
      wrap={false}
    >
      <Text style={[st.kicker, { color: C.gold }]}>
        {s("LÍDERES POR REFERÊNCIA")}
      </Text>
      <Text
        style={{
          fontSize: 22,
          fontFamily: "Helvetica-Bold",
          color: C.white,
          marginTop: 4,
          lineHeight: 1.15,
        }}
      >
        {s("Quem é o Líder e qual a referência")}
      </Text>
      <Text style={{ fontSize: 8.6, color: C.navy3, marginTop: 4 }}>
        {s(`Em ordem alfabética · gerado em ${dataLonga(geradoEm)}`)}
      </Text>
      <View
        style={{ width: 42, height: 2, backgroundColor: C.gold, marginTop: 10 }}
      />

      <View style={{ flexDirection: "row", marginTop: 12 }}>
        <View style={{ marginRight: 26 }}>
          <Text
            style={{
              fontSize: 24,
              fontFamily: "Helvetica-Bold",
              color: C.white,
            }}
          >
            {num(lideres.length)}
          </Text>
          <Text style={{ fontSize: 7, color: C.navy3, letterSpacing: 1 }}>
            {s(lideres.length === 1 ? "LÍDER" : "LÍDERES")}
          </Text>
        </View>
        <View>
          <Text
            style={{
              fontSize: 24,
              fontFamily: "Helvetica-Bold",
              color: "#e0b94a",
            }}
          >
            {num(referencias.length)}
          </Text>
          <Text style={{ fontSize: 7, color: C.navy3, letterSpacing: 1 }}>
            {s(referencias.length === 1 ? "REFERÊNCIA" : "REFERÊNCIAS")}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12 }}>
        {referencias.map((r) => (
          <View
            key={r.rotulo}
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 0.6,
              borderColor: "#2c4670",
              borderRadius: 8,
              paddingVertical: 2.5,
              paddingHorizontal: 6,
              marginRight: 4,
              marginBottom: 4,
            }}
          >
            <Text
              style={{
                fontSize: 7,
                color: C.white,
                fontFamily: "Helvetica-Bold",
              }}
            >
              {s(r.rotulo)}
            </Text>
            <Text
              style={{
                fontSize: 6.6,
                color: "#e0b94a",
                marginLeft: 4,
                fontFamily: "Helvetica-Bold",
              }}
            >
              {num(r.quantidade)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function PdfDeLideres({
  lideres,
  grupos,
  referencias,
  forma,
  geradoEm,
}: PdfDeLideresProps) {
  return (
    <Document title="Líderes por referência" author="CMD">
      <Page size="A4" style={st.page}>
        <Cabecalho
          esquerda="Líderes por referência"
          direita={dataLonga(geradoEm)}
        />
        <Abertura
          lideres={lideres}
          referencias={referencias}
          geradoEm={geradoEm}
        />

        {lideres.length === 0 ? (
          <Text style={{ fontSize: 9, color: C.faint }}>
            {s("Nenhum Líder nas referências escolhidas.")}
          </Text>
        ) : forma === "lista" ? (
          <View>
            <CabecalhoDaTabela fixo />
            {lideres.map((l, i) => (
              <Linha key={l.id} lider={l} numero={i + 1} par={i % 2 === 1} />
            ))}
          </View>
        ) : (
          grupos.map((g, k) => (
            <View key={g.chave} style={{ marginTop: k ? 14 : 0 }}>
              {/* A faixa, o cabecalho e as primeiras linhas andam juntos: a
                  referencia nunca fica sozinha no pe da pagina. Nas paginas
                  seguintes, a coluna "Referência" diz de quem e cada linha. */}
              <View wrap={false}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: C.navySoft,
                    paddingVertical: 6,
                    paddingRight: 8,
                    marginBottom: 2,
                  }}
                >
                  <View
                    style={{
                      width: 3,
                      height: 18,
                      backgroundColor: C.gold,
                      marginRight: 8,
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 6.4,
                        color: C.faint,
                        letterSpacing: 1,
                      }}
                    >
                      {s("REFERÊNCIA")}
                    </Text>
                    <Text
                      hyphenationCallback={semHifen}
                      style={{
                        fontSize: 11,
                        fontFamily: "Helvetica-Bold",
                        color: C.navy,
                      }}
                    >
                      {s(g.rotulo)}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 8,
                      fontFamily: "Helvetica-Bold",
                      color: C.ink2,
                    }}
                  >
                    {s(
                      g.lideres.length === 1
                        ? "1 líder"
                        : `${num(g.lideres.length)} líderes`,
                    )}
                  </Text>
                </View>
                <CabecalhoDaTabela />
                {g.lideres.slice(0, 3).map((l, i) => (
                  <Linha
                    key={l.id}
                    lider={l}
                    numero={i + 1}
                    par={i % 2 === 1}
                  />
                ))}
              </View>
              {g.lideres.slice(3).map((l, i) => (
                <Linha
                  key={l.id}
                  lider={l}
                  numero={i + 4}
                  par={(i + 3) % 2 === 1}
                />
              ))}
            </View>
          ))
        )}

        <Rodape texto={AVISO} />
      </Page>
    </Document>
  );
}

export async function gerarPdfDeLideres(
  props: PdfDeLideresProps,
): Promise<Blob> {
  return pdf(<PdfDeLideres {...props} />).toBlob();
}
