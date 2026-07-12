# AGENTS.md

Este archivo define como debe trabajar cualquier agente/colaborador al escribir codigo en este repositorio.

## Objetivo

- Mantener consistencia de arquitectura, estilo y calidad.
- Reducir deuda tecnica, duplicacion y divergencias entre pantallas.
- Evitar regresiones funcionales en auth, trips, profile y cars.
- Asegurar que los cambios nuevos encajen con las practicas reales de `develop`.

## Stack y principios base

- Expo SDK 54 + React Native 0.81 + React 19 + TypeScript estricto.
- Routing con `expo-router` y `typedRoutes` activado en `app.json`.
- Server state con TanStack Query v5.
- Auth con `better-auth` + `@better-auth/expo`, cookies nativas via `expo-secure-store`.
- Formularios con React Hook Form + Zod + `zodResolver(...)`.
- i18n con `react-i18next`; usar `useTranslation()` / `t('clave.tipado')`, no `get_text(...)`.
- Tema visual centralizado en `src/shared/theme`.
- Iconos con `lucide-react-native`.
- Estilos con `StyleSheet.create(...)` u objetos tipados de React Native usando tokens; no introducir un styling framework.

## Entorno y secretos

- Crear un `.env` local a partir de `.env.example`; no commitear `.env`, `.env.*` ni un archivo `env` sin punto.
- Variables publicas actuales:
  - `EXPO_PUBLIC_API_BASE_URL`
  - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`
- Consumir variables siempre desde `src/shared/env.ts` (`env.EXPO_PUBLIC_*`), nunca desde `process.env.*` en features o pantallas.
- `src/shared/env.ts` valida con Zod y `@t3-oss/env-core`; si se agrega una variable nueva, actualizar `.env.example`, el schema y `runtimeEnv`.
- No guardar keys reales en codigo, docs, fixtures ni defaults. Pedir secretos por canal seguro si hacen falta.
- No reintroducir `EXPO_PUBLIC_TRIPS_*_ENDPOINT`; los endpoints de trips viven inline en `src/features/trips/api.ts`.

## Arquitectura obligatoria

- Mantener estructura por `features` + `shared` + `providers`.
- `src/app/*` es capa de routing:
  - Rutas hoja (`*.tsx`) como re-export fino de pantallas o UI compartida.
  - `_layout.tsx` puede contener configuracion de navegadores, providers y opciones de tabs/stacks.
  - No meter reglas de negocio de dominio dentro de `src/app`.
- Logica de negocio y UI de dominio viven en `src/features/<feature>/...`.
- Codigo reutilizable transversal vive en `src/shared/...`.
- Providers de aplicacion que coordinan estado transversal viven en `src/providers`.
- Usar el alias `@/*` para imports desde `src`.

## Estructura actual esperada

- `src/app`: rutas de Expo Router. Ejemplos actuales: `(auth)`, `(tabs)`, `add-car`, `modal`.
- `src/features/auth`: cliente de auth, guards/hook de sesion, formularios y pantallas de auth.
- `src/features/cars`: API, queries, schema, formulario y pantallas de vehiculos.
- `src/features/car-models`: busqueda de catalogo de modelos.
- `src/features/profile`: API, queries, schema, formulario, pantallas y helpers de perfil.
- `src/features/trips`: API, queries, schemas, pantallas, componentes de trips, create-trip y location-picker.
- `src/shared/api`: `apiFetch`, `ApiError`, helpers de errores.
- `src/shared/i18n`: init de i18next, locales `en/es/ca`, claves tipadas y parity compile-time.
- `src/shared/query`: `queryClient` e invalidacion comun.
- `src/shared/schemas`: schemas primitivos compartidos.
- `src/shared/theme`: tokens visuales y `formStyles`.
- `src/shared/ui`: UI transversal.

## Limites entre features

- No importar internals privados de otra feature.
- Contratos publicos permitidos entre features:
  - `api.ts`
  - `queries.ts`
  - `schemas.ts`
  - `types.ts`
  - `index.ts` publico, si existe
- Importar componentes de otra feature solo si son parte de un contrato publico explicito. Si se necesitan en 2+ features, moverlos a `src/shared`.
- Excepciones existentes aceptadas:
  - `shared/api/client.ts` importa `features/auth/auth-client` para adjuntar la cookie nativa.
  - Features pueden consumir `features/auth/queries` (`useSession`, `useRequireAuth`) como contrato publico de auth.

## Routing y navegacion

- Usar rutas reales del arbol `src/app`; `typedRoutes` debe seguir limpio con `npm run typecheck`.
- Preferir rutas absolutas de Expo Router cuando mejoren claridad: `/(auth)/sign-in`, `/(tabs)/cars`, `/(tabs)/trips/create`.
- Las rutas ocultas de tabs se declaran con `href: null` en `src/app/(tabs)/_layout.tsx`.
- Pantallas autenticadas deben usar `useRequireAuth()` cuando necesiten sesion.
- El header por defecto suele estar oculto; las pantallas usan `ScreenHeader` u otros headers inline cuando aplique.
- Si falla el tipado de rutas, revisar primero el arbol de `src/app` y regenerar tipos de Expo Router antes de cambiar logica de dominio.

## Server state y queries

- Todo server state debe pasar por hooks de TanStack Query en `features/<feature>/queries.ts` o por un hook de feature muy acotado.
- No duplicar loading/error/data de servidor en `useState`; usar `query.isLoading`, `query.error`, `mutation.error`, `isPending`, etc.
- Cada `queries.ts` debe co-localizar un objeto `queryKeys` tipado con `as const`.
- Las mutaciones deben invalidar todas las keys afectadas mediante `invalidateAll(...)` o el helper local de la feature.
- Usar `enabled: Boolean(id)` para queries que dependen de sesion, ids o parametros obligatorios.
- Mantener un unico `QueryClient` en `src/shared/query/client.ts`; no crear clientes nuevos en pantallas.

## API y datos

- Toda llamada HTTP al backend propio pasa por `src/shared/api/client.ts` (`apiFetch`).
- `apiFetch` recibe `{ path, method, body?, allowNotFound? }`; no asumir opciones que no existan.
- Usar `validateSchema(schema, input, message)` antes de mutaciones relevantes.
- Normalizar entrada y salida cerca del API o schema de la feature, no dentro de componentes visuales.
- DTOs y tipos de payload deben vivir junto al API de la feature o en `types.ts` si ya existe.
- Usar `withParams(...)`, `encodeURIComponent(...)` o `URLSearchParams` para construir rutas/queries; no concatenar parametros sin encode.
- Errores de backend/UI deben mapearse con `mapErrorToMessageKey(error)`.
- Usar `ApiError` desde `@/shared/api` o `@/shared/api/errors`.
- Evitar `as any` y casts dobles (`as unknown as ...`) salvo caso justificado con comentario corto.

## Auth

- El cliente unico de auth vive en `src/features/auth/auth-client.ts`.
- Usar `useSession` y `useRequireAuth` desde `src/features/auth/queries.ts`; no duplicar guards de sesion en pantallas.
- En native, `apiFetch` adjunta la cookie de `better-auth` via `authClient.getCookie()`; en web se usa `credentials: 'include'`.
- Flujos de sign-in/sign-up/forgot-password deben mapear errores con `mapErrorToMessageKey(...)` y mostrar mensajes genericos cuando better-auth o seguridad lo requieran.
- Reset password debe enviarse con callback/redirect URL generado con Expo Linking (`Linking.createURL('/reset-password')` via helper de auth), no con una env local. Esto permite Expo Go (`exp://...`) y dev build/app real (`cogo://...`) sin hardcodear IPs.
- Si cambia la API de better-auth, simplificar el boilerplate siguiendo la nueva API en vez de conservar wrappers obsoletos por compatibilidad local.

## Formularios y schemas

- Crear formularios con RHF + `zodResolver(...)`.
- Tipar `useForm<T>()` explicitamente. Cuando el schema transforma datos, usar el patron:
  - `useForm<z.input<typeof Schema>, unknown, z.output<typeof Schema>>({...})`
- Mantener schemas de validacion/normalizacion en `features/<feature>/schemas.ts` o `src/shared/schemas/common.ts`.
- Evitar `useState` por campo para datos de formulario; usar RHF. `useState` esta bien para UI local como toggles, picker seleccionado o visibilidad de password.
- Errores de schema se traducen con `translateZodMessage(...)`.
- Los slugs custom de Zod deben tener mapping en `src/shared/utils/zod-error-map.ts` cuando sean visibles para usuarios.
- Preferir `Controller` + `TextInput` con `formStyles` para campos repetidos.
- Para campos con formato cerrado (matricula, telefono, hora, etc.), restringir caracteres y longitud en `onChangeText`/props del input cuando sea UX esperada. Mantener Zod como safety net para submit, paste y cambios programaticos.

## i18n

- Todo texto visible debe venir de `t('clave')` con `useTranslation()` o de props que ya llegan traducidas.
- No introducir `get_text(...)`; el proyecto usa `react-i18next`.
- Al agregar claves, actualizar los tres locales:
  - `src/shared/i18n/locales/en.ts`
  - `src/shared/i18n/locales/es.ts`
  - `src/shared/i18n/locales/ca.ts`
- Las claves se tipan desde `typeof en`; `src/shared/i18n/parity.ts` hace fallar `typecheck` si falta o sobra una clave entre idiomas.
- Para idioma actual, usar `toLang(...)` y el tipo `Lang`.
- Cambios de idioma deben pasar por i18next (`i18n.changeLanguage`) y respetar `ProfileLocaleSync`.

## UI, estilos y componentes compartidos

- No usar hex hardcodeado en pantallas o componentes de producto. Definir colores en `src/shared/theme`.
- Usar `Palette`, `Spacing`, `Radii`, `Shadow`, `Typography`, `FontSize`, `FontWeight` y `Fonts`.
- Los hex dentro de `src/shared/theme` y configuracion nativa (`app.json`) son aceptables.
- Usar `formStyles` para inputs, labels, errores y botones de formulario.
- Usar componentes compartidos existentes antes de crear variantes:
  - `ScreenHeader`
  - `BackActionButton`
  - `EditActionButton`
  - `SegmentedControl`
  - `Toast`
  - `LanguageSwitcher`
  - `ErrorBoundary`
- Si un patron visual aparece en 2+ pantallas, extraerlo a `src/shared/ui/components` o a `src/shared/theme/form-styles.ts`.
- Si un patron solo pertenece a una feature pero se repite ahi, extraerlo dentro de esa feature antes de promoverlo a `shared`.
- Usar `lucide-react-native` para iconos; no introducir nuevos imports de `@expo/vector-icons`.
- Mantener accesibilidad basica: `accessibilityRole`, `accessibilityState`, `accessibilityLabel` traducido cuando el control no tenga texto visible claro.

## Naming

- Pantallas: `<accion>-<entidad>-screen.tsx` o `<contexto>-screen.tsx` si ya es la convencion local.
- Formularios: `<entidad>-form.tsx`.
- Hooks de queries/mutations: `useX`, `useCreateX`, `useUpdateX`, `useDeleteX`, `useCancelX`.
- Rutas en `src/app`: archivos finos que re-exportan pantallas de feature.
- Evitar nombres ambiguos (`utils2`, `new-screen`, `temp`).

## Calidad, lint y formato

- TypeScript esta en `strict: true`.
- Respetar Prettier actual:
  - single quotes
  - semicolons
  - trailing commas
  - `printWidth: 100`
  - `tabWidth: 2`
- ESLint usa config flat de Expo y reglas relevantes:
  - `react-hooks/rules-of-hooks`: error
  - `react-hooks/exhaustive-deps`: warn
  - `import/no-cycle`: error
  - `import/order`: warn con imports alfabetizados y linea en blanco entre grupos
  - `jsx-a11y` recomendado como warn
- No arreglar lint cambiando comportamiento sin entender el flujo.

## Tests y validacion

- Actualmente no hay script de test en `package.json`; no prometer ni exigir Jest/Vitest si no se agrega infraestructura.
- Validacion minima antes de cerrar cambios de codigo:
  1. `npm run typecheck`
  2. `npm run lint`
  3. `npm run format:check` si se tocaron varios archivos o Markdown/JSON.
- Si se toca flujo critico (auth, trips, profile, cars), validar manualmente caso feliz y un caso de error cuando sea posible.
- Si se toca `api.ts` o `queries.ts`, verificar invalidaciones, `allowNotFound`, errores mapeados y estados `enabled`.
- Si no se puede ejecutar una validacion, dejar nota explicita con motivo y riesgo.

## Checklist de PR

1. Descripcion breve del cambio y alcance.
2. Archivos/areas impactadas.
3. Evidencia de validacion (`typecheck`, `lint`, `format:check` si aplica, pruebas manuales).
4. Notas de riesgo, limitaciones o follow-ups.
5. Confirmacion de que no se duplico UI ya existente en `shared`.

## Definicion de terminado (DoD)

- Sin errores de TypeScript.
- Sin errores de lint.
- Rutas compatibles con `typedRoutes`.
- Textos nuevos traducidos en `en`, `es` y `ca`.
- Estilos alineados con tokens de `src/shared/theme`.
- Sin regresiones obvias en auth, trips, profile o cars.
- Estructura alineada con `features`, `shared`, `providers` y `src/app` como routing.
- Sin duplicacion innecesaria de UI comun entre features.
