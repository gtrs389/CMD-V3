import { Image, Text, View } from '@react-pdf/renderer';
import { C, s } from './pdf-base';

const iniciais = (nome: string) => {
  const partes = nome.trim().split(/\s+/).filter((p) => p.length > 2);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
};

/**
 * Foto oficial do candidato no PDF, redonda, com anel na cor dele. A foto
 * chega pronta (data URL, buscada antes de montar o arquivo); sem ela, as
 * iniciais — o PDF nunca sai com um buraco.
 */
export function FotoNoPdf({ src, nome, tamanho = 44, anel }: { src?: string | null; nome: string; tamanho?: number; anel?: string }) {
  const borda = anel ? 2 : 0;
  return (
    <View
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: tamanho / 2,
        borderWidth: borda,
        borderColor: anel ?? C.white,
        backgroundColor: C.navy2,
        overflow: 'hidden',
        justifyContent: src ? 'flex-start' : 'center',
        alignItems: 'center',
      }}
    >
      {src ? (
        // A foto do TSE e em pe (3x4): cobre o circulo a partir do topo, onde esta o rosto.
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image
          src={src}
          style={{ width: tamanho - borda * 2, height: (tamanho - borda * 2) * 1.33, objectFit: 'cover' }}
        />
      ) : (
        <Text style={{ fontSize: tamanho * 0.34, fontFamily: 'Helvetica-Bold', color: C.white }}>{s(iniciais(nome))}</Text>
      )}
    </View>
  );
}
