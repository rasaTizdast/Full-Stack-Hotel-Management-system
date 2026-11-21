import { resolveApiListenAddress } from './api-listen-address';

describe('API listen address', () => {
  it('preserves the container-friendly all-interface default', () => {
    expect(resolveApiListenAddress(undefined)).toBe('0.0.0.0');
  });

  it('honors a configured loopback host for local-only development servers', () => {
    expect(resolveApiListenAddress('127.0.0.1')).toBe('127.0.0.1');
  });

  it('falls back to the safe default for an empty configured host', () => {
    expect(resolveApiListenAddress('   ')).toBe('0.0.0.0');
  });
});
