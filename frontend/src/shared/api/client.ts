import { Platform } from 'react-native';
import { z } from 'zod';

import { ApiError } from './errors';

import { authClient, baseURL } from '@/features/auth/auth-client';

const apiBaseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;

function buildRequestUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  if (path.startsWith('/')) {
    return `${apiBaseURL}${path}`;
  }
  return new URL(path, `${apiBaseURL}/`).toString();
}

// On native there's no browser cookie jar, so we attach the cookie header
// expoClient already maintains in SecureStore. (Bearer-token transport via
// the bearer() server plugin is also supported, but the round-trip through
// signed-token parsing is fragile — sending the cookie verbatim is simpler
// and matches what expoClient's own fetch does for /api/auth/* calls.)
// On web the browser sends the HttpOnly cookie automatically when the request
// is made with credentials: 'include'.
function getNativeAuthHeader(): Record<string, string> {
  if (Platform.OS === 'web') return {};
  const cookie = authClient.getCookie();
  return cookie ? { Cookie: cookie } : {};
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export type ApiFetchOptions = {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  allowNotFound?: boolean;
};

export async function apiFetch<T>(opts: ApiFetchOptions): Promise<T | null> {
  const { path, method, body, allowNotFound = false } = opts;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...getNativeAuthHeader(),
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(buildRequestUrl(path), {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) {
    return null;
  }
  if (allowNotFound && response.status === 404) {
    return null;
  }

  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    const payloadMessage =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : undefined;
    const payloadCode =
      payload &&
      typeof payload === 'object' &&
      typeof (payload as { code?: unknown }).code === 'string'
        ? (payload as { code: string }).code
        : undefined;

    throw new ApiError(
      payloadMessage || `API ${method} ${path} failed: ${response.status} ${response.statusText}`,
      {
        status: response.status,
        code: payloadCode,
        payload,
      },
    );
  }

  return payload as T;
}

export function validateSchema<S extends z.ZodType>(
  schema: S,
  input: unknown,
  errorMessage: string,
): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ApiError(errorMessage, {
      code: 'VALIDATION',
      payload: z.flattenError(parsed.error),
    });
  }
  return parsed.data;
}

export function withParams(template: string, params: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    const encoded = encodeURIComponent(value);
    result = result.replaceAll(`:${key}`, encoded).replaceAll(`{${key}}`, encoded);
  }
  return result;
}
