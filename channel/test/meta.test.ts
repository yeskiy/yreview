import { describe, expect, test } from 'vitest';
import { buildBatchMeta, sanitizeMeta } from '../src/format.js';
import type { ReviewBatch } from '../src/schema.js';

const batch: ReviewBatch = {
    batchId: 'b7f2a91',
    branch: 'feat/channel-server',
    commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
    comments: [
        { id: 'aaaaaaa1111111111111111111111111111111111', path: 'a.kt', startLine: 1, endLine: 1, revision: 'HEAD', text: 'one' },
        { id: 'bbbbbbb2222222222222222222222222222222222', path: 'b.kt', startLine: 2, endLine: 2, revision: 'HEAD', text: 'two' }
    ]
};

describe('buildBatchMeta', () => {
    test('carries the branch, the commit, the count, and the batch id', () => {
        expect(buildBatchMeta(batch)).toStrictEqual({
            branch: 'feat/channel-server',
            commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
            count: '2',
            batch_id: 'b7f2a91'
        });
    });

    test('uses only keys that Claude Code keeps', () => {
        Object.keys(buildBatchMeta(batch)).forEach(key => expect(key).toMatch(/^[A-Za-z0-9_]+$/));
    });
});

describe('sanitizeMeta', () => {
    test('keeps a key of letters, digits, and underscores', () => {
        expect(sanitizeMeta({ batch_id: 'b1', count7: '3' })).toStrictEqual({ batch_id: 'b1', count7: '3' });
    });

    test('drops a key that holds a hyphen', () => {
        expect(sanitizeMeta({ 'batch-id': 'b1', count: '3' })).toStrictEqual({ count: '3' });
    });

    test('drops a key that holds a dot or a slash', () => {
        expect(sanitizeMeta({ 'a.b': '1', 'c/d': '2', ok: '3' })).toStrictEqual({ ok: '3' });
    });

    test('drops an empty key', () => {
        expect(sanitizeMeta({ '': '1', ok: '2' })).toStrictEqual({ ok: '2' });
    });

    test('drops an entry whose value is empty', () => {
        expect(sanitizeMeta({ branch: '', ok: '2' })).toStrictEqual({ ok: '2' });
    });

    test('drops an entry whose value is not a string', () => {
        expect(sanitizeMeta({ count: 3, ok: '2' })).toStrictEqual({ ok: '2' });
    });

    test('removes a double quote from a value so the tag attribute stays whole', () => {
        expect(sanitizeMeta({ branch: 'fix/"quoted"-name' })).toStrictEqual({ branch: 'fix/quoted-name' });
    });

    test('removes a control character from a value', () => {
        expect(sanitizeMeta({ branch: 'one\ntwo\ttab' })).toStrictEqual({ branch: 'onetwotab' });
    });

    test('drops an entry whose value holds only characters that get removed', () => {
        expect(sanitizeMeta({ branch: '"""', ok: '2' })).toStrictEqual({ ok: '2' });
    });
});
