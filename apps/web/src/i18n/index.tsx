import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { en, zh } from './translations';
import { I18nContext, type I18nContextValue, type Locale, type TranslationKey } from './context';

const DICTIONARIES: Record<Locale, typeof en> = { en, zh };
const STORAGE_KEY = 'esbuddy.locale';

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch {
    // ignore storage errors
  }
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function getByPath(obj: unknown, path: string): string {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
  return typeof value === 'string' ? value : '';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string>): string => {
      let value = getByPath(DICTIONARIES[locale], key);
      if (vars) {
        value = value.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? '');
      }
      return value;
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
