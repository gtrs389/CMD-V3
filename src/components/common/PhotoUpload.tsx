'use client';

/* eslint-disable @next/next/no-img-element */
import { useId, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  ACCEPTED_IMAGE_ACCEPT_ATTR,
  ImageError,
  processImageFile,
} from '@/lib/utils/image';
import { initials } from '@/lib/utils/text';
import { Button } from '@/components/ui/Button';

interface PhotoUploadProps {
  value: string | null;
  onChange: (value: string | null) => void;
  /** Nome usado nas iniciais quando nao ha foto. */
  name?: string;
  shape?: 'circle' | 'square';
  size?: 'md' | 'lg';
  disabled?: boolean;
  /** Oferece atalho para a camera do aparelho (uso no formulario publico). */
  allowCamera?: boolean;
  /** Some com a dica de formato quando o campo ja traz texto de ajuda proprio. */
  showFormatHint?: boolean;
  onError?: (message: string) => void;
}

/**
 * Selecao de foto com previa, troca e remocao.
 * Valida tipo e tamanho e comprime a imagem antes de guardar.
 */
export function PhotoUpload({
  value,
  onChange,
  name = '',
  shape = 'circle',
  size = 'md',
  disabled = false,
  allowCamera = false,
  showFormatHint = true,
  onError,
}: PhotoUploadProps) {
  const inputId = useId();
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const boxSize = size === 'lg' ? 'size-28' : 'size-20';

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setLocalError(null);
    setProcessing(true);

    try {
      const processed = await processImageFile(file);
      onChange(processed.dataUrl);
    } catch (error) {
      const message =
        error instanceof ImageError
          ? error.message
          : 'Não foi possível processar a imagem. Tente outra foto.';
      setLocalError(message);
      onError?.(message);
    } finally {
      setProcessing(false);
      if (galleryRef.current) galleryRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div
        className={cn(
          'relative flex shrink-0 items-center justify-center overflow-hidden border border-line bg-ink-100',
          boxSize,
          shape === 'circle' ? 'rounded-full' : 'rounded-card',
        )}
      >
        {value ? (
          <img src={value} alt="Prévia da foto" className="size-full object-cover" />
        ) : (
          <span aria-hidden="true" className="text-lg font-semibold text-ink-400">
            {name ? initials(name) : <ImagePlus className="size-6" />}
          </span>
        )}

        {processing ? (
          <span className="absolute inset-0 flex items-center justify-center bg-ink-900/40">
            <Loader2 className="size-6 animate-spin text-white" />
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled || processing}
            onClick={() => galleryRef.current?.click()}
          >
            {value ? (
              <RefreshCw aria-hidden="true" className="size-4" />
            ) : (
              <ImagePlus aria-hidden="true" className="size-4" />
            )}
            {value ? 'Trocar' : 'Escolher imagem'}
          </Button>

          {allowCamera ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || processing}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera aria-hidden="true" className="size-4" />
              Câmera
            </Button>
          ) : null}

          {value ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || processing}
              onClick={() => {
                setLocalError(null);
                onChange(null);
              }}
              className="text-danger-600 hover:bg-danger-50"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Remover
            </Button>
          ) : null}
        </div>

        {showFormatHint ? (
          <p className="mt-2 text-xs text-ink-500">
            JPG, PNG ou WEBP. A imagem é reduzida automaticamente antes de ser salva.
          </p>
        ) : null}

        {localError ? (
          <p role="alert" className="mt-1 text-xs font-medium text-danger-600">
            {localError}
          </p>
        ) : null}
      </div>

      <input
        ref={galleryRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_IMAGE_ACCEPT_ATTR}
        className="sr-only"
        onChange={(event) => handleFile(event.target.files?.[0])}
      />

      {allowCamera ? (
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      ) : null}
    </div>
  );
}
