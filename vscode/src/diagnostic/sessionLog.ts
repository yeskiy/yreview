import type { SessionRecord } from './sessionRecord'

/** The number of records the ring keeps. Each record is a short block, so the ring stays small. */
export const LIMIT = 50

/** The last records of this window, in memory only. The next record drops the oldest one. */
export class SessionLog {
  private readonly records: SessionRecord[] = []

  add(record: SessionRecord): void {
    this.records.push(record)
    this.records.splice(0, Math.max(0, this.records.length - LIMIT))
  }

  /** The newest record comes first, because a reader looks at the last run. */
  recent(): readonly SessionRecord[] {
    return this.records.toReversed()
  }
}
