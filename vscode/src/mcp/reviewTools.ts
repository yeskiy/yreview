import { stat } from 'node:fs/promises'

import { handleOf, keyOf, matchKey } from '../core/handles'
import { isKotlinBlank } from '../core/kotlinText'
import { isRelativeUnder } from '../core/paths'
import type { RecordRange } from '../core/record'
import { NotesWriteError } from '../git/errors'
import type { CommentBook, StoredComment } from '../store/commentBook'
import type { Anchor, AnchorResult, StoreKind, WriteResult } from '../store/reviewService'
import {
  type Payload,
  addedPayload,
  errorPayload,
  isCommitRevision,
  isSharedRow,
  listPayload,
  normalizePath,
  openedPayload,
  rangeProblem,
  refsFor,
  resolvedPayload,
  rowOf,
} from './payloads'

export type { Payload } from './payloads'

export interface ToolStore {
  readonly root: string
  readonly kind: StoreKind
  readonly head: string | undefined
  readonly book: CommentBook
}

/** What the tools need from the editor. A test gives a fake, and task 5.7 gives the real one. */
export interface ToolHost {
  stores(): Promise<readonly ToolStore[]>
  folders(): readonly string[]
  containedPath(root: string, relative: string): Promise<string | undefined>
  anchorOf(filePath: string): Promise<AnchorResult>
  addComment(
    anchor: Anchor,
    range: RecordRange,
    text: string,
    shared: boolean,
  ): Promise<WriteResult>
  shareByDefault(root: string): boolean
  changed(): void
  showFile(filePath: string, line: number): Promise<void>
  showDiff(root: string, path: string, revision: string, line: number): Promise<boolean>
}

type Located =
  | { readonly kind: 'one'; readonly store: ToolStore; readonly stored: StoredComment }
  | { readonly kind: 'none' }
  | { readonly kind: 'many'; readonly count: number }

const isFile = async (file: string): Promise<boolean> =>
  (await stat(file).catch(() => undefined))?.isFile() === true

/** A refused write becomes an error payload. Any other failure goes to the caller. */
const written = async (work: () => Promise<Payload>, fallback: string): Promise<Payload> =>
  work().catch((failure: unknown) => {
    if (failure instanceof NotesWriteError) return errorPayload(failure.message || fallback)
    throw failure
  })

/** The four tools of ReviewToolset.kt. Every answer is one JSON object. */
export class ReviewTools {
  constructor(private readonly host: ToolHost) {}

  async list(resolved = false, includeAnalyses = false, includeLocal = true): Promise<Payload> {
    const refs = refsFor(includeAnalyses, includeLocal)
    const rows = await Promise.all(
      (await this.host.stores()).map(async (store) => {
        const commits = await store.book.commits(refs)
        const found = await Promise.all(
          commits.map((commit) =>
            resolved ? store.book.closed(commit, refs) : store.book.open(commit, refs),
          ),
        )
        return found
          .flat()
          .flatMap((stored) => rowOf(stored, resolved, store.kind, handleOf(stored.id)) ?? [])
      }),
    )
    return listPayload(rows.flat())
  }

  async resolveComment(id: string): Promise<Payload> {
    const found = await this.locate(id)
    if (found.kind === 'none') return errorPayload(`No review comment has the id ${id}.`)
    if (found.kind === 'many') {
      return errorPayload(
        `The id ${id} names ${found.count} comments. Call review_list_comments and use a full id.`,
      )
    }
    return written(async () => {
      await found.store.book.resolve(found.stored)
      this.host.changed()
      return resolvedPayload(id)
    }, 'The resolution was not written.')
  }

  async addComment(
    path: string,
    startLine: number,
    endLine: number,
    text: string,
  ): Promise<Payload> {
    const range = rangeProblem(startLine, endLine)
    if (range !== undefined) return errorPayload(range)
    if (isKotlinBlank(text)) return errorPayload('text must not be empty.')
    const relative = normalizePath(path)
    if (relative === undefined) {
      return errorPayload(`The path ${path} is not a path inside the project.`)
    }
    const file = await this.fileOf(relative)
    if (file === undefined) return errorPayload(`The project holds no file at ${relative}.`)
    const result = await this.host.anchorOf(file)
    if (result.kind === 'noCommit') {
      return errorPayload(`The repository of ${relative} has no commit yet.`)
    }
    if (result.kind !== 'found') {
      return errorPayload(`The project holds no review store for ${relative}.`)
    }
    const { anchor } = result
    return written(async () => {
      const done = await this.host.addComment(
        anchor,
        { startLine, endLine },
        text,
        this.host.shareByDefault(anchor.root),
      )
      return addedPayload(
        handleOf(done.stored.id),
        anchor.path,
        anchor.head,
        isSharedRow(anchor.store, done.stored.ref, done.shareError),
      )
    }, 'The comment was not written.')
  }

  async openComment(id: string): Promise<Payload> {
    const missing = errorPayload(`No review comment has the id ${id}.`)
    const found = await this.locate(id)
    if (found.kind !== 'one') return missing
    const { location } = found.stored.record
    if (location === undefined) return missing
    if (!isRelativeUnder(found.store.root, location.path)) {
      return errorPayload(
        `The comment ${id} names a file outside its repository. VS Code opens nothing.`,
      )
    }
    const line = Math.max(location.range?.startLine ?? 1, 1)
    const older =
      found.store.kind === 'git' &&
      location.commit !== found.store.head &&
      isCommitRevision(location.commit)
    if (
      older &&
      (await this.host.showDiff(found.store.root, location.path, location.commit, line))
    ) {
      return openedPayload(id, 'diff', location.path, line, location.commit)
    }
    const file = await this.host.containedPath(found.store.root, location.path)
    if (file === undefined || !(await isFile(file))) {
      return errorPayload(`The working tree holds no file at ${location.path}.`)
    }
    await this.host.showFile(file, line)
    return openedPayload(id, 'file', location.path, line, location.commit)
  }

  /** The first workspace folder that holds a file at the path. Each candidate passes the containment check. */
  private async fileOf(relative: string): Promise<string | undefined> {
    const found = await Promise.all(
      this.host.folders().map(async (folder) => {
        const file = await this.host.containedPath(folder, relative)
        return file !== undefined && (await isFile(file)) ? file : undefined
      }),
    )
    return found.find((file) => file !== undefined)
  }

  /** Reads every record of every store once and matches the id in memory. */
  private async locate(given: string): Promise<Located> {
    const key = keyOf(given)
    if (key === undefined) return { kind: 'none' }
    const hits = (
      await Promise.all(
        (await this.host.stores()).map(async (store) =>
          (await store.book.tasks()).map((stored) => ({ store, stored })),
        ),
      )
    ).flat()
    const match = matchKey(
      key,
      hits.map((hit) => hit.stored.id),
    )
    if (match.kind === 'many') return { kind: 'many', count: match.count }
    const hit =
      match.kind === 'one' ? hits.find((candidate) => candidate.stored.id === match.id) : undefined
    return hit === undefined ? { kind: 'none' } : { kind: 'one', ...hit }
  }
}
