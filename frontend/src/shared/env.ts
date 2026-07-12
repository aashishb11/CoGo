import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  clientPrefix: 'EXPO_PUBLIC_',
  client: {
    EXPO_PUBLIC_API_BASE_URL: z.url().default('https://cogo-backend.onrender.com'),
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().min(1).optional(),
  },
  // Metro inlines `process.env.EXPO_PUBLIC_*` references at build time, so each
  // var has to be listed explicitly here — a dynamic spread won't work.
  runtimeEnv: {
    EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
    EXPO_PUBLIC_GOOGLE_MAPS_API_KEY:
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY,
  },
  emptyStringAsUndefined: true,
});
