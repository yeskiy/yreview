import { z } from 'zod';

const MAX_COMMENTS = 200;
const MAX_TEXT = 20_000;

// The same rule stands in BatchBuilder.kt. Keep the two copies equal.
const opaqueId = z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_-]+$/, 'an id may hold letters, digits, underscores, and hyphens only');

const revision = z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9._/-]+$/, 'a revision may hold letters, digits, dots, underscores, slashes, and hyphens only');

const plainLine = (max: number) =>
    z
        .string()
        .min(1)
        .max(max)
        // eslint-disable-next-line no-control-regex
        .refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'the value must not hold a control character');

export const ReviewCommentSchema = z.strictObject({
    id: opaqueId,
    path: plainLine(1024),
    startLine: z.int().min(0).max(10_000_000),
    endLine: z.int().min(0).max(10_000_000),
    revision,
    side: z.enum(['left', 'right']).optional(),
    text: z.string().min(1).max(MAX_TEXT)
});

export const ReviewBatchSchema = z.strictObject({
    batchId: opaqueId,
    branch: plainLine(255),
    commit: revision,
    comments: z.array(ReviewCommentSchema).min(1).max(MAX_COMMENTS)
});

export const ResolveInputSchema = z.strictObject({
    ids: z.array(opaqueId).min(1).max(MAX_COMMENTS)
});

export type ReviewComment = z.infer<typeof ReviewCommentSchema>;
export type ReviewBatch = z.infer<typeof ReviewBatchSchema>;
