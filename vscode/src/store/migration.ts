import { mkdir, rename } from 'node:fs/promises'
import path from 'node:path'

import { decodeRecord, recordId } from '../core/record'
import { NotesWriteError } from '../git/errors'
import type { NoteStore } from '../git/notes'
import { FOLDER } from './folderNotes'

/** How many record lines the migration moved, and the reason it stopped when it did. */
export interface MigrationReport {
  readonly moved: number
  readonly problem?: string
}

/** What the user reads after a migration, and whether every reader must read the store again. */
export interface MigrationNotice {
  readonly text: string
  readonly warning: boolean
  readonly refresh: boolean
}

/** Only a repository rooted at the folder itself may take the records, because each path is relative to it. */
export const maySettle = (repositoryRoot: string, folderRoot: string): boolean =>
  repositoryRoot === folderRoot

export const mayMove = (writes: boolean, repositoryRoot: string, folderRoot: string): boolean =>
  writes && maySettle(repositoryRoot, folderRoot)

const count = (value: number, word: string): string => `${value} ${word}${value === 1 ? '' : 's'}`

export const migrationNotice = (
  report: MigrationReport,
  folder: string,
  repository: string,
  movedTo: string | undefined,
): MigrationNotice => {
  if (report.problem !== undefined) {
    return {
      text: `The extension did not move the review comments of ${path.basename(folder)}. ${report.problem}`,
      warning: true,
      refresh: false,
    }
  }
  if (movedTo === undefined) {
    return {
      text: `The extension copied ${count(report.moved, 'review comment')} of ${path.basename(folder)} into the git notes of ${repository}. The extension did not move the old folder, so the folder stays at ${path.join(folder, FOLDER)}.`,
      warning: true,
      refresh: true,
    }
  }
  return {
    text: `The extension moved ${count(report.moved, 'review comment')} into the git notes of ${repository}. The old folder is now at ${movedTo}.`,
    warning: false,
    refresh: true,
  }
}

/** A line that the reader cannot decode has no identifier, so the copy always carries it. */
const idOf = (line: string): string | undefined => {
  const record = decodeRecord(line)
  return record === undefined ? undefined : recordId(record)
}

const idsOf = (lines: readonly string[]): ReadonlySet<string> =>
  new Set(lines.map(idOf).filter((id): id is string => id !== undefined))

const refused =
  (report: MigrationReport) =>
  (error: unknown): MigrationReport => {
    if (error instanceof NotesWriteError) return { moved: report.moved, problem: error.message }
    throw error
  }

/** One key: one write under the lock of the note, then a read that proves every identifier landed. */
const moveKey = async (
  from: NoteStore,
  to: NoteStore,
  ref: string,
  key: string,
  target: string,
  report: MigrationReport,
): Promise<MigrationReport> => {
  const source = await from.readOrRefuse(ref, key)
  if (source.length === 0) return report
  const missingFrom = (lines: readonly string[]): readonly string[] => {
    const known = idsOf(lines)
    return source.filter((line) => {
      const id = idOf(line)
      return id === undefined || !known.has(id)
    })
  }
  const before = await to.edit(ref, target, (lines) => [...lines, ...missingFrom(lines)])
  const after = idsOf(await to.readOrRefuse(ref, target))
  const lost = source.map(idOf).filter((id): id is string => id !== undefined && !after.has(id))
  return lost.length > 0
    ? {
        moved: report.moved,
        problem: `The note of ${ref} did not take ${count(lost.length, 'record line')}.`,
      }
    : { moved: report.moved + missingFrom(before).length }
}

const copyRef = async (
  from: NoteStore,
  to: NoteStore,
  ref: string,
  target: string,
  report: MigrationReport,
): Promise<MigrationReport> =>
  from
    .commitsOrRefuse(ref)
    .then(
      (keys) =>
        keys.reduce<Promise<MigrationReport>>(
          (done, key) =>
            done.then((carried) =>
              carried.problem !== undefined
                ? carried
                : moveKey(from, to, ref, key, target, carried).catch(refused(carried)),
            ),
          Promise.resolve(report),
        ),
      refused(report),
    )

/** Copies every record, and stops at the first read that the extension cannot trust. Port of FolderMigration.copy. */
export const copyFolder = (
  from: NoteStore,
  to: NoteStore,
  refs: readonly string[],
  target: string,
): Promise<MigrationReport> =>
  refs.reduce<Promise<MigrationReport>>(
    (done, ref) =>
      done.then((report) =>
        report.problem !== undefined ? report : copyRef(from, to, ref, target, report),
      ),
    Promise.resolve({ moved: 0 }),
  )

const BUSY = ['EBUSY', 'EPERM', 'EACCES']
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** Moves `<root>/.y-review` to `target`. Windows can hold a folder for a moment, so a busy folder gets 5 tries. */
export const moveStoreFolder = async (
  root: string,
  target: string,
  tries = 5,
): Promise<boolean> => {
  try {
    await mkdir(path.dirname(target), { recursive: true })
    await rename(path.join(root, FOLDER), target)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code ?? ''
    if (tries <= 1 || !BUSY.includes(code)) return false
    await wait(200)
    return moveStoreFolder(root, target, tries - 1)
  }
}
