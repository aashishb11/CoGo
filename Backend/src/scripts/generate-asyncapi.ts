import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AsyncApiDocumentBuilder, AsyncApiModule } from 'nestjs-asyncapi';
import { AppModule } from '../app.module';

// Required env vars are stubbed so the script can boot a Nest context anywhere
// (Render build, CI Build job, local) without real secrets. Postgres in
// DatabaseModule is lazy — `postgres()` doesn't connect until a query runs, so
// a dummy DATABASE_URL is fine for read-only decorator reflection.
const STUB_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://docs:docs@localhost:65535/docs',
  BETTER_AUTH_URL: 'http://localhost',
  BETTER_AUTH_SECRET: 'docs-build-time-stub',
  BREVO_API_KEY: 'docs',
  MAIL_FROM_EMAIL: 'docs@example.com',
  MAIL_FROM_NAME: 'docs',
  GOOGLE_CLIENT_ID: 'docs',
  GOOGLE_CLIENT_SECRET: 'docs',
  TOMTOM_API_KEY: 'docs',
  VAPID_PUBLIC_KEY: 'docs',
  VAPID_PRIVATE_KEY: 'docs',
  VAPID_SUBJECT: 'mailto:docs@example.com',
};
for (const [key, value] of Object.entries(STUB_ENV)) {
  if (!process.env[key]) process.env[key] = value;
}

async function main(): Promise<void> {
  const outDir = join(process.cwd(), 'dist');
  await mkdir(outDir, { recursive: true });

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });

  try {
    const config = new AsyncApiDocumentBuilder()
      .setTitle('CoGo Realtime API')
      .setDescription(
        'WebSocket surface for CoGo (Socket.IO, namespace `/chat`). Companion to the REST API at [/api/docs](/api/docs).',
      )
      .setVersion('1.0')
      .setDefaultContentType('application/json')
      .addServer('production', {
        host: 'cogo-backend.onrender.com',
        pathname: '/chat',
        protocol: 'wss',
        description: 'Render production deployment',
      })
      .addServer('local', {
        host: 'localhost:3000',
        pathname: '/chat',
        protocol: 'ws',
        description: 'Local dev (`pnpm start:dev`)',
      })
      .build();

    const document = AsyncApiModule.createDocument(app, config);

    // Always write the spec as JSON — cheap, useful as a fallback, and
    // consumable by any AsyncAPI viewer (e.g. studio.asyncapi.com).
    const jsonPath = join(outDir, 'asyncapi.json');
    await writeFile(jsonPath, JSON.stringify(document, null, 2), 'utf8');
    console.log(`[asyncapi] wrote ${jsonPath}`);

    // HTML generation is the heavy step (React + Babel via
    // @asyncapi/generator). Soft-fail: if it OOMs or otherwise breaks, the
    // build still succeeds with the JSON fallback in place.
    try {
      const html = await AsyncApiModule.composeHtml(document);
      const htmlPath = join(outDir, 'asyncapi.html');
      await writeFile(htmlPath, html, 'utf8');
      console.log(`[asyncapi] wrote ${htmlPath}`);
    } catch (err) {
      console.warn(
        `[asyncapi] HTML render failed; spec-only fallback will be served at runtime: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  // Soft-fail anything upstream too — never break the production build over
  // missing docs. Runtime route falls back gracefully when no artifact exists.
  console.warn(
    `[asyncapi] generation skipped: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(0);
});
