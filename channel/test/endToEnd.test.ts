import { afterEach, describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Notification } from '@modelcontextprotocol/sdk/types.js';
import { createChannelApp } from '../src/app.js';
import { startFakeBridge, type FakeBridge } from '../src/fakeBridge.js';

const batch = {
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
        }
    ]
};

const waitFor = async (check: () => boolean, what: string): Promise<void> => {
    const deadline = Date.now() + 5000;
    while (!check()) {
        if (Date.now() > deadline) {
            throw new Error(`gave up waiting for ${what}`);
        }
        await new Promise(resolve => setTimeout(resolve, 10));
    }
};

describe('the channel wired to a bridge', () => {
    const running: { bridge: FakeBridge | undefined; stop: (() => Promise<void>) | undefined } = { bridge: undefined, stop: undefined };

    const setUp = async () => {
        const bridge = await startFakeBridge();
        const errors: Error[] = [];
        const app = createChannelApp({
            bridgeUrl: bridge.url,
            token: bridge.token,
            retryDelayMs: 20,
            onError: error => {
                errors.push(error);
            }
        });
        const notifications: Notification[] = [];
        const client = new Client({ name: 'test-client', version: '0.0.0' });
        client.fallbackNotificationHandler = notification => {
            notifications.push(notification);
            return Promise.resolve();
        };
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([app.connect(serverTransport), client.connect(clientTransport)]);
        running.bridge = bridge;
        running.stop = app.stop;
        await bridge.waitForStream();
        return { bridge, client, notifications, errors };
    };

    afterEach(async () => {
        await running.stop?.();
        await running.bridge?.close();
        running.stop = undefined;
        running.bridge = undefined;
    });

    test('turns a batch from the bridge into one channel notification', async () => {
        const { bridge, notifications } = await setUp();
        bridge.push(batch);
        await waitFor(() => notifications.length === 1, 'the notification');
        expect(notifications[0]?.method).toBe('notifications/claude/channel');
        expect(notifications[0]?.params?.content).toBe(
            '[c3f9a12] src/main/kotlin/Parser.kt:88-94 @HEAD\n' +
                'This branch never runs when the input is empty. Add the guard before the loop.'
        );
        expect(notifications[0]?.params?.meta).toStrictEqual({
            branch: 'feat/channel-server',
            commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
            count: '1',
            batch_id: 'b7f2a91'
        });
    });

    test('sends the full id back to the bridge when the model resolves the short id', async () => {
        const { bridge, client, notifications } = await setUp();
        bridge.push(batch);
        await waitFor(() => notifications.length === 1, 'the notification');
        const result = await client.callTool({ name: 'review_resolve', arguments: { ids: ['c3f9a12'] } });
        expect(result.isError).toBeFalsy();
        expect(bridge.resolved).toStrictEqual([['c3f9a12aabbccddeeff00112233445566778899a']]);
    });

    test('reports a batch that does not match the contract without stopping the stream', async () => {
        const { bridge, notifications, errors } = await setUp();
        bridge.pushRaw(JSON.stringify({ batchId: 'b1' }));
        await waitFor(() => errors.length > 0, 'the error');
        bridge.push(batch);
        await waitFor(() => notifications.length === 1, 'the good notification');
        expect(notifications).toHaveLength(1);
    });
});
