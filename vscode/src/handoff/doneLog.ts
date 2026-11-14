import { open, stat } from 'node:fs/promises'

import { kotlinTrim } from '../core/kotlinText'
import { isKnown } from '../core/taskIds'

/** One read never takes more than this. The rest of the file waits for the next read. */
export const MAX_READ = 2 ** 20

const LINE_END = /\r\n|\n|\r/

/** Reads the identifiers that an agent appends to done.txt. Every line is untrusted input. */
export class DoneLog {
  private position = 0

  private refused = 0

  // True while the reader stands inside a line that filled a whole read.
  private passing = false

  constructor(readonly file: string) {}

  get offset(): number {
    return this.position
  }

  get rejected(): number {
    return this.refused
  }

  /** The new identifiers since the last call. A file that became shorter is read from the top. */
  async newIds(): Promise<readonly string[]> {
    const size = await stat(this.file).then(
      (info) => (info.isFile() ? info.size : undefined),
      () => undefined,
    )
    if (size === undefined) return []
    if (size < this.position) {
      this.position = 0
      this.passing = false
    }
    if (size === this.position) return []
    const bytes = await this.read(Math.min(size - this.position, MAX_READ))
    const end = bytes.lastIndexOf(0x0a)
    if (end < 0) return this.passWindow(bytes.length)
    const whole = bytes.subarray(0, end).toString('utf8')
    this.position += end + 1
    return this.keep(this.passing ? whole.slice(whole.indexOf('\n') + 1 || whole.length) : whole)
  }

  /** A short window waits for the rest of its line. A full window holds a line that no read can hold. */
  private passWindow(length: number): readonly string[] {
    if (length < MAX_READ) return []
    this.position += length
    if (!this.passing) this.refused += 1
    this.passing = true
    return []
  }

  private keep(whole: string): readonly string[] {
    this.passing = false
    const lines = whole
      .split(LINE_END)
      .map(kotlinTrim)
      .filter((line) => line !== '')
    this.refused += lines.filter((line) => !isKnown(line)).length
    return lines.filter(isKnown)
  }

  private async read(count: number): Promise<Buffer> {
    const handle = await open(this.file, 'r')
    try {
      const buffer = Buffer.alloc(count)
      const { bytesRead } = await handle.read(buffer, 0, count, this.position)
      return buffer.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
  }
}
