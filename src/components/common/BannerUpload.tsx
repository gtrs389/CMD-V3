'use client';

/* eslint-disable @next/next/no-img-element */
import { useRef } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { ACCEPTED_IMAGE_ACCEPT_ATTR, ImageError, readBannerFile } from '@/lib/utils/image';
import { Button } from '@/components/ui/Button';

interface BannerUploadProps {
  /** Data URL da imagem escolhida, ou nulo. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Nome do time, usado no texto alternativo da prévia. */
  teamName: string;
  onError?: (message: string) => void;
  /** Avisos que não são falha (ex.: a imagem precisou ser reduzida). */
  onNotice?: (message: string) => void;
  /**
   * `none` esconde a prévia própria: é o modo usado onde a tela já desenha o
   * banner de verdade, com a estampa por cima, e uma segunda prévia só
   * competiria com ela.
   */
  preview?: 'image' | 'none';
  /** Texto ao lado dos botões, dizendo qual banner está valendo. */
  hint?: string;
}

/**
 * Escolha do banner do celular.
 *
 * Diferente do `PhotoUpload` de propósito. Foto de perfil é retrato pequeno e
 * redondo, e passa por redimensionamento e recompressão. O banner é arte
 * chapada, larga, com letra fina — reduzir para 720 px e reencodar em JPEG
 * borraria o texto e transformaria um fundo transparente em preto. Aqui o
 * arquivo sobe como veio, e a prévia mostra a largura inteira.
 */
export function BannerUpload({
  value,
  onChange,
  teamName,
  onError,
  onNotice,
  preview = 'image',
  hint,
}: BannerUploadProps) {
  const arquivoRef = useRef<HTMLInputElement>(null);

  async function escolher(file: File | null) {
    if (!file) return;
    try {
      const { dataUrl, recomprimido } = await readBannerFile(file);
      onChange(dataUrl);
      if (recomprimido) {
        onNotice?.('A imagem era grande demais e foi reduzida para caber no limite.');
      }
    } catch (error) {
      onError?.(error instanceof ImageError ? error.message : 'Não foi possível ler a imagem.');
    } finally {
      // Escolher o MESMO arquivo de novo precisa disparar o evento outra vez.
      if (arquivoRef.current) arquivoRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      {preview === 'none' ? null : value ? (
        <img
          src={value}
          alt={`Banner de ${teamName}`}
          className="block w-full rounded-control border border-line object-contain"
        />
      ) : (
        <div className="flex min-h-24 items-center justify-center rounded-control border border-dashed border-line bg-ink-50 p-4 text-center text-xs text-ink-500">
          Nenhum banner escolhido.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={arquivoRef}
          type="file"
          accept={ACCEPTED_IMAGE_ACCEPT_ATTR}
          className="hidden"
          onChange={(event) => escolher(event.target.files?.[0] ?? null)}
        />
        <Button variant="secondary" onClick={() => arquivoRef.current?.click()}>
          <ImagePlus aria-hidden="true" className="size-4" />
          {value ? 'Trocar banner' : 'Enviar banner'}
        </Button>

        {value ? (
          <Button variant="ghost" onClick={() => onChange(null)}>
            <Trash2 aria-hidden="true" className="size-4" />
            Remover
          </Button>
        ) : null}

        {hint ? <span className="text-xs text-ink-500">{hint}</span> : null}
      </div>
    </div>
  );
}
