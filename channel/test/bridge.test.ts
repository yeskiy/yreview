import { afterEach, describe, expect, test } from 'vitest';
import { createBridgeClient } from '../src/bridge.js';
import { startFakeBridge, type FakeBridge } from '../src/fakeBridge.js';
import type { ReviewBatch } from '../src/schema.js';

const validBatch = {
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
            text: 'This branch never runs when the input is empty.'
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

describe('the bridge client', () => {
    const running: { bridge: FakeBridge | undefined; stop: (() => Promise<void>) | undefined } = { bridge: undefined, stop: undefined };

    const connect = async (token?: string) => {
        const bridge = await startFakeBridge();
        const batches: ReviewBatch[] = [];
        const errors: Error[] = [];
        const client = createBridgeClient({
            bridgeUrl: bridge.url,
            token: token ?? bridge.token,
            retryDelayMs: 20,
            onBatch: batch => {
                batches.push(batch);
            },
            onError: error => {
                errors.push(error);
            }
        });
        running.bridge = bridge;
        running.stop = client.stop;
        client.start();
        return { bridge, client, batches, errors };
    };

    afterEach(async () => {
        await running.stop?.();
        await running.bridge?.close();
        running.stop = undefined;
        running.bridge = undefined;
    });

    test('receives a batch that the bridge pushed', async () => {
        const { bridge, batches } = await connect();
        await bridge.waitForStream();
        bridge.push(validBatch);
        await waitFor(() => batches.length === 1, 'the batch');
        expect(batches[0]?.batchId).toBe('b7f2a91');
    });

    test('sends the token on the events request', async () => {
        const { bridge } = await connect();
        await bridge.waitForStream();
        expect(bridge.streamTokens).toStrictEqual([bridge.token]);
    });

    test('reports an error when the bridge refuses the token', async () => {
        const { errors } = await connect('a-wrong-token-of-32-characters-00');
        await waitFor(() => errors.length > 0, 'the error');
        expect(errors[0]?.message).toContain('401');
    });

    test('reports an error and keeps the stream open when a batch does not match the schema', async () => {
        const { bridge, batches, errors } = await connect();
        await bridge.waitForStream();
        bridge.pushRaw(JSON.stringify({ batchId: 'b1', branch: 'main' }));
        await waitFor(() => errors.length > 0, 'the error');
        bridge.push(validBatch);
        await waitFor(() => batches.length === 1, 'the good batch');
        expect(batches[0]?.batchId).toBe('b7f2a91');
    });

    test('reports an error when a pushed event is not JSON', async () => {
        const { bridge, errors } = await connect();
        await bridge.waitForStream();
        bridge.pushRaw('this is not json');
        await waitFor(() => errors.length > 0, 'the error');
        expect(errors).toHaveLength(1);
    });

    test('opens the stream again after the bridge dropped it', async () => {
        const { bridge, batches } = await connect();
        await bridge.waitForStream();
        bridge.dropStreams();
        await waitFor(() => bridge.streamTokens.length === 2, 'the second stream');
        bridge.push(validBatch);
        await waitFor(() => batches.length === 1, 'the batch after the reconnect');
        expect(batches).toHaveLength(1);
    });

    test('posts the resolved ids to the bridge', async () => {
        const { bridge, client } = await connect();
        await client.resolve(['c3f9a12aabbccddeeff00112233445566778899a']);
        expect(bridge.resolved).toStrictEqual([['c3f9a12aabbccddeeff00112233445566778899a']]);
    });

    test('sends the token on the resolve request', async () => {
        const { bridge, client } = await connect();
        await client.resolve(['c3f9a12aabbccddeeff00112233445566778899a']);
        expect(bridge.resolveTokens).toStrictEqual([bridge.token]);
    });

    test('fails the resolve call when the bridge refuses the token', async () => {
        const { client } = await connect('a-wrong-token-of-32-characters-00');
        await expect(client.resolve(['c3f9a12aabbccddeeff00112233445566778899a'])).rejects.toThrow(/401/);
    });

    test('fails the resolve call when the bridge is gone', async () => {
        const { bridge, client } = await connect();
        await bridge.close();
        running.bridge = undefined;
        await expect(client.resolve(['c3f9a12aabbccddeeff00112233445566778899a'])).rejects.toThrow();
    });
});
