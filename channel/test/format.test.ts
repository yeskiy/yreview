import { describe, expect, test } from 'vitest';
import { formatBatchContent } from '../src/format.js';
import type { ReviewBatch } from '../src/schema.js';

const batchOf = (overrides: Partial<ReviewBatch>): ReviewBatch => ({
    batchId: 'b7f2a91',
    branch: 'feat/channel-server',
    commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
    comments: [],
    ...overrides
});

describe('formatBatchContent', () => {
    test('puts the short id, the path, the range, and the revision on the first line', () => {
        expect(
            formatBatchContent(
                batchOf({
                    comments: [
                        {
                            id: 'c3f9a12aabbccddeeff00112233445566778899a',
                            path: 'src/main/kotlin/Parser.kt',
                            startLine: 88,
                            endLine: 94,
                            revision: 'HEAD',
                            text: 'This branch never runs when the input is empty. Add the guard before the loop.'
                        }
                    ]
                })
            )
        ).toBe(
            '[c3f9a12] src/main/kotlin/Parser.kt:88-94 @HEAD\n' +
                'This branch never runs when the input is empty. Add the guard before the loop.'
        );
    });

    test('renders the revision as HEAD when it equals the batch commit', () => {
        expect(
            formatBatchContent(
                batchOf({
                    commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
                    comments: [
                        {
                            id: 'c3f9a12aabbccddeeff00112233445566778899a',
                            path: 'a.kt',
                            startLine: 1,
                            endLine: 1,
                            revision: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
                            text: 'text'
                        }
                    ]
                })
            )
        ).toBe('[c3f9a12] a.kt:1-1 @HEAD\ntext');
    });

    test('renders a short revision for an older commit', () => {
        expect(
            formatBatchContent(
                batchOf({
                    comments: [
                        {
                            id: 'a7710de0011223344556677889900aabbccddeef',
                            path: 'src/main/kotlin/Lexer.kt',
                            startLine: 12,
                            endLine: 12,
                            revision: '4f2c8b10000000000000000000000000000000ff',
                            text: 'This was already wrong before the change. Fix it in the same pass.'
                        }
                    ]
                })
            )
        ).toBe(
            '[a7710de] src/main/kotlin/Lexer.kt:12-12 @4f2c8b1\n' +
                'This was already wrong before the change. Fix it in the same pass.'
        );
    });

    test('marks a comment taken from the left side of the diff', () => {
        expect(
            formatBatchContent(
                batchOf({
                    comments: [
                        {
                            id: 'a7710de0011223344556677889900aabbccddeef',
                            path: 'src/main/kotlin/Lexer.kt',
                            startLine: 12,
                            endLine: 12,
                            revision: '4f2c8b10000000000000000000000000000000ff',
                            side: 'left',
                            text: 'This was already wrong before the change. Fix it in the same pass.'
                        }
                    ]
                })
            )
        ).toBe(
            '[a7710de] src/main/kotlin/Lexer.kt:12-12 @4f2c8b1 (left side of the diff)\n' +
                'This was already wrong before the change. Fix it in the same pass.'
        );
    });

    test('does not mark a comment taken from the right side of the diff', () => {
        expect(
            formatBatchContent(
                batchOf({
                    comments: [
                        {
                            id: 'a7710de0011223344556677889900aabbccddeef',
                            path: 'a.kt',
                            startLine: 3,
                            endLine: 3,
                            revision: 'HEAD',
                            side: 'right',
                            text: 'text'
                        }
                    ]
                })
            )
        ).toBe('[a7710de] a.kt:3-3 @HEAD\ntext');
    });

    test('separates two entries with one blank line', () => {
        expect(
            formatBatchContent(
                batchOf({
                    comments: [
                        { id: 'aaaaaaa1111111111111111111111111111111111', path: 'a.kt', startLine: 1, endLine: 2, revision: 'HEAD', text: 'first' },
                        { id: 'bbbbbbb2222222222222222222222222222222222', path: 'b.kt', startLine: 3, endLine: 4, revision: 'HEAD', text: 'second' }
                    ]
                })
            )
        ).toBe('[aaaaaaa] a.kt:1-2 @HEAD\nfirst\n\n[bbbbbbb] b.kt:3-4 @HEAD\nsecond');
    });

    test('keeps a comment text that spans several lines', () => {
        expect(
            formatBatchContent(
                batchOf({
                    comments: [{ id: 'aaaaaaa1111111111111111111111111111111111', path: 'a.kt', startLine: 1, endLine: 1, revision: 'HEAD', text: 'first line\nsecond line' }]
                })
            )
        ).toBe('[aaaaaaa] a.kt:1-1 @HEAD\nfirst line\nsecond line');
    });

    test('removes leading and trailing blank space from the comment text', () => {
        expect(
            formatBatchContent(
                batchOf({
                    comments: [{ id: 'aaaaaaa1111111111111111111111111111111111', path: 'a.kt', startLine: 1, endLine: 1, revision: 'HEAD', text: '\n  padded  \n\n' }]
                })
            )
        ).toBe('[aaaaaaa] a.kt:1-1 @HEAD\npadded');
    });

    test('returns an empty string for a batch with no comments', () => {
        expect(formatBatchContent(batchOf({}))).toBe('');
    });
});
