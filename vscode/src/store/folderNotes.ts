import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { NotesWriteError } from '../git/errors'
import { type Change, type NoteStore, isNoteRef, splitNote, withLock } from '../git/notes'

export const FOLDER = '.y-review'
export const NOTES = 'notes'
export const SUFFIX = '.jsonl'

/** A ref name holds a slash, and a file name must not, so the slash becomes a hyphen. */
export const slug = (ref: string): string => ref.replaceAll('/', '-')

// A key is `worktree` or a commit hash, and a slug has no separator, so no name leaves the store.
const KEY = /^[A-Za-z0-9_-]{1,200}$/u
const SLUG = /^[A-Za-z0-9._-]{1,200}$/u
// Java keeps a byte order mark as a character, so the reader keeps it too.
const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

const fail = (message: string): never => {
  throw new NotesWriteError(message)
}

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const isMissing = (error: unknown): boolean =>
  ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException | undefined)?.code ?? '')

const refusal = (place: string, error: unknown): string =>
  `The extension did not read ${place}, so it wrote no record. ${reasonOf(error)}`

const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index])

/** The quiet door: a refused read gives nothing, as NotesGateway does. */
const quietly = async <T>(read: Promise<readonly T[]>): Promise<readonly T[]> => {
  try {
    return await read
  } catch (error) {
    if (error instanceof NotesWriteError) return []
    throw error
  }
}

/** A reader never sees half a file: the text goes to a temporary file that then replaces the file. */
const writeLines = async (file: string, lines: readonly string[]): Promise<void> => {
  if (lines.length === 0) {
    await rm(file, { force: true }).catch((error: unknown) =>
      fail(`The extension did not remove ${file}. ${reasonOf(error)}`),
    )
    return
  }
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(temporary, `${lines.join('\n')}\n`, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true })
    fail(`The extension did not write ${file}. ${reasonOf(error)}`)
  }
}

/** Review records in a folder, for a file that no git repository covers. One file holds one key of one ref. */
export class FolderNotes implements NoteStore {
  constructor(private readonly root: string) {}

  get folder(): string {
    return path.join(this.root, FOLDER, NOTES)
  }

  fileOf(ref: string, commit: string): string {
    if (!KEY.test(commit)) fail(`The extension refused the key ${JSON.stringify(commit)}.`)
    return path.join(this.refFolder(ref), `${commit}${SUFFIX}`)
  }

  readLines(ref: string, commit: string): Promise<readonly string[]> {
    return quietly(this.readOrRefuse(ref, commit))
  }

  /** The records of one key. A file that is not there holds none. A broken file stops the caller. */
  async readOrRefuse(ref: string, commit: string): Promise<readonly string[]> {
    const file = this.fileOf(ref, commit)
    const bytes = await readFile(file).catch((error: unknown) =>
      isMissing(error) ? undefined : fail(refusal(file, error)),
    )
    if (bytes === undefined) return []
    try {
      return splitNote(UTF8.decode(bytes))
    } catch (error) {
      return fail(refusal(file, error))
    }
  }

  async append(ref: string, commit: string, line: string): Promise<void> {
    await this.edit(ref, commit, (lines) => [...lines, line])
  }

  rewrite(ref: string, commit: string, lines: readonly string[]): Promise<void> {
    const file = this.fileOf(ref, commit)
    return withLock(file, () => writeLines(file, lines))
  }

  /** Reads every record first, so a failed read writes nothing. Gives the lines that `change` got. */
  edit(ref: string, commit: string, change: Change): Promise<readonly string[]> {
    const file = this.fileOf(ref, commit)
    return withLock(file, async () => {
      const before = await this.readOrRefuse(ref, commit)
      const after = await change(before)
      if (!sameLines(before, after)) await writeLines(file, after)
      return before
    })
  }

  commitsWithNotes(ref: string): Promise<readonly string[]> {
    return quietly(this.commitsOrRefuse(ref))
  }

  /** The keys of one ref. A folder that is not there holds none. */
  async commitsOrRefuse(ref: string): Promise<readonly string[]> {
    const directory = this.refFolder(ref)
    const names = await readdir(directory).catch((error: unknown) =>
      isMissing(error) ? [] : fail(refusal(directory, error)),
    )
    return names
      .filter((name) => name.endsWith(SUFFIX))
      .map((name) => name.slice(0, -SUFFIX.length))
      .filter((key) => KEY.test(key))
      .sort()
  }

  private refFolder(ref: string): string {
    if (!isNoteRef(ref) || !SLUG.test(slug(ref))) {
      fail(`The extension refused the note ref ${JSON.stringify(ref)}.`)
    }
    return path.join(this.folder, slug(ref))
  }
}
