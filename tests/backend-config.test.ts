import { describe, it, expect } from 'vitest';
import { describeBackend, readBackendConfig } from '../src/services/backend/config';

describe('backend config', () => {
  it('is disabled when env vars are missing or blank', () => {
    expect(readBackendConfig({})).toEqual({ enabled: false, reason: 'missing' });
    expect(readBackendConfig({ VITE_SUPABASE_URL: ' ', VITE_SUPABASE_ANON_KEY: 'k' })).toEqual({ enabled: false, reason: 'missing' });
  });

  it('rejects invalid or insecure URLs', () => {
    expect(readBackendConfig({ VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_ANON_KEY: 'k' })).toEqual({ enabled: false, reason: 'invalid-url' });
    expect(readBackendConfig({ VITE_SUPABASE_URL: 'http://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' })).toEqual({ enabled: false, reason: 'invalid-url' });
  });

  it('accepts https, and http only for localhost', () => {
    expect(readBackendConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co/', VITE_SUPABASE_ANON_KEY: ' key ' })).toEqual({
      enabled: true,
      url: 'https://abc.supabase.co',
      anonKey: 'key',
    });
    expect(readBackendConfig({ VITE_SUPABASE_URL: 'http://localhost:54321', VITE_SUPABASE_ANON_KEY: 'k' }).enabled).toBe(true);
  });

  it('describes the status for the settings screen', () => {
    expect(describeBackend({ enabled: false, reason: 'missing' })).toMatch(/Offline mode/);
    expect(describeBackend({ enabled: true, url: 'https://abc.supabase.co', anonKey: 'k' })).toBe('Online (abc.supabase.co)');
  });
});
