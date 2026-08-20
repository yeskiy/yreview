import { ReviewBatchSchema, type ReviewBatch } from './schema.js';

export const TOKEN_HEADER = 'x-idea-review-token';
export const EVENTS_PATH = '/events';
export const RESOLVE_PATH = '/resolve';

const DEFAULT_RETRY_DELAY_MS = 1000;
const MAX_EVENT_BYTES = 4_000_000;

export type BridgeClient = {
    readonly start: () => void;
    readonly stop: () => Promise<void>;
    readonly resolve: (ids: readonly string[]) => Promise<void>;
};

export type BridgeOptions = {
    readonly bridgeUrl: string;
    readonly token: string;
    readonly onBatch: (batch: ReviewBatch) => void | Promise<void>;
    readonly onError: (error: Error) => void;
    readonly retryDelayMs?: number;
};

const asError = (cause: unknown): Error => (cause instanceof Error ? cause : new Error(String(cause)));

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Takes whole Server-Sent Events out of the buffer and returns the part that is still incomplete. */
export const drainEvents = (buffer: string, onEvent: (data: string) => void): string => {
    const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n');
    const rest = blocks.pop() ?? '';
    blocks
        .map(block =>
            block
                .split('\n')
                .filter(line => line.startsWith('data:'))
                .map(line => line.slice('data:'.length).replace(/^ /, ''))
                .join('\n')
        )
        .filter(data => data.length > 0)
        .forEach(onEvent);
    return rest;
};

export const createBridgeClient = (options: BridgeOptions): BridgeClient => {
    const state: { running: boolean; controller: AbortController | undefined } = { running: false, controller: undefined };
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

    const handleEvent = (data: string): void => {
        const parsed = ((): unknown => {
            try {
                return JSON.parse(data);
            } catch (cause) {
                options.onError(new Error(`the bridge sent an event that is not JSON: ${asError(cause).message}`));
                return undefined;
            }
        })();
        if (parsed === undefined) {
            return;
        }
        const batch = ReviewBatchSchema.safeParse(parsed);
        if (!batch.success) {
            options.onError(new Error(`the bridge sent a batch that does not match the contract: ${batch.error.message}`));
            return;
        }
        Promise.resolve(options.onBatch(batch.data)).catch((cause: unknown) => options.onError(asError(cause)));
    };

    const readStream = async (body: ReadableStream<Uint8Array>): Promise<void> => {
        const reader = body.pipeThrough(new TextDecoderStream()).getReader();
        const carry = { buffer: '' };
        try {
            while (state.running) {
                const { done, value } = await reader.read();
                if (done) {
                    return;
                }
                if (carry.buffer.length + (value?.length ?? 0) > MAX_EVENT_BYTES) {
                    carry.buffer = '';
                    options.onError(new Error('the bridge sent an event that is too large, so it was dropped'));
                    continue;
                }
                carry.buffer = drainEvents(carry.buffer + (value ?? ''), handleEvent);
            }
        } finally {
            await reader.cancel().catch(() => undefined);
        }
    };

    const openStream = async (): Promise<void> => {
        const controller = new AbortController();
        state.controller = controller;
        const response = await fetch(`${options.bridgeUrl}${EVENTS_PATH}`, {
            headers: { accept: 'text/event-stream', [TOKEN_HEADER]: options.token },
            signal: controller.signal,
            redirect: 'error'
        });
        if (!response.ok) {
            throw new Error(`the bridge refused the event stream with status ${String(response.status)}`);
        }
        if (response.body === null) {
            throw new Error('the bridge answered the event stream with no body');
        }
        await readStream(response.body);
    };

    const loop = async (): Promise<void> => {
        while (state.running) {
            try {
                await openStream();
            } catch (cause) {
                if (state.running) {
                    options.onError(asError(cause));
                }
            }
            if (state.running) {
                await sleep(retryDelayMs);
            }
        }
    };

    return {
        start: () => {
            if (state.running) {
                return;
            }
            state.running = true;
            void loop();
        },
        stop: async () => {
            state.running = false;
            state.controller?.abort();
            state.controller = undefined;
            await sleep(0);
        },
        resolve: async ids => {
            const response = await fetch(`${options.bridgeUrl}${RESOLVE_PATH}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', [TOKEN_HEADER]: options.token },
                body: JSON.stringify({ ids }),
                redirect: 'error'
            });
            if (!response.ok) {
                throw new Error(`the bridge refused the report with status ${String(response.status)}`);
            }
            await response.arrayBuffer();
        }
    };
};
