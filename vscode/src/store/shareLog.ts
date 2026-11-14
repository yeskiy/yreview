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

/** The comments that a failed push left behind. A task row names them "not shared". */
export class ShareLog {
  private current: readonly ShareMark[]

  constructor(
    stored: readonly ShareMark[] = [],
    private readonly save: (marks: readonly ShareMark[]) => Promise<void> = () => Promise.resolve(),
  ) {
    this.current = stored
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
}
