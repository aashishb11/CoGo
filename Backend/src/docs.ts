import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { INestApplication, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AuthService } from '@thallesp/nestjs-better-auth';
import type { Request, Response } from 'express';
import type { Auth } from '@modules/auth/auth.factory';

type BetterAuthOperation = { tags?: string[]; [key: string]: unknown };
type BetterAuthPathMethods = Record<string, BetterAuthOperation>;
type BetterAuthOpenApiSchema = {
  paths?: Record<string, BetterAuthPathMethods>;
  components?: { schemas?: Record<string, unknown> };
};

const BETTER_AUTH_PATH_TO_TAG: Record<string, string> = {
  '/sign-up/email': 'Authentication',
  '/verify-email': 'Authentication',
  '/send-verification-email': 'Authentication',
  '/sign-in/email': 'Authentication',
  '/sign-in/social': 'Authentication',
  '/sign-out': 'Authentication',
  '/callback/{id}': 'Authentication',
  '/get-session': 'Session',
  '/update-session': 'Session',
  '/list-sessions': 'Session',
  '/revoke-session': 'Session',
  '/revoke-sessions': 'Session',
  '/revoke-other-sessions': 'Session',
  '/change-password': 'Password',
  '/verify-password': 'Password',
  '/request-password-reset': 'Password',
  '/reset-password': 'Password',
  '/reset-password/{token}': 'Password',
  '/update-user': 'Account',
  '/change-email': 'Account',
  '/delete-user': 'Account',
  '/delete-user/callback': 'Account',
  '/account-info': 'Account',
  '/link-social': 'Social',
  '/unlink-account': 'Social',
  '/list-accounts': 'Social',
  '/refresh-token': 'Social',
  '/get-access-token': 'Social',
};

const BETTER_AUTH_INTERNAL_PATHS = new Set(['/ok', '/error']);

export async function setupDocs(app: INestApplication): Promise<void> {
  const config = new DocumentBuilder()
    .setTitle('CoGo API')
    .setDescription(
      'CoGo backend REST API. WebSocket events are documented separately at [/api/docs/ws](/api/docs/ws).',
    )
    .setVersion('1.0')
    .addCookieAuth('better-auth.session_token')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', description: 'Partner API key.' },
      'partner-key',
    )
    .build();

  const nestjsDocument = SwaggerModule.createDocument(app, config);

  const auth = app.get(AuthService<Auth>).instance;
  // generateOpenAPISchema is added by the openAPI() plugin; the base Auth
  // type doesn't expose it, so we reach in via unknown.
  const generateBetterAuthSchema = (
    auth.api as unknown as {
      generateOpenAPISchema: () => Promise<BetterAuthOpenApiSchema>;
    }
  ).generateOpenAPISchema;
  const betterAuthSchema = await generateBetterAuthSchema();

  const betterAuthPaths = Object.fromEntries(
    Object.entries(betterAuthSchema.paths ?? {})
      .filter(([path]) => !BETTER_AUTH_INTERNAL_PATHS.has(path))
      .map(([path, methods]) => [
        `/api/auth${path}`,
        Object.fromEntries(
          Object.entries(methods).map(([method, operation]) => [
            method,
            { ...operation, tags: [BETTER_AUTH_PATH_TO_TAG[path] ?? 'Auth'] },
          ]),
        ),
      ]),
  );

  const mergedDocument = {
    ...nestjsDocument,
    paths: { ...nestjsDocument.paths, ...betterAuthPaths },
    components: {
      ...nestjsDocument.components,
      schemas: {
        ...nestjsDocument.components?.schemas,
        ...(betterAuthSchema.components?.schemas ?? {}),
      },
    },
  };

  // Partner-facing docs: the same spec filtered to only `Partner`-tagged
  // operations, so external integrators never see internal routes.
  const partnerDocument = {
    ...mergedDocument,
    info: {
      ...mergedDocument.info,
      title: 'CoGo Partner API',
      description:
        'Public ride-search API for external partner integrations. ' +
        'Authenticate every request with an `Authorization: Bearer <key>` header.',
    },
    paths: filterPathsByTag(mergedDocument.paths, 'Partner'),
  };

  // AsyncAPI must mount before Scalar — `app.use('/api/docs', ...)` is a
  // prefix match and would otherwise shadow `/api/docs/ws`.
  await setupAsyncDocs(app);

  // `/api/docs/partner` mounts before `/api/docs` for the same prefix-match
  // reason: `/api/docs` would otherwise shadow it.
  app.use('/api/docs/partner', apiReference({ content: partnerDocument }));
  app.use('/api/docs', apiReference({ content: mergedDocument }));
}

// Keeps only the operations carrying `tag`, dropping paths left with none.
function filterPathsByTag(
  paths: Record<string, unknown>,
  tag: string,
): Record<string, BetterAuthPathMethods> {
  return Object.fromEntries(
    Object.entries(paths as Record<string, BetterAuthPathMethods>)
      .map(([path, methods]): [string, BetterAuthPathMethods] => [
        path,
        Object.fromEntries(
          Object.entries(methods).filter(([, operation]) =>
            operation.tags?.includes(tag),
          ),
        ),
      ])
      .filter(([, methods]) => Object.keys(methods).length > 0),
  );
}

// AsyncAPI is the industry standard for documenting event-driven / WebSocket
// APIs (Linux Foundation; OpenAPI's sibling spec). The spec is generated from
// the gateway decorators (@AsyncApi / @AsyncApiReceive / @AsyncApiSend) at
// build time by `scripts/generate-asyncapi.ts`, which writes both:
//
//   dist/asyncapi.html  — fully rendered viewer (heavy: React + Babel)
//   dist/asyncapi.json  — raw spec (cheap fallback)
//
// Doing the render at build time keeps the runtime container memory-safe on
// Render's free tier — instantiating @asyncapi/generator at runtime is what
// previously OOMed bootstrap and took production down (see PR #148 / #150).
async function setupAsyncDocs(app: INestApplication): Promise<void> {
  const logger = new Logger('AsyncAPIDocs');
  const distDir = join(process.cwd(), 'dist');

  const html = await readOptional(join(distDir, 'asyncapi.html'));
  const json = await readOptional(join(distDir, 'asyncapi.json'));

  if (!html && !json) {
    logger.warn(
      'No dist/asyncapi.{html,json} found — /api/docs/ws will return a stub. ' +
        'Re-run `pnpm build` to regenerate.',
    );
    app.use('/api/docs/ws', (_req: Request, res: Response) => {
      res
        .status(503)
        .type('text/plain')
        .send(
          'AsyncAPI docs were not generated for this deploy. ' +
            'Run `pnpm build` and redeploy.',
        );
    });
    return;
  }

  if (html) {
    logger.log('Serving rendered AsyncAPI HTML at /api/docs/ws');
    app.use('/api/docs/ws', (_req: Request, res: Response) => {
      res.type('html').send(html);
    });
  } else {
    logger.warn(
      'AsyncAPI HTML missing — serving raw spec at /api/docs/ws instead. ' +
        'Paste into https://studio.asyncapi.com to view.',
    );
    app.use('/api/docs/ws', (_req: Request, res: Response) => {
      res.type('application/json').send(json);
    });
  }

  if (json) {
    app.use('/api/docs/ws.json', (_req: Request, res: Response) => {
      res.type('application/json').send(json);
    });
  }
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}
