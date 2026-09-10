/* eslint-disable @next/next/no-img-element */
import { appConfig } from '@/config/app.config';
import { cn } from '@/lib/utils/cn';

interface LogoProps {
  className?: string;
  /** Mostra o nome ao lado da marca. */
  withName?: boolean;
  size?: 'sm' | 'md';
}

/** Marca do sistema. Nome e logotipo vem de `src/config/app.config.ts`. */
export function Logo({ className, withName = true, size = 'md' }: LogoProps) {
  const box = size === 'sm' ? 'size-8 text-[0.625rem]' : 'size-9 text-xs';
  // Espaco compacto usa a sigla; o nome completo fica nos titulos principais.
  const displayName = size === 'sm' ? appConfig.shortName : appConfig.name;

  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      {appConfig.logo.kind === 'image' ? (
        <img
          src={appConfig.logo.src}
          alt={appConfig.name}
          className={cn(box, 'rounded-control object-contain')}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            box,
            'flex shrink-0 items-center justify-center rounded-control bg-brand-700 font-semibold tracking-tight text-white',
          )}
        >
          {appConfig.logo.monogram}
        </span>
      )}

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
