import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { createBridgeClient } from './bridge.js';
import { createChannelServer } from './channel.js';
import type { ChannelConfig } from './config.js';

export type ChannelApp = {
    readonly connect: (transport: Transport) => Promise<void>;
    readonly stop: () => Promise<void>;
};

export type ChannelAppOptions = ChannelConfig & {
    readonly onError: (error: Error) => void;
    readonly retryDelayMs?: number;
};

export const createChannelApp = (options: ChannelAppOptions): ChannelApp => {
    const channel = createChannelServer({ resolve: ids => bridge.resolve(ids) });
    const bridge = createBridgeClient({
        bridgeUrl: options.bridgeUrl,
        token: options.token,
        ...(options.retryDelayMs === undefined ? {} : { retryDelayMs: options.retryDelayMs }),
        onBatch: batch => channel.push(batch),
        onError: options.onError
    });

    return {
        connect: async transport => {
            await channel.connect(transport);
            bridge.start();
        },
        stop: async () => {
            await bridge.stop();
            await channel.close();
        }
    };
};
