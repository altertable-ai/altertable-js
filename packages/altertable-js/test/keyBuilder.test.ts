import { describe, expect, it } from 'vitest';

import { createKeyBuilder } from '../src/lib/keyBuilder';

describe('createKeyBuilder', () => {
  it('should create keys with prefix and separator', () => {
    const keyBuilder = createKeyBuilder('test', '.');
    expect(keyBuilder('key1')).toBe('test.key1');
    expect(keyBuilder('key2')).toBe('test.key2');
  });

  it('should handle multiple parts', () => {
    const keyBuilder = createKeyBuilder('app', '-');
    expect(keyBuilder('user', 'id')).toBe('app-user-id');
    expect(keyBuilder('session', 'data', 'token')).toBe(
      'app-session-data-token'
    );
  });

  it('should work with different separators', () => {
    const keyBuilder = createKeyBuilder('lib', '_');
    expect(keyBuilder('config')).toBe('lib_config');
    expect(keyBuilder('cache', 'key')).toBe('lib_cache_key');
  });

  it('should handle empty parts', () => {
    const keyBuilder = createKeyBuilder('prefix', '.');
    expect(keyBuilder()).toBe('prefix');
    expect(keyBuilder('')).toBe('prefix.');
  });

  it('should handle special characters in parts', () => {
    const keyBuilder = createKeyBuilder('app', '-');
    expect(keyBuilder('user-name')).toBe('app-user-name');
    expect(keyBuilder('data', 'key with spaces')).toBe(
      'app-data-key with spaces'
    );
  });

  it('should create consistent keys for the same inputs', () => {
    const keyBuilder = createKeyBuilder('test', '.');
    const key1 = keyBuilder('user', 'id');
    const key2 = keyBuilder('user', 'id');
    expect(key1).toBe(key2);
    expect(key1).toBe('test.user.id');
  });
});
