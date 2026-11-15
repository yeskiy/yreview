import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { WORKTREE } from '../core/anchor'
import { kotlinTrim } from '../core/kotlinText'
import { type Carry, type FileDiff, carryOf, splitLines } from '../core/lineMap'
import { isRelativeUnder } from '../core/paths'
import type { NoteStore } from '../git/notes'
import type { GitRunner } from '../git/runner'
import { CommentBook, type StoredComment } from '../store/commentBook'
import { diffsOf } from '../store/diffCache'
import { noAuthor } from './noteScan'

/** One open comment and its place in the working tree. */
export interface Placed {
  readonly stored: StoredComment
  readonly carry: Carry
}

const shows = (stored: StoredComment, root: string): boolean => {
  const { location } = stored.record
  return (
    location !== undefined &&
    kotlinTrim(stored.record.description ?? '') !== '' &&
    isRelativeUnder(root, location.path)
  )
}

/** Bytes that are not UTF-8 become a replacement character, so such a file never reads as empty. */
const linesOnDisk = async (root: string, file: string): Promise<readonly string[]> =>
  splitLines(await readFile(path.join(root, file), 'utf8').catch(() => ''))

const place = async (
  git: GitRunner,
  root: string,
  head: string,
  commit: string,
  comments: readonly StoredComment[],
  signal?: AbortSignal,
): Promise<readonly Placed[]> => {
  const atHead = head === WORKTREE || commit === head || commit === WORKTREE
  const paths = [...new Set(comments.map((stored) => stored.record.location?.path ?? ''))]
  const diffs = atHead
    ? new Map<string, FileDiff | undefined>()
    : await diffsOf(git, root, head, commit, paths, signal)
  const current = new Map(
    await Promise.all(
      paths
        .filter(
          (file) =>
            diffs?.get(file)?.deleted === false ||
            comments.some(
              (stored) =>
                stored.record.location?.path === file && stored.record.location.text !== undefined,
            ),
        )
        .map(async (file) => [file, await linesOnDisk(root, file)] as const),
    ),
  )
  return comments.map((stored) => {
    const { location } = stored.record
    const file = location?.path ?? ''
    return {
      stored,
      carry: carryOf(
        diffs?.get(file),
        location?.range,
        current.get(file) ?? [],
        location?.text,
        atHead,
        diffs === undefined,
      ),
    }
  })
}

/** The open comments of one store with the line map applied. The editor and the task views read this. */
export const placedComments = async (
  git: GitRunner,
  root: string,
  head: string,
  notes: NoteStore,
  only?: string,
  signal?: AbortSignal,
): Promise<readonly Placed[]> => {
  const book = new CommentBook(notes, noAuthor)
  const byCommit = (await Promise.all((await book.commits()).map((commit) => book.open(commit))))
    .flat()
    .filter(
      (stored) =>
        shows(stored, root) && (only === undefined || stored.record.location?.path === only),
    )
    .reduce(
      (groups, stored) => groups.set(stored.commit, [...(groups.get(stored.commit) ?? []), stored]),
      new Map<string, readonly StoredComment[]>(),
    )
  return [...byCommit].reduce<Promise<readonly Placed[]>>(
    async (done, [commit, comments]) => [
      ...(await done),
      ...(await place(git, root, head, commit, comments, signal)),
    ],
    Promise.resolve([]),
  )
}
