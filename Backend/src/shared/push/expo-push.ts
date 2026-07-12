export function isExpoPushToken(endpoint: string): boolean {
  return (
    endpoint.startsWith('ExponentPushToken[') ||
    endpoint.startsWith('ExpoPushToken[')
  );
}
