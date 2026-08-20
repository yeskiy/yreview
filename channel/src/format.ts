import type { ReviewBatch, ReviewComment } from './schema.js';

const SHORT_LENGTH = 7;

const short = (value: string): string => value.slice(0, SHORT_LENGTH);

const revisionLabel = (comment: ReviewComment, headCommit: string): string =>
    comment.revision === 'HEAD' || comment.revision === headCommit ? 'HEAD' : short(comment.revision);

const sideLabel = (comment: ReviewComment): string => (comment.side === 'left' ? ' (left side of the diff)' : '');

const formatComment = (comment: ReviewComment, headCommit: string): string =>
    `[${short(comment.id)}] ${comment.path}:${comment.startLine}-${comment.endLine}` +
    ` @${revisionLabel(comment, headCommit)}${sideLabel(comment)}\n${comment.text.trim()}`;

export const formatBatchContent = (batch: ReviewBatch): string =>
    batch.comments.map(comment => formatComment(comment, batch.commit)).join('\n\n');

const META_KEY = /^[A-Za-z0-9_]+$/;

// eslint-disable-next-line no-control-regex
const UNSAFE_VALUE = /["\u0000-\u001f\u007f]/g;

export const sanitizeMeta = (meta: Record<string, unknown>): Record<string, string> =>
    Object.entries(meta)
        .filter(([key, value]) => META_KEY.test(key) && typeof value === 'string')
        .map(([key, value]) => [key, (value as string).replace(UNSAFE_VALUE, '')] as const)
        .filter(([, value]) => value.length > 0)
        .reduce<Record<string, string>>((carry, [key, value]) => ({ ...carry, [key]: value }), {});

export const buildBatchMeta = (batch: ReviewBatch): Record<string, string> =>
    sanitizeMeta({
        branch: batch.branch,
        commit: batch.commit,
        count: String(batch.comments.length),
        batch_id: batch.batchId
    });
