export interface BatchComment {
  readonly id: string
  readonly path: string
  readonly startLine: number
  readonly startColumn?: number
  readonly endLine: number
  readonly endColumn?: number
  readonly revision: string
  readonly side?: 'left' | 'right'
  readonly text: string
}

export interface ReviewBatch {
  readonly batchId: string
  readonly branch: string
  readonly commit: string
  readonly comments: readonly BatchComment[]
}

/** The field order of Schema.kt. JSON.stringify leaves out a field whose value is undefined. */
const ordered = (comment: BatchComment): Record<string, unknown> => ({
  id: comment.id,
  path: comment.path,
  startLine: comment.startLine,
  startColumn: comment.startColumn,
  endLine: comment.endLine,
  endColumn: comment.endColumn,
  revision: comment.revision,
  side: comment.side,
  text: comment.text,
})

export const encodeComment = (comment: BatchComment): string => JSON.stringify(ordered(comment))

/** One line, because one Server-Sent Event carries one batch. */
export const encodeBatch = (batch: ReviewBatch): string =>
  JSON.stringify({
    batchId: batch.batchId,
    branch: batch.branch,
    commit: batch.commit,
    comments: batch.comments.map(ordered),
  })
