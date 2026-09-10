/* eslint-disable @next/next/no-img-element */
import { cn } from '@/lib/utils/cn';
import { initials } from '@/lib/utils/text';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<Size, string> = {
  sm: 'size-9 text-xs',
  md: 'size-11 text-sm',
  lg: 'size-14 text-base',
  xl: 'size-20 text-xl',
};

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: Size;
  className?: string;
}

/**
 * As fotos chegam como URL assinada de um bucket privado, por isso usamos
 * `img` puro: o otimizador de imagens do Next nao processa data URL.
 */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const base = cn(
    'shrink-0 overflow-hidden rounded-full border border-line bg-ink-100',
    SIZES[size],
    className,
  );

  if (src) {
    return <img src={src} alt={`Foto de ${name}`} className={cn(base, 'object-cover')} />;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(base, 'flex items-center justify-center font-semibold text-ink-500')}
    >
      {initials(name)}
    </span>
  );
}
