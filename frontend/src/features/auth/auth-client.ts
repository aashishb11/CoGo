import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { env } from '@/shared/env';

export const baseURL = env.EXPO_PUBLIC_API_BASE_URL;

export function buildAuthCallbackURL(path: string) {
  return Linking.createURL(path);
}

// expoClient compensates for React Native's lack of a cookie jar by storing
// the session token in SecureStore and injecting it on subsequent requests.
// On web the browser already handles HttpOnly cookies natively (apiFetch sends
// `credentials: 'include'`), and the plugin's storage path interferes with the
// signIn response shape — so we only register it off-web.
export const authClient = createAuthClient({
  baseURL,
  plugins:
    Platform.OS === 'web'
      ? []
      : [
          expoClient({
            scheme: 'cogo',
            storagePrefix: 'cogo',
            storage: SecureStore,
          }),
        ],
});
