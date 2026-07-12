# cogo-frontend

Expo + React Native app for CoGo. Cross-platform (iOS, Android, web) from a single TypeScript codebase.

## Stack

- **Expo SDK 54** + **React Native 0.81** + **React 19** (New Architecture on)
- **Expo Router 6** — file-based routing with `typedRoutes`
- **better-auth** — session auth, backed by `expo-secure-store`
- **TanStack Query** — server state, caching, mutations
- **React Hook Form** + **Zod** — form state and validation from the same schema
- **react-native-maps** — location picker
- **lucide-react-native** + **react-native-svg** — icon set (no `@expo/vector-icons` legacy)
- **Plain `StyleSheet.create`** sourcing shared tokens (no styling framework — deliberately)

## Getting started

```bash
npm install
npm run start
```

Then press `i` for iOS, `a` for Android, or `w` for web. Copy `.env.example` to `.env` before your first run; every public key is prefixed `EXPO_PUBLIC_`.

## Scripts

| Script                                            | What it does                          |
| ------------------------------------------------- | ------------------------------------- |
| `npm run start`                                   | Start the Expo dev server             |
| `npm run ios` / `npm run android` / `npm run web` | Start and open directly on a platform |
| `npm run typecheck`                               | `tsc --noEmit`                        |
| `npm run lint`                                    | ESLint                                |
| `npm run format` / `npm run format:check`         | Prettier write / check                |

A Husky pre-commit hook runs `prettier --write` + `eslint --fix` on staged files via `lint-staged`.

## Folder structure

Source code lives under `src/` — the repo root stays config-only. The path alias `@/*` resolves to `src/*`.

```
src/
  app/                          # expo-router routes. Every file is a thin re-export.
    _layout.tsx                 # providers: ErrorBoundary, QueryClient, SafeArea, Theme
    add-car.tsx                 # modal route (presentation: 'modal') — push from cars
    modal.tsx                   # generic modal route (language settings, etc.)
    (auth)/                     # unauthenticated stack
      _layout.tsx
      sign-in.tsx               # re-exports features/auth/screens/sign-in-screen
      sign-up.tsx
      forgot-password.tsx
      verify-email.tsx
      create-profile.tsx
    (tabs)/                     # authenticated tabs — Find / Create / Profile
      _layout.tsx
      index.tsx                 # Find tab (passenger trip discovery)
      profile.tsx
      cars.tsx                  # hidden route, navigated to from profile
      edit-car.tsx              # hidden route
      edit-profile.tsx          # hidden route
      trips/
        create.tsx              # Create tab (driver-only — offers a ride)
        [id].tsx                # trip details (hidden route)

  features/                     # feature-sliced modules — one folder per product feature
    auth/
      auth-client.ts            # better-auth client (consumed by every feature that needs a session)
      schemas.ts                # LoginSchema, SignUpSchema, ForgotPasswordSchema
      queries.ts                # useSession, useRequireAuth, setCachedSession
      forms/                    # sign-in-form, sign-up-form, forgot-password-form
      components/               # auth-card, auth-screen-layout (shared safe-area scaffold)
      screens/                  # sign-in, sign-up, forgot-password, verify-email, create-profile
    cars/
      api.ts                    # getUserCars, createUserCar, deleteUserCar
      schemas.ts                # CreateCarSchema
      queries.ts                # useCars, useCreateCar, useDeleteCar, useListUserCars
      forms/                    # car-form
      screens/                  # cars-screen, add-car-screen, edit-car-screen
    profile/
      api.ts                    # getUserProfile, createUserProfile
      schemas.ts                # CreateProfileSchema
      queries.ts                # useProfile, useCreateProfile
      use-header-name.ts        # reusable hook: resolves a friendly name for header greetings
      forms/                    # profile-form
      screens/                  # profile-screen, edit-profile-screen
    trips/
      api.ts                    # createDriverTrip, listDriverTrips, listAllTrips, getTripById, cancelDriverTrip, findPassengerTrips
      schemas.ts                # CreateDriverTripSchema, TripPreferencesSchema, FindPassengerTripsSchema
      queries.ts                # useDriverTrips, useTripById, useCreateDriverTrip, useCancelDriverTrip, useFindPassengerTrips, useAllDriverTrips
      create-trip/              # driver "create a trip" feature folder
        index.tsx               # orchestrator screen
        use-create-trip.ts      # RHF form + mutations + picker state
        location-section.tsx
        schedule-section.tsx    # recurring weekday picker OR one-time date input
        vehicle-section.tsx
        preferences-section.tsx
        active-trips-list.tsx
        styles.ts
      location-picker/          # map modal reused by create-trip (.native / .web)
      components/               # active-trip-card, passenger-trip-card, trip-detail-row
      screens/                  # create-trip-screen, find-trips-screen, trip-details-screen

  shared/                       # cross-cutting only — nothing feature-specific lives here
    api/
      client.ts                 # apiFetch<T>() — cookie handling, bearer token, error mapping, optional Zod validation
      errors.ts                 # ApiError, mapErrorToMessageKey(error): TextKey
      session.ts                # getSessionSnapshot, getSessionUserId, requireUserId
      index.ts                  # barrel — re-exports the three files above only
    query/
      client.ts                 # QueryClient instance (staleTime 30s, retry 1, no refetchOnWindowFocus)
    schemas/
      common.ts                 # EmailSchema, PhoneSchema, PlateSchema, TimeSchema, NonEmptyTrimmedString
    theme/
      index.ts                  # Palette, Spacing, Radii, Shadow, FontSize, FontWeight, Typography, Fonts
      form-styles.ts            # reusable StyleSheet primitives: input, label, errorText, primaryButton, ...
    i18n/
      index.ts                  # i18next init + async detector (AsyncStorage → expo-localization → 'es')
      i18next.d.ts              # typed t() module augmentation
      parity.ts                 # compile-time Equal<DeepKeys<en>, DeepKeys<es|ca>> assertion
      locales/
        en.ts                   # nested resource tree
        es.ts
        ca.ts
    env.ts                      # @t3-oss/env-core: zod-validated EXPO_PUBLIC_* config
    constants.ts                # storage keys (REMEMBER_ME_*, LANG_STORAGE_KEY)
    ui/
      error-boundary.tsx        # class component wrapping <Stack>
      language-switcher.tsx
      modal-screen.tsx
      components/
        screen-header.tsx       # inline per-screen header (white bg, brand or title + subtitle)
        segmented-control.tsx   # animated pill segmented control
        back-action-button.tsx
        edit-action-button.tsx
    utils/
      zod-error-map.ts          # translate Zod error slugs to i18n keys
```

### The rule

- Anything specific to **one** feature lives under `src/features/<feature>/`.
- Anything **multiple features** consume lives under `src/shared/`.
- A route file in `src/app/` should be a thin re-export — no business logic.

## Architecture

### Routing

Expo Router 6 with `typedRoutes: true`. Route files under `src/app/` are ≤10 LOC re-exports of screens from `src/features/*/screens/`. `router.push('/(tabs)/trips/create')` is type-checked against the actual file tree — missing routes are compile errors.

### Data flow

```
Screen (features/*/screens)
  │
  ├─▶ useQuery hook (features/*/queries.ts)
  │      │
  │      └─▶ apiFetch (shared/api/client.ts)
  │              │
  │              ├─ better-auth cookie + bearer (from features/auth/auth-client.ts)
  │              ├─ JSON parse
  │              └─ non-2xx → throw ApiError
  │
  └─▶ useForm(zodResolver(Schema)) (features/*/schemas.ts)
        │
        └─▶ useMutation → apiFetch → invalidate query keys
```

Every server fetch goes through **TanStack Query**. Screens never hold loading/error state in `useState`. Mutations invalidate the query keys they affect (e.g., `useCreateCar` invalidates `['cars', userId]`) so lists refresh automatically.

### API layer

- **`shared/api/client.ts`** — one `apiFetch<T>({ path, method, body, schema?, allowNotFound? })` wraps `fetch`. Cookie + bearer header, JSON handling, non-2xx → `ApiError`, optional Zod response validation.
- **`shared/api/errors.ts`** — `ApiError` class and a single `mapErrorToMessageKey(error)` switch that turns errors into `TextKey`s (401 → `auth.signIn.error.noSession`, 429 → `…tooManyRequests`, network → `common.error.network`, etc.). Every screen surfaces errors through this function instead of its own switch.
- **`shared/api/session.ts`** — `getSessionSnapshot`, `getSessionUserId(result)`, `requireUserId()`. The single source of truth for session state.
- **`features/*/api.ts`** — each feature owns its own endpoint functions. Thin wrappers over `apiFetch`. Hand-written DTOs live next to them; OpenAPI codegen is a future follow-up.

### Forms

React Hook Form + `@hookform/resolvers/zod`. The schema in `features/*/schemas.ts` is the single source of truth for both validation and TypeScript types (`z.infer<>`). Forms render via `<Controller>` + the shared `formStyles` primitives from `shared/theme/form-styles.ts`. Zod error slugs translate through `shared/utils/zod-error-map.ts`.

### i18n

`react-i18next` + `i18next` + `expo-localization`. Three languages: Spanish, English, Catalan.

- **Init** lives in `shared/i18n/index.ts` and runs once via the side-effect `import '@/shared/i18n'` in `src/app/_layout.tsx`.
- **Locale detection** uses a custom async detector: AsyncStorage (`app_lang`) first, then `expo-localization`'s device locale, then `'es'` as the default. The detector's `cacheUserLanguage` persists every change.
- **Profile sync**: `src/app/providers/profile-locale-sync.tsx` calls `i18n.changeLanguage(profile.locale)` on session load, so the server-stored locale wins over the device default.
- **Typed `t()`**: module augmentation in `i18next.d.ts` points at `typeof en`, so `t('foo.bar')` is autocompleted and rejects typos at compile time.
- **Cross-locale parity**: `parity.ts` asserts `DeepKeys<typeof en> == DeepKeys<typeof es> == DeepKeys<typeof ca>` at compile time, so a key missing in any locale fails `tsc`.
- **Interpolation**: `t('key', { total: '5' })` — schema's `{{total}}` placeholder gives typed variables.

### Styling

All design tokens live in `shared/theme/index.ts`:

- **`Palette`** — ~17 semantic color tokens (`primary`, `primarySurface`, `primaryDark`, `background`, `backgroundMuted`, `card`, `text`, `textSecondary`, `textOnPrimary`, `border`, `success` / `successSurface`, `danger` / `dangerSurface`, `warning`, `info`, `overlay`). Deliberately small — no driver/passenger accent split, no shade scale.
- **`Spacing`** — `xs (4) → xxxl (32)` — paddings, margins, gaps.
- **`Radii`** — `sm (8) / md (12) / lg (14) / xl (18) / pill (999)` — border radii.
- **`Shadow`** — preset shadow recipes (`card`, `cardSoft`, `heroCta`, `authCard`).
- **`FontSize`** — atomic scale `xxs (10) → 7xl (32)`. Use these for one-off sizes.
- **`FontWeight`** — `regular / medium / semibold / bold / extrabold` mapping to RN string values. Never write `'700'` directly; use `FontWeight.bold`.
- **`Typography`** — curated text-style presets (`caption`, `label`, `bodySmall`, `body`, `bodyEmphasized`, `titleSmall`, `title`, `display`, `brand`, `button`). Reach for these first; only drop down to atomic `FontSize`/`FontWeight` for one-offs.
- **`Fonts`** — platform-specific font families (system, serif, rounded, mono).

**Conventions**:

- **Zero hardcoded hex** in screens or components — every color from `Palette`.
- **Zero raw `fontSize`/`fontWeight` literals** — use `Typography.*` presets, or `FontSize.*` + `FontWeight.*` for one-offs.
- **Form primitives** (`input`, `label`, `errorText`, `primaryButton`, `secondaryButton`, `field`, `loadingRow`, `passwordToggle`, etc.) live in `shared/theme/form-styles.ts` and are consumed as `style={formStyles.input}`.
- **Icons**: `lucide-react-native` only — `<Search color={Palette.primary} size={24} strokeWidth={2.5} />`. The previous `@expo/vector-icons` (Ionicons / Feather / MaterialIcons) imports were swept out.
- **Light mode only.** `app.json` pins `userInterfaceStyle: "light"` and the root layout always selects react-navigation's `DefaultTheme`. Do not reintroduce a dark theme without an explicit product decision.

### Error handling

- `shared/ui/error-boundary.tsx` wraps `<Stack>` in `src/app/_layout.tsx` and catches render errors with a themed fallback and a "Reload" button.
- Query errors surface through `mapErrorToMessageKey(error)` + `t(key)` so copy stays consistent.
- Mutations expose `mutation.error` to the form for inline error banners.

## Adding a new feature

1. **Create the folder**: `src/features/<feature>/`.
2. **Schemas**: add `schemas.ts` with Zod schemas for every input and (optionally) every response. Derive TS types with `z.infer<>`.
3. **API**: add `api.ts` with one function per endpoint, each calling `apiFetch` from `@/shared/api`. Import `ApiError` from the same place if you need to narrow errors.
4. **Queries**: add `queries.ts` with `useX`/`useCreateX`/`useDeleteX` hooks wrapping the api functions. Co-locate `queryKeys` as a local object in the same file. Mutations invalidate the keys they affect.
5. **Forms** (if any): add `forms/<name>-form.tsx` using React Hook Form + `zodResolver(<YourSchema>)` + `formStyles`. The form component takes `onSubmit`, `isSubmitting`, and `formError` props — screens wire these up.
6. **Screens**: add `screens/<name>-screen.tsx`. Consume your query hooks, render your forms, use only `Palette` / `Spacing` / `Radii` / `Shadow` / `Typography` (or `FontSize` + `FontWeight`) for styling. Wrap content in `<ScreenHeader>` for safe-area-aware titles, and use lucide icons.
7. **Route**: add a thin re-export under `src/app/(tabs)/<path>.tsx` or `src/app/(auth)/<path>.tsx`:

   ```tsx
   export { default } from '@/features/<feature>/screens/<name>-screen';
   ```

8. **i18n**: add your keys to all three of `src/shared/i18n/locales/{en,es,ca}.ts` under the matching nested path. The compile-time parity assertion catches a missing key in any locale, and `t('your.key')` autocompletes once added.
9. **Typecheck**: `npm run typecheck` must be clean. With `typedRoutes: true`, any missed router path is a compile error.

## Adding a new route to an existing feature

1. Add the screen under the feature's `screens/` folder.
2. Add a thin re-export under the matching `src/app/` path.
3. Wire navigation via `router.push('/(tabs)/...')` or `router.replace(...)`. The path is type-checked.

## Conventions

- **No hex in components.** Use `Palette`.
- **No magic numbers in styles.** Use `Spacing`, `Radii`, `Shadow`.
- **No raw font literals.** Use `Typography` presets (or `FontSize` + `FontWeight` for one-offs).
- **No legacy icon libraries.** `lucide-react-native` only.
- **No local loading/error state for server data.** Use TanStack Query hooks from the feature's `queries.ts`.
- **No per-field `useState` in forms.** Use React Hook Form + a Zod schema.
- **No error-handling switches in screens.** Throw from the api layer, catch via query/mutation error state, surface through `mapErrorToMessageKey`.
- **Routes are thin.** If an `src/app/*.tsx` file has more than a re-export, it belongs in a `screens/` folder.
- **Features don't import from each other's internals.** If `features/trips` needs something from `features/cars`, import the public entry point (`features/cars/api.ts` or `queries.ts`), not a component file. In practice this happens rarely — if it does, consider whether the thing is actually shared and should live in `shared/`.

## Environment variables

Copy `.env.example` to `.env` and fill in the values. All public keys are prefixed `EXPO_PUBLIC_` and are validated against a zod schema in `src/shared/env.ts` via [`@t3-oss/env-core`](https://env.t3.gg/) — invalid or missing required values throw at boot rather than failing silently at runtime. Consume them through the typed `env` object (`import { env } from '@/shared/env'`), never `process.env.*` directly.
