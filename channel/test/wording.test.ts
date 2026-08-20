import { describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createChannelServer } from '../src/channel.js';
import type { ReviewBatch } from '../src/schema.js';

const batch: ReviewBatch = {
    batchId: 'b7f2a91',
    branch: 'main',
    commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
    comments: [
        { id: 'aaaaaaa1111111111111111111111111111111111', path: 'a.kt', startLine: 1, endLine: 1, revision: 'HEAD', text: 'one' },
        { id: 'bbbbbbb2222222222222222222222222222222222', path: 'b.kt', startLine: 2, endLine: 2, revision: 'HEAD', text: 'two' }
    ]
};

const textOf = (result: unknown): string =>
    ((result as { content: { type: string; text: string }[] }).content ?? []).map(part => part.text).join('\n');

const setUp = async () => {
    const channel = createChannelServer({ resolve: () => Promise.resolve() });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([channel.connect(serverTransport), client.connect(clientTransport)]);
    await channel.push(batch);
    return client;
};

describe('the words that the model reads', () => {
    test('counts one comment in the singular', async () => {
        const client = await setUp();
        const result = await client.callTool({ name: 'review_resolve', arguments: { ids: ['aaaaaaa'] } });
        expect(textOf(result)).toBe('Reported 1 comment to the IDE as resolved.');
    });

    test('counts two comments in the plural', async () => {
        const client = await setUp();
        const result = await client.callTool({ name: 'review_resolve', arguments: { ids: ['aaaaaaa', 'bbbbbbb'] } });
        expect(textOf(result)).toBe('Reported 2 comments to the IDE as resolved.');
    });
});
