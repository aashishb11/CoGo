// Test stub for `nestjs-asyncapi`.
//
// The real package eagerly `require`s `@asyncapi/generator` at import time,
// which resolves a global `npm` install via the unmaintained `requireg`
// package. That resolution returns `undefined` on Node versions newer than
// the one this project pins (`.nvmrc` → 22), crashing every Jest suite that
// transitively imports the chat gateway.
//
// Tests never assert on AsyncAPI documentation metadata — the real spec is
// generated at build time by `scripts/generate-asyncapi.ts` — so the
// decorators are safely stubbed to no-ops here and wired in via Jest's
// `moduleNameMapper` (see package.json and test/jest-e2e.json).

// Returns a decorator that does nothing. The inner function declares no
// parameters but is still valid as a class or method decorator — JS ignores
// the extra arguments the runtime passes in.
const noopDecorator = () => (): void => undefined;

export const AsyncApi = noopDecorator;
export const AsyncApiReceive = noopDecorator;
export const AsyncApiSend = noopDecorator;
