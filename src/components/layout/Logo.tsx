/* eslint-disable @next/next/no-img-element */
import { appConfig } from '@/config/app.config';
import { cn } from '@/lib/utils/cn';
import { BrandMark } from './BrandMark';

interface LogoProps {
  className?: string;
  /** Mostra o nome ao lado da marca. */
  withName?: boolean;
  size?: 'sm' | 'md';
}

/** So o selo: a marca vetorial, o arquivo de imagem ou a sigla. */
export function LogoMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  if (appConfig.logo.kind === 'mark') {
    return <BrandMark className={className} animated={animated} title={appConfig.name} />;
  }
  if (appConfig.logo.kind === 'image') {
    return (
      <img src={appConfig.logo.src} alt={appConfig.name} className={cn(className, 'rounded-control object-contain')} />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        className,
        'flex shrink-0 items-center justify-center rounded-control bg-brand-700 text-xs font-semibold tracking-tight text-white',
      )}
    >
      {appConfig.logo.monogram}
    </span>
  );
}

/** Marca do sistema. Nome e logotipo vem de `src/config/app.config.ts`. */
export function Logo({ className, withName = true, size = 'md' }: LogoProps) {
  const box = size === 'sm' ? 'size-8' : 'size-9';
  // Espaco compacto usa a sigla; o nome completo fica nos titulos principais.
  const displayName = size === 'sm' ? appConfig.shortName : appConfig.name;

  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <LogoMark className={box} />

      {withName ? (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink-900">
            {displayName}
          </span>
          <span className="block truncate text-xs text-ink-500">{appConfig.tagline}</span>
        </span>
      ) : null}
    </span>
  );
}
