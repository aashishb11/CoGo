import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n, { type LanguageDetectorAsyncModule } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { ca } from './locales/ca';
import { en } from './locales/en';
import { es } from './locales/es';
import type { DeepKeys } from './parity';

import { LANG_STORAGE_KEY } from '@/shared/constants';

export const SUPPORTED_LANGS = ['es', 'en', 'ca'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];
export type TextKey = DeepKeys<typeof en>;

export function toLang(value: unknown): Lang | null {
  if (typeof value !== 'string') {
    return null;
  }
  return (SUPPORTED_LANGS as readonly string[]).includes(value) ? (value as Lang) : null;
}

// Skip storage during expo-router's static web render — Node has no window
// and AsyncStorage's web shim reaches for localStorage on init.
const isServer = typeof window === 'undefined';

const languageDetector: LanguageDetectorAsyncModule = {
  type: 'languageDetector',
  async: true,
  detect: async () => {
    if (!isServer) {
      const stored = await AsyncStorage.getItem(LANG_STORAGE_KEY);
      const storedLang = toLang(stored);
      if (storedLang) return storedLang;
    }

    const deviceCode = Localization.getLocales()[0]?.languageCode;
    const deviceLang = toLang(deviceCode);
    return deviceLang ?? 'es';
  },
  init: () => {},
  cacheUserLanguage: async (lang) => {
    if (isServer) return;
    await AsyncStorage.setItem(LANG_STORAGE_KEY, lang);
  },
};

void i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      ca: { translation: ca },
    },
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
    returnNull: false,
  });

export default i18n;
