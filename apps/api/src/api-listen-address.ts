export function resolveApiListenAddress(configuredHost: string | undefined): string {
  return configuredHost?.trim() || '0.0.0.0';
}
