import type { ca } from './locales/ca';
import type { en } from './locales/en';
import type { es } from './locales/es';

// Leaf-only deep keys: 'auth.signIn.error.default' yes; intermediate paths
// like 'auth' or 'auth.signIn' no. Matches the semantics of the legacy
// `TextKey = keyof translations.en` so existing call sites still type-check.
export type DeepKeys<T> = T extends object
  ? {
      [K in keyof T]: T[K] extends object
        ? `${K & string}.${DeepKeys<T[K]> & string}`
        : `${K & string}`;
    }[keyof T]
  : never;

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// Compile-time assertion: every key in `en` exists in `es` and `ca`. If a key
// is missing or extra in any locale, `tsc` fails on these lines. Keeps the
// three dictionaries in sync without runtime overhead.
const _enEs: Equal<DeepKeys<typeof en>, DeepKeys<typeof es>> = true;
const _enCa: Equal<DeepKeys<typeof en>, DeepKeys<typeof ca>> = true;

void _enEs;
void _enCa;
