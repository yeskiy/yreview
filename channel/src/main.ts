#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createChannelApp } from './app.js';
import { parseConfig } from './config.js';
import { SERVER_NAME } from './channel.js';

const log = (message: string): void => console.error(`${SERVER_NAME}: ${message}`);

const config = ((): ReturnType<typeof parseConfig> => {
    try {
        return parseConfig(process.env);
    } catch (cause) {
        log(cause instanceof Error ? cause.message : String(cause));
        log('set Y_REVIEW_BRIDGE_URL and Y_REVIEW_BRIDGE_TOKEN, then start the server again');
        process.exit(2);
    }
})();

const app = createChannelApp({ ...config, onError: error => log(error.message) });

await app.connect(new StdioServerTransport());
log(`ready, bridge on ${config.bridgeUrl}`);

const shutDown = (): void => {
    void app.stop().finally(() => process.exit(0));
};

process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
