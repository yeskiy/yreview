import { WORKTREE } from '../core/anchor'
import type { RecordRange } from '../core/record'

export type TaskKind = 'comment' | 'todo'

/** Where a comment of another commit stands in the working tree, its note commit and its stored range. */
export interface TaskCarry {
  readonly kind: 'same' | 'outdated' | 'removed' | 'missing'
  readonly commit: string
  readonly was?: RecordRange
}

/** One row of a task view. The fields up to `author` go to tasks.json, in this order. */
export interface ReviewTask {
  readonly id: string
  readonly kind: TaskKind
  readonly path: string
  readonly startLine: number
  readonly startColumn?: number
  readonly endLine: number
  readonly endColumn?: number
  readonly text: string
  readonly pattern?: string
  readonly author?: string
  /** The root and the path with `/`, as git spells the root. */
  readonly filePath: string
  readonly rootPath: string
  readonly revision: string
  /** The share word of a comment. A TODO keeps it empty. */
  readonly state: string
  /** The workspace folder that holds the file. The view sets it. */
  readonly folder: string
  /** The TODO pattern that found the item, as the setting spells it. */
  readonly patternRule: string
  readonly resolved: boolean
  /** The place of an open comment in the working tree. A TODO and a resolved comment have none. */
  readonly carry?: TaskCarry
  /** True for a task of an open file outside the workspace. */
  readonly outside?: boolean
}

/** A repository with no commit gives WORKTREE, so the tasks name the working tree. */
export const revisionOf = (head: string | undefined): string => head ?? WORKTREE
