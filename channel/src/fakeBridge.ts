import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { TOKEN_HEADER } from './bridge.js';

const MAX_BODY_BYTES = 1_000_000;

export type FakeBridge = {
    readonly url: string;
    readonly token: string;
    readonly resolved: string[][];
    readonly streamTokens: string[];
    readonly resolveTokens: string[];
    readonly push: (batch: unknown) => void;
    readonly pushRaw: (data: string) => void;
    readonly dropStreams: () => void;
    readonly waitForStream: () => Promise<void>;
    readonly close: () => Promise<void>;
};

const readBody = (request: IncomingMessage): Promise<string> =>
    new Promise((resolve, reject) => {
        const parts: Buffer[] = [];
        const state = { size: 0 };
        request.on('data', (chunk: Buffer) => {
            state.size += chunk.length;
            if (state.size > MAX_BODY_BYTES) {
                request.destroy();
                reject(new Error('the body is too large'));
                return;
            }
            parts.push(chunk);
        });
        request.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
        request.on('error', reject);
    });

const answer = (response: ServerResponse, status: number, body: string): void => {
    response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(body);
};

export type FakeBridgeOptions = {
    readonly token?: string;
    readonly onResolve?: (ids: readonly string[]) => void;
};

export const startFakeBridge = async (options: FakeBridgeOptions = {}): Promise<FakeBridge> => {
    const token = options.token ?? randomBytes(24).toString('hex');
    const streams = new Set<ServerResponse>();
    const resolved: string[][] = [];
    const streamTokens: string[] = [];
    const resolveTokens: string[] = [];
    const waiters: (() => void)[] = [];

    const pushRaw = (data: string): void => {
        streams.forEach(stream => stream.write(`data: ${data.replace(/\n/g, '\ndata: ')}\n\n`));
    };

    const server = createServer((request, response) => {
        const given = request.headers[TOKEN_HEADER];
        const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;

        if (request.method === 'GET' && path === '/events') {
            streamTokens.push(typeof given === 'string' ? given : '');
            if (given !== token) {
                answer(response, 401, 'the token does not match');
                return;
            }
            response.writeHead(200, {
                'content-type': 'text/event-stream',
                'cache-control': 'no-store',
                connection: 'keep-alive'
            });
            response.write(': open\n\n');
            streams.add(response);
            response.on('close', () => streams.delete(response));
            waiters.splice(0).forEach(waiter => waiter());
            return;
        }

        if (request.method === 'POST' && path === '/resolve') {
            resolveTokens.push(typeof given === 'string' ? given : '');
            if (given !== token) {
                answer(response, 401, 'the token does not match');
                return;
            }
            readBody(request)
                .then(body => {
                    const parsed = JSON.parse(body) as { ids?: unknown };
                    if (!Array.isArray(parsed.ids) || parsed.ids.some(id => typeof id !== 'string')) {
                        answer(response, 400, 'the body must hold an ids array of strings');
                        return;
                    }
                    resolved.push(parsed.ids as string[]);
                    options.onResolve?.(parsed.ids as string[]);
                    answer(response, 200, 'ok');
                })
                .catch(() => answer(response, 400, 'the body did not parse'));
            return;
        }

        answer(response, 404, 'unknown path');
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;

    return {
        url: `http://127.0.0.1:${String(port)}`,
        token,
        resolved,
        streamTokens,
        resolveTokens,
        push: batch => pushRaw(JSON.stringify(batch)),
        pushRaw,
        dropStreams: () => {
            streams.forEach(stream => stream.end());
            streams.clear();
        },
        waitForStream: () =>
            streams.size > 0 ? Promise.resolve() : new Promise<void>(resolve => waiters.push(resolve)),
        close: async () => {
            streams.forEach(stream => stream.destroy());
            streams.clear();
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    };
};

const runFromStdin = async (): Promise<void> => {
    const fromEnv = process.env['Y_REVIEW_BRIDGE_TOKEN'];
    const bridge = await startFakeBridge({
        ...(fromEnv === undefined ? {} : { token: fromEnv }),
        onResolve: ids => console.error(`the model resolved: ${ids.join(', ')}`)
    });
    console.error('fake bridge running. Put these two values in the MCP configuration file:');
    console.error(`Y_REVIEW_BRIDGE_URL=${bridge.url}`);
    console.error(`Y_REVIEW_BRIDGE_TOKEN=${bridge.token}`);
    console.error('Paste one batch as one line of JSON, then press Enter.');
    createInterface({ input: process.stdin }).on('line', line => {
        if (line.trim().length === 0) {
            return;
        }
        bridge.pushRaw(line.trim());
        console.error('pushed the batch to the channel');
    });
};

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
    await runFromStdin();
}
