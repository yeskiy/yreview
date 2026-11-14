import { randomBytes } from 'node:crypto'

import { kotlinTrim } from '../core/kotlinText'
import { cleanPath, cleanText, cutText } from '../tasks/taskText'
import { type BatchComment, type ReviewBatch, encodeBatch, encodeComment } from './batch'

export interface BatchTask {
  readonly id: string
  readonly path: string
  readonly startLine: number
  readonly startColumn?: number
  readonly endLine: number
  readonly endColumn?: number
  readonly revision: string
  readonly text: string
}

export interface DroppedTask {
  readonly id: string
  readonly reason: string
}

export interface BatchPlan {
  readonly batches: readonly ReviewBatch[]
  readonly dropped: readonly DroppedTask[]
  readonly tasks: number
  readonly reason: string
}

export const MAX_COMMENTS = 200
export const MAX_TEXT = 20_000
export const MAX_PATH = 1024
export const MAX_BRANCH = 255
export const MAX_LINE = 10_000_000
// The same limit stands in src/channel/bridgeClient.ts and in BridgeClient.kt. Keep the copies equal.
export const MAX_EVENT_CHARS = 4_000_000
const EVENT_FRAME = 8
const SIZE_ID = 'x'.repeat(200)

export const ID_REASON = 'the identifier breaks the channel rule'
export const REVISION_REASON = 'the revision is not a git revision'
export const PATH_REASON = 'the path breaks the channel rule'
export const TEXT_REASON = 'the task has no text'
export const COMMIT_REASON = 'the commit of the repository is not a git revision'

// The same rules stand in src/channel/schema.ts and in Schema.kt. Keep the copies equal.
const ID = /^[A-Za-z0-9_-]{1,200}$/
const REVISION = /^[A-Za-z0-9._/-]{1,200}$/

export const isRevision = (text: string): boolean => REVISION.test(text)

const randomBatchId = (): string => randomBytes(6).toString('hex')
const clamp = (value: number): number => Math.min(Math.max(value, 0), MAX_LINE)

const problemOf = (task: BatchTask): string | undefined => {
  if (!ID.test(task.id)) return ID_REASON
  if (!isRevision(task.revision)) return REVISION_REASON
  if (task.path === '' || task.path.length > MAX_PATH || cleanPath(task.path) !== task.path) {
    return PATH_REASON
  }
  return undefined
}

const commentOf = (task: BatchTask): BatchComment => ({
  id: task.id,
  path: task.path,
  startLine: clamp(task.startLine),
  startColumn: task.startColumn === undefined ? undefined : clamp(task.startColumn),
  endLine: clamp(task.endLine),
  endColumn: task.endColumn === undefined ? undefined : clamp(task.endColumn),
  revision: task.revision,
  text: cutText(kotlinTrim(cleanText(task.text)), MAX_TEXT),
})

interface Group {
  readonly comments: readonly BatchComment[]
  readonly size: number
}

/** Groups of 200 comments or fewer, and each event with its frame at MAX_EVENT_CHARS or fewer. */
const groups = (
  branch: string,
  commit: string,
  comments: readonly BatchComment[],
): readonly (readonly BatchComment[])[] => {
  const frame = encodeBatch({ batchId: SIZE_ID, branch, commit, comments: [] }).length + EVENT_FRAME
  return comments
    .reduce<readonly Group[]>((all, comment) => {
      const size = encodeComment(comment).length + 1
      const last = all.at(-1)
      return last !== undefined &&
        last.comments.length < MAX_COMMENTS &&
        frame + last.size + size <= MAX_EVENT_CHARS
        ? [...all.slice(0, -1), { comments: [...last.comments, comment], size: last.size + size }]
        : [...all, { comments: [comment], size }]
    }, [])
    .map((group) => group.comments)
}

const planOf = (batches: readonly ReviewBatch[], dropped: readonly DroppedTask[]): BatchPlan => ({
  batches,
  dropped,
  tasks: batches.reduce((sum, batch) => sum + batch.comments.length, 0),
  reason: [...new Set(dropped.map((task) => task.reason))].join(' and '),
})

type Row =
  | { readonly id: string; readonly comment: BatchComment }
  | { readonly id: string; readonly problem: string }

const rowOf = (task: BatchTask): Row => {
  const problem = problemOf(task)
  if (problem !== undefined) return { id: task.id, problem }
  const comment = commentOf(task)
  return comment.text === '' ? { id: task.id, problem: TEXT_REASON } : { id: task.id, comment }
}

/** A task the channel cannot carry is left out and named, so one bad row never loses a batch. */
export const buildBatches = (
  branch: string,
  commit: string,
  tasks: readonly BatchTask[],
  newBatchId: () => string = randomBatchId,
): BatchPlan => {
  if (!isRevision(commit)) {
    return planOf(
      [],
      tasks.map((task) => ({ id: task.id, reason: COMMIT_REASON })),
    )
  }
  const rows = tasks.map(rowOf)
  const name = cutText(cleanPath(branch), MAX_BRANCH) || 'HEAD'
  return planOf(
    groups(
      name,
      commit,
      rows.flatMap((row) => ('comment' in row ? [row.comment] : [])),
    ).map((comments) => ({ batchId: newBatchId(), branch: name, commit, comments })),
    rows.flatMap((row) => ('problem' in row ? [{ id: row.id, reason: row.problem }] : [])),
  )
}
