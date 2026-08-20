import { describe, expect, test } from 'vitest';
import { ReviewBatchSchema } from '../src/schema.js';

const comment = {
    id: 'c3f9a12aabbccddeeff00112233445566778899a',
    path: 'src/main/kotlin/Parser.kt',
    startLine: 88,
    endLine: 94,
    revision: 'HEAD',
    text: 'This branch never runs when the input is empty.'
};

const batchWith = (extra: Record<string, unknown>): unknown => ({
    batchId: 'b7f2a91',
    branch: 'feat/channel-server',
    commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
    comments: [comment],
    ...extra
});

const accepts = (value: unknown): boolean => ReviewBatchSchema.safeParse(value).success;

describe('ReviewBatchSchema', () => {
    test('accepts a batch that follows the contract', () => {
        expect(accepts(batchWith({}))).toBe(true);
    });

    test('accepts the left and the right side of a diff', () => {
        expect(accepts(batchWith({ comments: [{ ...comment, side: 'left' }] }))).toBe(true);
        expect(accepts(batchWith({ comments: [{ ...comment, side: 'right' }] }))).toBe(true);
    });

    test('rejects a side that is neither left nor right', () => {
        expect(accepts(batchWith({ comments: [{ ...comment, side: 'middle' }] }))).toBe(false);
    });

    test('rejects a field that the contract does not name', () => {
        expect(accepts(batchWith({ author: 'someone@example.com' }))).toBe(false);
    });

    test('rejects a comment field that the contract does not name', () => {
        expect(accepts(batchWith({ comments: [{ ...comment, resolved: true }] }))).toBe(false);
    });

    test('rejects a path that holds a line break', () => {
        expect(accepts(batchWith({ comments: [{ ...comment, path: 'a.kt\nb.kt' }] }))).toBe(false);
    });

    test('rejects a branch that holds a line break', () => {
        expect(accepts(batchWith({ branch: 'main\nother' }))).toBe(false);
    });

    test('rejects an id that holds a character outside the safe set', () => {
        expect(accepts(batchWith({ comments: [{ ...comment, id: 'c3f9a12 <tag>' }] }))).toBe(false);
    });

    test('rejects a batch id that holds a character outside the safe set', () => {
        expect(accepts(batchWith({ batchId: 'b7f2a91/../etc' }))).toBe(false);
    });

    test('rejects a line number that is not a whole number', () => {
        expect(accepts(batchWith({ comments: [{ ...comment, startLine: 1.5 }] }))).toBe(false);
    });

    test('rejects a negative line number', () => {
        expect(accepts(batchWith({ comments: [{ ...comment, startLine: -1 }] }))).toBe(false);
    });

    test('rejects a batch that carries no comment', () => {
        expect(accepts(batchWith({ comments: [] }))).toBe(false);
    });

    test('rejects a batch that carries more than 200 comments', () => {
        expect(accepts(batchWith({ comments: Array.from({ length: 201 }, () => comment) }))).toBe(false);
    });

    test('rejects a comment text longer than 20000 characters', () => {
        expect(accepts(batchWith({ comments: [{ ...comment, text: 'x'.repeat(20_001) }] }))).toBe(false);
    });

    test('rejects a comment with no text', () => {
        expect(accepts(batchWith({ comments: [{ ...comment, text: '' }] }))).toBe(false);
    });

    test('rejects a value that is not an object', () => {
        expect(accepts('a batch')).toBe(false);
        expect(accepts(null)).toBe(false);
    });
});
