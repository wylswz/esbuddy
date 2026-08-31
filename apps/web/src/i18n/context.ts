import { createContext, useContext } from 'react';
import type { Translation } from './translations';

export type Locale = 'en' | 'zh';

export type Path<T> = T extends object
  ? { [K in keyof T & string]: K | `${K}.${Path<T[K]>}` }[keyof T & string]
  : never;

export type TranslationKey = Path<Translation>;

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string>) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}
