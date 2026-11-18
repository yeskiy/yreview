import { keyOf, matchKey } from '../core/handles'

/** One comment that reached a shared ref but not the remote, and the push that would carry it. */
export interface ShareMark {
  readonly id: string
  readonly root: string
  readonly ref: string
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

export const readMarks = (value: unknown): readonly ShareMark[] =>
  (Array.isArray(value) ? (value as unknown[]) : []).flatMap((entry) =>
    isRecord(entry) &&
    typeof entry.id === 'string' &&
    typeof entry.root === 'string' &&
    typeof entry.ref === 'string'
      ? [{ id: entry.id, root: entry.root, ref: entry.ref }]
      : [],
  )

/** An old identifier of a migrated record and its new identifier. */
export type Rename = readonly [string, string]

export const MAX_RENAMES = 5000

export const readRenames = (value: unknown): readonly Rename[] =>
  (Array.isArray(value) ? (value as unknown[]) : []).flatMap((entry) =>
    Array.isArray(entry) &&
    entry.length === 2 &&
    typeof entry[0] === 'string' &&
    typeof entry[1] === 'string'
      ? [[entry[0], entry[1]] as const]
      : [],
  )

/** The comments that a failed push left behind, and the new identifiers of migrated records. */
export class ShareLog {
  private current: readonly ShareMark[]

  private renamed: readonly Rename[]

  constructor(
    stored: readonly ShareMark[] = [],
    private readonly save: (marks: readonly ShareMark[]) => Promise<void> = () => Promise.resolve(),
    renamed: readonly Rename[] = [],
    private readonly saveRenames: (renames: readonly Rename[]) => Promise<void> = () =>
      Promise.resolve(),
  ) {
    this.current = stored
    this.renamed = renamed
  }

  isUnshared(id: string): boolean {
    return this.current.some((mark) => mark.id === id)
  }

  marks(): readonly ShareMark[] {
    return this.current
  }

  async mark(id: string, root: string, ref: string): Promise<void> {
    if (this.isUnshared(id)) return
    this.current = [...this.current, { id, root, ref }]
    await this.save(this.current)
  }

  /** One push carries every note of one ref of one root. A mark of no push goes with any good push. */
  async clear(root: string, ref: string): Promise<void> {
    const kept = this.current.filter(
      (mark) => mark.root !== '' && !(mark.root === root && mark.ref === ref),
    )
    if (kept.length === this.current.length) return
    this.current = kept
    await this.save(this.current)
  }

  /** Moves the marks of the old identifiers to the new root, and keeps the newest renames. */
  async rename(renames: ReadonlyMap<string, string>, root: string): Promise<void> {
    if (renames.size === 0) return
    const marks = this.current.map((mark) => {
      const id = renames.get(mark.id)
      return id === undefined ? mark : { ...mark, id, root }
    })
    if (marks.some((mark, n) => mark !== this.current[n])) {
      this.current = marks
      await this.save(this.current)
    }
    this.renamed = [
      ...this.renamed.filter(([old]) => !renames.has(old)),
      ...renames.entries(),
    ].slice(-MAX_RENAMES)
    await this.saveRenames(this.renamed)
  }

  /** The new identifier of an old identifier or of its handle, else the value as given. */
  forward(given: string): string {
    const key = keyOf(given)
    const match =
      key === undefined
        ? undefined
        : matchKey(
            key,
            this.renamed.map(([old]) => old),
          )
    const old = match?.kind === 'one' ? match.id : undefined
    return this.renamed.find(([from]) => from === old)?.[1] ?? given
  }
}
