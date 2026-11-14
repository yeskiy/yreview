import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { isKotlinBlank } from '../core/kotlinText'
import { NotesWriteError } from './errors'
import { type GitResult, type GitRunner, isOk, ran } from './runner'

export type Change = (lines: readonly string[]) => readonly string[] | Promise<readonly string[]>

/** One place that holds review records, named by a ref and by a commit. */
export interface NoteStore {
  /** The records of one note, and none for a note that the extension cannot read. */
  readLines(ref: string, commit: string): Promise<readonly string[]>
  /** The records of one note. A note that the extension cannot read stops the caller. */
  readOrRefuse(ref: string, commit: string): Promise<readonly string[]>
  append(ref: string, commit: string, line: string): Promise<void>
  rewrite(ref: string, commit: string, lines: readonly string[]): Promise<void>
  /** Writes `change` of the note and gives the lines that `change` got. */
  edit(ref: string, commit: string, change: Change): Promise<readonly string[]>
  commitsWithNotes(ref: string): Promise<readonly string[]>
  commitsOrRefuse(ref: string): Promise<readonly string[]>
}

export const SCRATCH_PREFIX = 'refs/notes/y-review/scratch/'
export const MAX_TRIES = 5
const NOTES_PREFIX = 'refs/notes/'
const SEPARATOR = '\n\n'
const END = '--end-of-options'

// Each key holds the tail of its chain of writes. A failed write does not stop the next writer.
const LOCKS = new Map<string, Promise<unknown>>()

export const withLock = <T>(key: string, work: () => Promise<T>): Promise<T> => {
  const result = (LOCKS.get(key) ?? Promise.resolve()).then(work)
  const tail = result.then(
    () => undefined,
    () => undefined,
  )
  LOCKS.set(key, tail)
  return result.finally(() => {
    if (LOCKS.get(key) === tail) LOCKS.delete(key)
  })
}

export const splitNote = (text: string): readonly string[] =>
  text.split(/\r\n|\r|\n/).filter((line) => !isKotlinBlank(line))

const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index])

const refusal = (what: string, result: GitResult): string =>
  `The extension did not read ${what}, so it wrote no record. ${result.stderr.trim()}`.trim()

const check = (result: GitResult, fallback: string): void => {
  if (!isOk(result)) throw new NotesWriteError(result.stderr.trim() || fallback)
}

const fail = (message: string): never => {
  throw new NotesWriteError(message)
}

/** A value from a caller is data. Git must never read it as an option. */
const plainValue = (value: string, what: string): string =>
  value === '' || value.startsWith('-') || value.includes('\0')
    ? fail(`The extension refused the ${what} ${JSON.stringify(value)}.`)
    : value

/** A full ref under refs/notes/ with no refspec colon, so a write or a push cannot touch a branch. */
export const isNoteRef = (ref: string): boolean =>
  ref.startsWith(NOTES_PREFIX) && ref.length > NOTES_PREFIX.length && !/[:\0]/.test(ref)

const noteRef = (ref: string): string =>
  isNoteRef(ref)
    ? ref
    : fail(
        `The extension refused the note ref ${JSON.stringify(ref)}. It must start with refs/notes/.`,
      )

/** Reads and writes git notes. A write moves the ref only when no other writer moved it after the read. */
export class NotesGateway implements NoteStore {
  constructor(private readonly git: GitRunner) {}

  async readLines(ref: string, commit: string): Promise<readonly string[]> {
    try {
      return await this.readOrRefuse(ref, commit)
    } catch (error) {
      if (error instanceof NotesWriteError) return []
      throw error
    }
  }

  async readOrRefuse(ref: string, commit: string): Promise<readonly string[]> {
    const result = await this.git.run([
      'notes',
      '--ref',
      noteRef(ref),
      'show',
      END,
      plainValue(commit, 'commit'),
    ])
    if (isOk(result)) return splitNote(result.stdout)
    if (!ran(result)) throw new NotesWriteError(refusal(`the note of ${commit}`, result))
    return []
  }

  async append(ref: string, commit: string, line: string): Promise<void> {
    plainValue(commit, 'commit')
    await this.guarded(ref, async (tip) => {
      const landed = await this.swap(ref, tip, (scratch) =>
        this.withFile(line, 'git notes append failed', (file) => [
          'notes',
          '--ref',
          scratch,
          'append',
          '-F',
          file,
          END,
          commit,
        ]),
      )
      return landed ? true : undefined
    })
  }

  async rewrite(ref: string, commit: string, lines: readonly string[]): Promise<void> {
    await this.edit(ref, commit, () => lines)
  }

  async edit(ref: string, commit: string, change: Change): Promise<readonly string[]> {
    plainValue(commit, 'commit')
    return this.guarded(ref, async (tip) => {
      const before = await this.readOrRefuse(ref, commit)
      const after = await change(before)
      const written =
        sameLines(after, before) ||
        (await this.swap(ref, tip, (scratch) => this.store(scratch, commit, after)))
      return written ? before : undefined
    })
  }

  async commitsWithNotes(ref: string): Promise<readonly string[]> {
    try {
      return await this.commitsOrRefuse(ref)
    } catch (error) {
      if (error instanceof NotesWriteError) return []
      throw error
    }
  }

  async commitsOrRefuse(ref: string): Promise<readonly string[]> {
    const result = await this.git.run(['notes', '--ref', noteRef(ref), 'list'])
    if (!isOk(result)) {
      if (!ran(result)) throw new NotesWriteError(refusal(`the notes of ${ref}`, result))
      return []
    }
    return splitNote(result.stdout).map((line) =>
      (line.includes(' ') ? line.slice(line.indexOf(' ') + 1) : line).trim(),
    )
  }

  // --- Guarded write ---

  /** Runs `attempt` under the lock until one attempt gives an answer. Undefined means that the ref moved. */
  private async guarded<T>(
    ref: string,
    attempt: (tip: string | undefined) => Promise<T | undefined>,
  ): Promise<T> {
    const key = await this.lockKey(noteRef(ref))
    const tryFrom = async (left: number): Promise<T> => {
      const answer = await attempt(await this.tip(ref))
      if (answer !== undefined) return answer
      if (left <= 1) {
        return fail(
          `Another program changed ${ref} during each of ${MAX_TRIES} writes, so the extension wrote no record. Try again.`,
        )
      }
      return tryFrom(left - 1)
    }
    return withLock(key, () => tryFrom(MAX_TRIES))
  }

  /** Builds the note on a scratch ref and moves the ref from `tip` to it. False when the ref moved. */
  private async swap(
    ref: string,
    tip: string | undefined,
    write: (scratch: string) => Promise<void>,
  ): Promise<boolean> {
    const scratch = `${SCRATCH_PREFIX}${randomUUID()}`
    try {
      if (tip !== undefined) {
        check(await this.git.run(['update-ref', END, scratch, tip]), 'git update-ref failed')
      }
      await write(scratch)
      const built = (await this.tip(scratch)) ?? fail(`git notes wrote no commit for ${ref}.`)
      const moved = await this.git.run(['update-ref', END, ref, built, tip ?? ''])
      if (isOk(moved)) return true
      if ((await this.tip(ref)) === tip) check(moved, 'git update-ref failed')
      return false
    } finally {
      await this.git.run(['update-ref', '-d', END, scratch])
    }
  }

  private async store(scratch: string, commit: string, lines: readonly string[]): Promise<void> {
    if (lines.length === 0) {
      check(
        await this.git.run([
          'notes',
          '--ref',
          scratch,
          'remove',
          '--ignore-missing',
          END,
          plainValue(commit, 'commit'),
        ]),
        'git notes remove failed',
      )
      return
    }
    await this.withFile(`${lines.join(SEPARATOR)}\n`, 'git notes add failed', (file) => [
      'notes',
      '--ref',
      scratch,
      'add',
      '-f',
      '-F',
      file,
      END,
      plainValue(commit, 'commit'),
    ])
  }

  /** The commit that the ref names, and undefined when the ref does not exist. */
  private async tip(ref: string): Promise<string | undefined> {
    const result = await this.git.run(['rev-parse', '-q', '--verify', END, noteRef(ref)])
    if (isOk(result)) return result.stdout.trim()
    if (!ran(result)) throw new NotesWriteError(refusal(ref, result))
    return undefined
  }

  /** Two worktrees of one repository share the note refs, so the key is the common git dir. */
  private async lockKey(ref: string): Promise<string> {
    const result = await this.git.run(['rev-parse', '--path-format=absolute', '--git-common-dir'])
    if (!isOk(result)) throw new NotesWriteError(refusal('the git directory', result))
    return `${result.stdout.trim()}\u0000${ref}`
  }

  /** The note text goes through a file, never through an argument. */
  private async withFile(
    text: string,
    fallback: string,
    args: (file: string) => readonly string[],
  ): Promise<void> {
    const dir = await mkdtemp(path.join(tmpdir(), 'y-review-note-'))
    const file = path.join(dir, 'note.json')
    try {
      await writeFile(file, text, 'utf8')
      check(await this.git.run(args(file)), fallback)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
}
