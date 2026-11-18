import { mkdir, rename } from 'node:fs/promises'
import path from 'node:path'

import { holds, relativeTo } from '../core/anchor'
import { type ReviewRecord, decodeRecord, encodeRecord, recordId } from '../core/record'
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

/** The path of the folder under the repository: "" for the same folder, undefined for a folder outside. */
export const prefixOf = (repositoryRoot: string, folderRoot: string): string | undefined => {
  if (folderRoot === repositoryRoot) return ''
  return holds(repositoryRoot, folderRoot) ? relativeTo(folderRoot, repositoryRoot) : undefined
}

export const maySettle = (repositoryRoot: string, folderRoot: string): boolean =>
  prefixOf(repositoryRoot, folderRoot) !== undefined

// --- Record rewrite ---

/** The new identifiers of a store that moves into a repository, and its rewritten lines. */
export interface Rewrite {
  readonly lines: readonly string[]
  readonly renames: ReadonlyMap<string, string>
}

const moved = (
  record: ReviewRecord,
  prefix: string,
  link: (id: string) => string,
): ReviewRecord => ({
  ...record,
  parent: record.parent === undefined ? undefined : link(record.parent),
  original: record.original === undefined ? undefined : link(record.original),
  location:
    record.location === undefined
      ? undefined
      : { ...record.location, path: `${prefix}/${record.location.path}` },
})

export const rewriteLine = (
  line: string,
  prefix: string,
  renames: ReadonlyMap<string, string>,
): string => {
  const record = prefix === '' ? undefined : decodeRecord(line)
  return record === undefined
    ? line
    : encodeRecord(moved(record, prefix, (id) => renames.get(id) ?? id))
}

/** New identifiers for every record of one store. A parent gets its new identifier before its child. */
export const rewriteRecords = (lines: readonly string[], prefix: string): Rewrite => {
  if (prefix === '') return { lines, renames: new Map() }
  const byId = new Map(
    lines
      .map(decodeRecord)
      .filter((record): record is ReviewRecord => record !== undefined)
      .map((record) => [recordId(record), record] as const),
  )
  const renames = new Map<string, string>()
  const newId = (old: string): string =>
    renames.get(old) ??
    ((): string => {
      const id = recordId(
        moved(byId.get(old) as ReviewRecord, prefix, (link) =>
          byId.has(link) ? newId(link) : link,
        ),
      )
      renames.set(old, id)
      return id
    })()
  ;[...byId.keys()].forEach(newId)
  return { lines: lines.map((line) => rewriteLine(line, prefix, renames)), renames }
}

const NO_WRITE = 'A rewritten store takes no write.'
const refuseWrite = (): Promise<never> => Promise.reject(new NotesWriteError(NO_WRITE))

/** A read-only view of a store whose lines carry the paths and identifiers of the repository. */
export class RewrittenNotes implements NoteStore {
  constructor(
    private readonly from: NoteStore,
    private readonly prefix: string,
    private readonly renames: ReadonlyMap<string, string>,
  ) {}

  private map(lines: readonly string[]): readonly string[] {
    return lines.map((line) => rewriteLine(line, this.prefix, this.renames))
  }

  readonly readLines = (ref: string, commit: string): Promise<readonly string[]> =>
    this.from.readLines(ref, commit).then((lines) => this.map(lines))

  readonly readOrRefuse = (ref: string, commit: string): Promise<readonly string[]> =>
    this.from.readOrRefuse(ref, commit).then((lines) => this.map(lines))

  readonly append: NoteStore['append'] = refuseWrite

  readonly rewrite: NoteStore['rewrite'] = refuseWrite

  readonly edit: NoteStore['edit'] = refuseWrite

  readonly commitsWithNotes = (ref: string): Promise<readonly string[]> =>
    this.from.commitsWithNotes(ref)

  readonly commitsOrRefuse = (ref: string): Promise<readonly string[]> =>
    this.from.commitsOrRefuse(ref)
}

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
