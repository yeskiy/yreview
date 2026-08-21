import { beforeEach, describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Notification } from '@modelcontextprotocol/sdk/types.js';
import { CHANNEL_METHOD, SERVER_NAME, createChannelServer } from '../src/channel.js';
import type { ReviewBatch } from '../src/schema.js';

const batch: ReviewBatch = {
    batchId: 'b7f2a91',
    branch: 'feat/channel-server',
    commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
    comments: [
        {
            id: 'c3f9a12aabbccddeeff00112233445566778899a',
            path: 'src/main/kotlin/Parser.kt',
            startLine: 88,
            endLine: 94,
            revision: 'HEAD',
            text: 'This branch never runs when the input is empty. Add the guard before the loop.'
        },
        {
            id: 'a7710de0011223344556677889900aabbccddeef',
            path: 'src/main/kotlin/Lexer.kt',
            startLine: 12,
            endLine: 12,
            revision: '1111111000000000000000000000000000000000',
            side: 'left',
            text: 'This was already wrong before the change. Fix it in the same pass.'
        }
    ]
};

const textOf = (result: unknown): string =>
    ((result as { content: { type: string; text: string }[] }).content ?? []).map(part => part.text).join('\n');

describe('the y-review channel', () => {
    const reported: string[][] = [];
    const failures: string[] = [];

    const setUp = async () => {
        const channel = createChannelServer({
            resolve: ids => {
                if (failures.length > 0) {
                    return Promise.reject(new Error(failures[0]));
                }
                reported.push([...ids]);
                return Promise.resolve();
            }
        });
        const notifications: Notification[] = [];
        const client = new Client({ name: 'test-client', version: '0.0.0' });
        client.fallbackNotificationHandler = notification => {
            notifications.push(notification);
            return Promise.resolve();
        };
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([channel.connect(serverTransport), client.connect(clientTransport)]);
        return { channel, client, notifications };
    };

    beforeEach(() => {
        reported.length = 0;
        failures.length = 0;
    });

    test('declares the claude/channel capability', async () => {
        const { client } = await setUp();
        expect(client.getServerCapabilities()?.experimental).toMatchObject({ 'claude/channel': {} });
    });

    test('declares the tools capability so the reply tool is discovered', async () => {
        const { client } = await setUp();
        expect(client.getServerCapabilities()?.tools).toBeDefined();
    });

    test('sends instructions that name the review_resolve tool', async () => {
        const { client } = await setUp();
        expect(client.getInstructions()).toContain('review_resolve');
    });

    test('is named y-review so the source attribute reads y-review', () => {
        expect(SERVER_NAME).toBe('y-review');
    });

    test('offers the review_resolve tool with an ids array', async () => {
        const { client } = await setUp();
        const tool = (await client.listTools()).tools.find(entry => entry.name === 'review_resolve');
        expect(tool?.inputSchema.properties).toHaveProperty('ids');
    });

    test('emits one notification for one batch', async () => {
        const { channel, notifications } = await setUp();
        await channel.push(batch);
        expect(notifications).toHaveLength(1);
    });

    test('emits the notification under the channel method', async () => {
        const { channel, notifications } = await setUp();
        await channel.push(batch);
        expect(notifications[0]?.method).toBe(CHANNEL_METHOD);
        expect(CHANNEL_METHOD).toBe('notifications/claude/channel');
    });

    test('puts the formatted comments in the content field', async () => {
        const { channel, notifications } = await setUp();
        await channel.push(batch);
        expect(notifications[0]?.params?.content).toBe(
            '[c3f9a12] src/main/kotlin/Parser.kt:88-94 @HEAD\n' +
                'This branch never runs when the input is empty. Add the guard before the loop.\n' +
                '\n' +
                '[a7710de] src/main/kotlin/Lexer.kt:12-12 @1111111 (left side of the diff)\n' +
                'This was already wrong before the change. Fix it in the same pass.'
        );
    });

    test('puts the branch, the commit, the count, and the batch id in the meta field', async () => {
        const { channel, notifications } = await setUp();
        await channel.push(batch);
        expect(notifications[0]?.params?.meta).toStrictEqual({
            branch: 'feat/channel-server',
            commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
            count: '2',
            batch_id: 'b7f2a91'
        });
    });

    test('does not emit a notification for a batch with no comments', async () => {
        const { channel, notifications } = await setUp();
        await channel.push({ ...batch, comments: [] });
        expect(notifications).toHaveLength(0);
    });

    test('reports the full id to the bridge when the model gives the short id', async () => {
        const { channel, client } = await setUp();
        await channel.push(batch);
        await client.callTool({ name: 'review_resolve', arguments: { ids: ['c3f9a12'] } });
        expect(reported).toStrictEqual([['c3f9a12aabbccddeeff00112233445566778899a']]);
    });

    test('reports the full id to the bridge when the model gives the full id', async () => {
        const { channel, client } = await setUp();
        await channel.push(batch);
        await client.callTool({ name: 'review_resolve', arguments: { ids: ['a7710de0011223344556677889900aabbccddeef'] } });
        expect(reported).toStrictEqual([['a7710de0011223344556677889900aabbccddeef']]);
    });

    test('reports several ids in one call to the bridge', async () => {
        const { channel, client } = await setUp();
        await channel.push(batch);
        await client.callTool({ name: 'review_resolve', arguments: { ids: ['c3f9a12', 'a7710de'] } });
        expect(reported).toStrictEqual([
            ['c3f9a12aabbccddeeff00112233445566778899a', 'a7710de0011223344556677889900aabbccddeef']
        ]);
    });

    test('does not report an id that matches no open comment', async () => {
        const { channel, client } = await setUp();
        await channel.push(batch);
        await client.callTool({ name: 'review_resolve', arguments: { ids: ['c3f9a12', 'ffffff0'] } });
        expect(reported).toStrictEqual([['c3f9a12aabbccddeeff00112233445566778899a']]);
    });

    test('names the id that matches no open comment in the tool result', async () => {
        const { channel, client } = await setUp();
        await channel.push(batch);
        const result = await client.callTool({ name: 'review_resolve', arguments: { ids: ['c3f9a12', 'ffffff0'] } });
        expect(textOf(result)).toContain('ffffff0');
    });

    test('fails the tool call when no id matches an open comment', async () => {
        const { channel, client } = await setUp();
        await channel.push(batch);
        const result = await client.callTool({ name: 'review_resolve', arguments: { ids: ['ffffff0'] } });
        expect(result.isError).toBe(true);
    });

    test('does not report an id that several open comments match', async () => {
        const { channel, client } = await setUp();
        await channel.push({
            ...batch,
            comments: [
                { id: 'dd11111111111111111111111111111111111111', path: 'a.kt', startLine: 1, endLine: 1, revision: 'HEAD', text: 'one' },
                { id: 'dd22222222222222222222222222222222222222', path: 'b.kt', startLine: 2, endLine: 2, revision: 'HEAD', text: 'two' }
            ]
        });
        const result = await client.callTool({ name: 'review_resolve', arguments: { ids: ['dd'] } });
        expect(result.isError).toBe(true);
        expect(reported).toStrictEqual([]);
    });

    test('forgets a comment after the bridge accepted it', async () => {
        const { channel, client } = await setUp();
        await channel.push(batch);
        await client.callTool({ name: 'review_resolve', arguments: { ids: ['c3f9a12'] } });
        const again = await client.callTool({ name: 'review_resolve', arguments: { ids: ['c3f9a12'] } });
        expect(again.isError).toBe(true);
    });

    test('keeps the comment open when the bridge call fails', async () => {
        const { channel, client } = await setUp();
        await channel.push(batch);
        failures.push('the bridge is gone');
        const failed = await client.callTool({ name: 'review_resolve', arguments: { ids: ['c3f9a12'] } });
        expect(failed.isError).toBe(true);
        expect(textOf(failed)).toContain('the bridge is gone');
        failures.length = 0;
        await client.callTool({ name: 'review_resolve', arguments: { ids: ['c3f9a12'] } });
        expect(reported).toStrictEqual([['c3f9a12aabbccddeeff00112233445566778899a']]);
    });

    test('rejects a call that carries no ids', async () => {
        const { client } = await setUp();
        const result = await client.callTool({ name: 'review_resolve', arguments: { ids: [] } });
        expect(result.isError).toBe(true);
    });

    test('drops the oldest batch when too many batches stay open', async () => {
        const { channel, client } = await setUp();
        await Promise.all(
            Array.from({ length: 40 }, (_unused, index) =>
                channel.push({
                    ...batch,
                    batchId: `batch${index}`,
                    comments: [
                        {
                            id: `${String(index).padStart(4, '0')}aaaabbbbccccddddeeeeffff00001111`,
                            path: 'a.kt',
                            startLine: 1,
                            endLine: 1,
                            revision: 'HEAD',
                            text: 'one'
                        }
                    ]
                })
            )
        );
        const oldest = await client.callTool({ name: 'review_resolve', arguments: { ids: ['0000aaa'] } });
        const newest = await client.callTool({ name: 'review_resolve', arguments: { ids: ['0039aaa'] } });
        expect(oldest.isError).toBe(true);
        expect(newest.isError).toBeFalsy();
    });
});
