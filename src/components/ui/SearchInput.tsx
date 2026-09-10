'use client';

import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { CONTROL_CLASSES } from './Input';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
  id?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Pesquisar',
  label,
  className,
  id = 'busca',
}: SearchInputProps) {
  return (
    <div className={cn('relative flex w-full items-center', className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-ink-400" />
      <input
        id={id}
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(CONTROL_CLASSES, 'pr-11 pl-9 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpar pesquisa"
          className="tap absolute right-0 flex items-center justify-center rounded-control text-ink-400 transition-colors hover:text-ink-900"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
