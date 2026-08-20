const MIN_TOKEN_LENGTH = 16;

const LOOPBACK_NAMES = new Set(['localhost', '[::1]', '::1']);

const IPV4 = /^(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

export type ChannelConfig = {
    readonly bridgeUrl: string;
    readonly token: string;
};

const isLoopback = (hostname: string): boolean =>
    LOOPBACK_NAMES.has(hostname.toLowerCase()) || IPV4.exec(hostname)?.[1] === '127';

const parseUrl = (raw: string): URL => {
    try {
        return new URL(raw);
    } catch {
        throw new Error(`IDEA_REVIEW_BRIDGE_URL is not an address: ${raw}`);
    }
};

const checkUrl = (raw: string): string => {
    const url = parseUrl(raw);
    if (url.protocol !== 'http:') {
        throw new Error(`IDEA_REVIEW_BRIDGE_URL must use http, not ${url.protocol.replace(':', '')}`);
    }
    if (!isLoopback(url.hostname)) {
        throw new Error(`IDEA_REVIEW_BRIDGE_URL must point at the loopback address, not ${url.hostname}`);
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
};

const checkToken = (raw: string | undefined): string => {
    if (raw === undefined || raw.length < MIN_TOKEN_LENGTH) {
        throw new Error(`IDEA_REVIEW_BRIDGE_TOKEN must hold at least ${String(MIN_TOKEN_LENGTH)} characters`);
    }
    return raw;
};

export const parseConfig = (env: Record<string, string | undefined>): ChannelConfig => ({
    bridgeUrl: checkUrl(env['IDEA_REVIEW_BRIDGE_URL'] ?? ''),
    token: checkToken(env['IDEA_REVIEW_BRIDGE_TOKEN'])
});
