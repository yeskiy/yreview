import {
  type RecordRange,
  type ReviewRecord,
  decodeRecord,
  encodeRecord,
  recordId,
} from '../core/record'
import { NotesWriteError } from '../git/errors'
import type { NoteStore } from '../git/notes'
import { ALL_REFS } from './noteRefs'

/** One record, the ref that holds it, and the key of the note it was read from. */
export interface StoredComment {
  readonly id: string
  readonly ref: string
  readonly commit: string
  readonly record: ReviewRecord
}

const idOf = (line: string): string | undefined => {
  const record = decodeRecord(line)
  return record === undefined ? undefined : recordId(record)
}

const drops = (line: string, ids: ReadonlySet<string>): boolean => {
  const record = decodeRecord(line)
  return record !== undefined && (ids.has(recordId(record)) || ids.has(record.original ?? ''))
}

const closedIds = (all: readonly StoredComment[]): ReadonlySet<string> =>
  new Set(
    all.flatMap((stored) =>
      stored.record.resolved === true && stored.record.original !== undefined
        ? [stored.record.original]
        : [],
    ),
  )

// With the u flag, a pair of surrogates reads as one code point, so only a lone surrogate matches.
const LONE_SURROGATE = /[\uD800-\uDFFF]/u

const noteKey = (stored: StoredComment): string => `${stored.ref}\u0000${stored.commit}`

const gone = (): never => {
  throw new NotesWriteError(
    'The comment is no longer in the git notes, so the extension wrote no record. Reload the file.',
  )
}

/** The records of one store. It asks for the author only when it writes, so a read needs no author. */
export class CommentBook {
  constructor(
    private readonly store: NoteStore,
    private readonly authorOf: () => Promise<string>,
    private readonly clock: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  async add(
    ref: string,
    commit: string,
    path: string,
    range: RecordRange,
    text: string,
  ): Promise<StoredComment> {
    if (LONE_SURROGATE.test(text)) {
      throw new NotesWriteError(
        'The comment holds a broken character, so the extension wrote no record. Remove the character and try again.',
      )
    }
    const record: ReviewRecord = {
      timestamp: String(this.clock()),
      author: await this.authorOf(),
      description: text,
      location: { commit, path, range },
    }
    await this.store.append(ref, commit, encodeRecord(record))
    return { id: recordId(record), ref, commit, record }
  }

  /** Writes the resolve record under the lock of the note, and only while the comment is still there. */
  async resolve(stored: StoredComment): Promise<StoredComment> {
    const record: ReviewRecord = {
      timestamp: String(this.clock()),
      author: await this.authorOf(),
      original: stored.id,
      resolved: true,
      location: stored.record.location,
    }
    await this.store.edit(stored.ref, stored.commit, (lines) =>
      lines.some((line) => idOf(line) === stored.id) ? [...lines, encodeRecord(record)] : gone(),
    )
    return { id: recordId(record), ref: stored.ref, commit: stored.commit, record }
  }

  async list(
    commit: string,
    refs: readonly string[] = ALL_REFS,
  ): Promise<readonly StoredComment[]> {
    return (
      await Promise.all(
        refs.map(async (ref) =>
          (await this.store.readLines(ref, commit)).flatMap((line) => {
            const record = decodeRecord(line)
            return record === undefined ? [] : [{ id: recordId(record), ref, commit, record }]
          }),
        ),
      )
    ).flat()
  }

  async open(
    commit: string,
    refs: readonly string[] = ALL_REFS,
  ): Promise<readonly StoredComment[]> {
    const all = await this.list(commit, refs)
    const closed = closedIds(all)
    return all.filter((stored) => stored.record.original === undefined && !closed.has(stored.id))
  }

  /** The comments that a later record marked as resolved. */
  async closed(
    commit: string,
    refs: readonly string[] = ALL_REFS,
  ): Promise<readonly StoredComment[]> {
    const all = await this.list(commit, refs)
    const closed = closedIds(all)
    return all.filter((stored) => stored.record.original === undefined && closed.has(stored.id))
  }

  /** Every commit that carries a note in one of `refs`. */
  async commits(refs: readonly string[] = ALL_REFS): Promise<readonly string[]> {
    return [
      ...new Set((await Promise.all(refs.map((ref) => this.store.commitsWithNotes(ref)))).flat()),
    ]
  }

  /** The record with this id, looked for under `commit` first and then under every key. */
  async findAt(
    commit: string,
    id: string,
    refs: readonly string[] = ALL_REFS,
  ): Promise<StoredComment | undefined> {
    return (await this.list(commit, refs)).find((stored) => stored.id === id) ?? this.find(id, refs)
  }

  async find(id: string, refs: readonly string[] = ALL_REFS): Promise<StoredComment | undefined> {
    return (await this.everything(refs)).find((stored) => stored.id === id)
  }

  /** Every record that can be a task. A resolve record points at another record, so it stays out. */
  async tasks(refs: readonly string[] = ALL_REFS): Promise<readonly StoredComment[]> {
    return (await this.everything(refs)).filter((stored) => stored.record.original === undefined)
  }

  async findAll(
    ids: ReadonlySet<string>,
    refs: readonly string[] = ALL_REFS,
  ): Promise<readonly StoredComment[]> {
    return (await this.everything(refs)).filter((stored) => ids.has(stored.id))
  }

  /** Drops these records and each resolve record that names one of them. Gives the count of lines that went. */
  async remove(records: readonly StoredComment[]): Promise<number> {
    const groups = records.reduce(
      (map, stored) => map.set(noteKey(stored), [...(map.get(noteKey(stored)) ?? []), stored]),
      new Map<string, readonly StoredComment[]>(),
    )
    // One note after the other, so a refused note stops the delete before the next note changes.
    return [...groups.values()].reduce(
      (sum, group) =>
        sum.then(async (total) => {
          const [first] = group
          if (first === undefined) return total
          const ids = new Set(group.map((stored) => stored.id))
          const before = await this.store.edit(first.ref, first.commit, (lines) =>
            lines.filter((line) => !drops(line, ids)),
          )
          return total + before.filter((line) => drops(line, ids)).length
        }),
      Promise.resolve(0),
    )
  }

  private async everything(refs: readonly string[]): Promise<readonly StoredComment[]> {
    return (
      await Promise.all((await this.commits(refs)).map((commit) => this.list(commit, refs)))
    ).flat()
  }
}
