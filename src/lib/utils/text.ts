import { appConfig } from '@/config/app.config';

/** Remove acentos e normaliza para comparacao de busca. */
export function normalizeSearch(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Verifica se o termo aparece em qualquer um dos campos informados. */
export function matchesSearch(term: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = normalizeSearch(term);
  if (!needle) return true;
  return fields.some((field) => normalizeSearch(field ?? '').includes(needle));
}

/** Iniciais para avatares sem foto. */
export function initials(name: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}


const numberFormatter = new Intl.NumberFormat(appConfig.locale);

/** Numero com separador de milhar do idioma configurado. */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}
