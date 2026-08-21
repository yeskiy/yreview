import { describe, expect, test } from 'vitest';
import { parseConfig } from '../src/config.js';

const token = 'a-token-of-32-characters-000000000';

const envWith = (url: string): Record<string, string | undefined> => ({
    Y_REVIEW_BRIDGE_URL: url,
    Y_REVIEW_BRIDGE_TOKEN: token
});

describe('parseConfig', () => {
    test('accepts a bridge on the IPv4 loopback address', () => {
        expect(parseConfig(envWith('http://127.0.0.1:64343')).bridgeUrl).toBe('http://127.0.0.1:64343');
    });

    test('accepts any address inside 127.0.0.0/8', () => {
        expect(parseConfig(envWith('http://127.2.3.4:64343')).bridgeUrl).toBe('http://127.2.3.4:64343');
    });

    test('accepts the name localhost', () => {
        expect(parseConfig(envWith('http://localhost:64343')).bridgeUrl).toBe('http://localhost:64343');
    });

    test('accepts the IPv6 loopback address', () => {
        expect(parseConfig(envWith('http://[::1]:64343')).bridgeUrl).toBe('http://[::1]:64343');
    });

    test('keeps a base path and removes the trailing slash', () => {
        expect(parseConfig(envWith('http://127.0.0.1:64343/y-review/')).bridgeUrl).toBe('http://127.0.0.1:64343/y-review');
    });

    test('returns the token', () => {
        expect(parseConfig(envWith('http://127.0.0.1:64343')).token).toBe(token);
    });

    test('rejects an address outside the loopback range', () => {
        expect(() => parseConfig(envWith('http://192.168.1.5:64343'))).toThrow(/loopback/);
    });

    test('rejects a host name that is not localhost', () => {
        expect(() => parseConfig(envWith('http://example.com'))).toThrow(/loopback/);
    });

    test('rejects a scheme other than http', () => {
        expect(() => parseConfig(envWith('https://127.0.0.1:64343'))).toThrow(/http/);
    });

    test('rejects a file address', () => {
        expect(() => parseConfig(envWith('file:///etc/passwd'))).toThrow(/http/);
    });

    test('rejects an address that does not parse', () => {
        expect(() => parseConfig(envWith('not a url'))).toThrow(/Y_REVIEW_BRIDGE_URL/);
    });

    test('rejects a missing address', () => {
        expect(() => parseConfig({ Y_REVIEW_BRIDGE_TOKEN: token })).toThrow(/Y_REVIEW_BRIDGE_URL/);
    });

    test('rejects a missing token', () => {
        expect(() => parseConfig({ Y_REVIEW_BRIDGE_URL: 'http://127.0.0.1:64343' })).toThrow(/Y_REVIEW_BRIDGE_TOKEN/);
    });

    test('rejects a token that is too short to guard the bridge', () => {
        expect(() =>
            parseConfig({ Y_REVIEW_BRIDGE_URL: 'http://127.0.0.1:64343', Y_REVIEW_BRIDGE_TOKEN: 'short' })
        ).toThrow(/Y_REVIEW_BRIDGE_TOKEN/);
    });
});
