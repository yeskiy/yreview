import type { Log } from '../log'
import { type CloseReport, isQuiet } from '../tasks/taskCompletion'
import { DoneLog } from './doneLog'

export const DONE_DELAY_MS = 3_000

/** Reads the done files of this window after the first send, until the window closes. */
export class DoneWatch {
  private readonly logs = new Map<string, DoneLog>()

  private timer: NodeJS.Timeout | undefined

  private busy = false

  constructor(
    private readonly close: (ids: readonly string[]) => Promise<CloseReport>,
    private readonly announce: (report: CloseReport) => void,
    private readonly log: Log,
    private readonly delayMs = DONE_DELAY_MS,
  ) {}

  watch(done: string): void {
    if (!this.logs.has(done)) this.logs.set(done, new DoneLog(done))
    this.timer ??= setInterval(() => {
      this.tick().catch((error: unknown) => this.log.error('A done file read failed.', error))
    }, this.delayMs)
    this.timer.unref()
  }

  /** One read of every file. A read that runs makes the next tick do nothing. */
  async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const ids = (
        await Promise.all(
          [...this.logs.values()].map((log) =>
            log.newIds().catch((error: unknown): readonly string[] => {
              this.log.warn(`The extension could not read a done file. ${String(error)}`)
              return []
            }),
          ),
        )
      ).flat()
      if (ids.length === 0) return
      const report = await this.close(ids)
      // A line that closed nothing stays quiet, because a restart reads the whole file again.
      if (!isQuiet(report)) this.announce(report)
    } finally {
      this.busy = false
    }
  }

  dispose(): void {
    clearInterval(this.timer)
    this.timer = undefined
    this.logs.clear()
  }
}
