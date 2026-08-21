import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import { buildBatchMeta, formatBatchContent } from './format.js';
import type { ReviewBatch } from './schema.js';

export const SERVER_NAME = 'y-review';
export const SERVER_VERSION = '0.1.0';
export const CHANNEL_METHOD = 'notifications/claude/channel';

const MAX_OPEN_BATCHES = 32;

export const INSTRUCTIONS = [
    'The y-review channel carries code review comments from IntelliJ IDEA.',
    'Each event arrives as a channel tag with the source attribute set to y-review.',
    'The attributes give the branch, the commit, the comment count, and the batch id.',
    'The body of the tag lists the comments. A blank line divides two comments.',
    'The first line of a comment has this form:',
    '[id] path:startLine-endLine @revision',
    'The revision HEAD means that the comment matches the file as it is now.',
    'Any other revision is an older commit.',
    'Read that revision with the command git show <revision>:<path> before you judge the code.',
    'The mark (left side of the diff) means that the comment is on the removed side of a diff.',
    'The lines after the first line hold the text of the comment.',
    'Do these steps for each event:',
    '1. Read every comment in the body.',
    '2. Make the change that the comment asks for.',
    '3. Call review_resolve with the ids of the comments that you fixed.',
    'Copy each id exactly as the event shows it.',
    'Do not call review_resolve for a comment that you did not fix.',
    'Tell the person which comments you left open, and why.'
].join('\n');

const RESOLVE_DESCRIPTION = [
    'Report the review comments that you fixed.',
    'The IDE marks each id as resolved and removes it from the review list.',
    'Copy each id from the channel event without a change.',
    'Report a comment only after you made the change that it asks for.'
].join(' ');

export type ResolveSink = (ids: readonly string[]) => Promise<void>;

export type ReviewChannel = {
    readonly connect: (transport: Transport) => Promise<void>;
    readonly close: () => Promise<void>;
    readonly push: (batch: ReviewBatch) => Promise<void>;
};

type Match = { readonly kind: 'open'; readonly id: string } | { readonly kind: 'unknown' | 'ambiguous'; readonly given: string };

const matchOne = (given: string, open: readonly string[]): Match => {
    const prefixed = open.filter(id => id.startsWith(given));
    return open.includes(given)
        ? { kind: 'open', id: given }
        : prefixed.length === 1
          ? { kind: 'open', id: prefixed[0] as string }
          : { kind: prefixed.length === 0 ? 'unknown' : 'ambiguous', given };
};

const textResult = (text: string, isError?: true) => ({
    content: [{ type: 'text' as const, text }],
    ...(isError === undefined ? {} : { isError })
});

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const createChannelServer = (deps: { readonly resolve: ResolveSink }): ReviewChannel => {
    const openBatches = new Map<string, Set<string>>();

    const openIds = (): string[] => [...openBatches.values()].flatMap(ids => [...ids]);

    const forget = (ids: readonly string[]): void => {
        openBatches.forEach((open, batchId) => {
            ids.forEach(id => open.delete(id));
            if (open.size === 0) {
                openBatches.delete(batchId);
            }
        });
    };

    const remember = (batch: ReviewBatch): void => {
        openBatches.delete(batch.batchId);
        openBatches.set(batch.batchId, new Set(batch.comments.map(comment => comment.id)));
        [...openBatches.keys()].slice(0, Math.max(0, openBatches.size - MAX_OPEN_BATCHES)).forEach(batchId => openBatches.delete(batchId));
    };

    const mcp = new McpServer(
        { name: SERVER_NAME, version: SERVER_VERSION },
        {
            capabilities: {
                experimental: { 'claude/channel': {} },
                tools: {}
            },
            instructions: INSTRUCTIONS
        }
    );

    mcp.registerTool(
        'review_resolve',
        {
            title: 'Resolve review comments',
            description: RESOLVE_DESCRIPTION,
            inputSchema: {
                ids: z
                    .array(z.string().min(1).max(200))
                    .min(1)
                    .max(200)
                    .describe('The ids of the comments that you fixed, copied from the channel event')
            }
        },
        async ({ ids }) => {
            const matches = ids.map(given => matchOne(given, openIds()));
            const wanted = [...new Set(matches.flatMap(match => (match.kind === 'open' ? [match.id] : [])))];
            const unknown = matches.flatMap(match => (match.kind === 'unknown' ? [match.given] : []));
            const ambiguous = matches.flatMap(match => (match.kind === 'ambiguous' ? [match.given] : []));
            const notes = [
                unknown.length === 0 ? [] : [`No open comment matches these ids: ${unknown.join(', ')}.`],
                ambiguous.length === 0 ? [] : [`Several open comments match these ids: ${ambiguous.join(', ')}. Give more characters of the id.`]
            ].flat();

            if (wanted.length === 0) {
                return textResult(['Nothing was reported to the IDE.', ...notes].join(' '), true);
            }

            return deps
                .resolve(wanted)
                .then(() => {
                    forget(wanted);
                    return textResult(
                        [`Reported ${String(wanted.length)} ${wanted.length === 1 ? 'comment' : 'comments'} to the IDE as resolved.`, ...notes].join(' ')
                    );
                })
                .catch((error: unknown) =>
                    textResult(
                        [`The IDE did not accept the report, so the comments stay open. Reason: ${reasonOf(error)}.`, ...notes].join(' '),
                        true
                    )
                );
        }
    );

    return {
        connect: transport => mcp.connect(transport),
        close: () => mcp.close(),
        push: async batch => {
            if (batch.comments.length === 0) {
                return;
            }
            remember(batch);
            await mcp.server.notification({
                method: CHANNEL_METHOD,
                params: { content: formatBatchContent(batch), meta: buildBatchMeta(batch) }
            });
        }
    };
};
