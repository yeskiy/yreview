import type { SendReport } from './sendReport'

export interface PushResult {
  readonly report: SendReport
  readonly clipboard: string | undefined
}

/** A refused push leaves the prompt on the clipboard, and the warning stays. */
export const pushFallback = (report: SendReport, prompt: string): PushResult =>
  report.problem === undefined
    ? { report, clipboard: undefined }
    : { report: { ...report, copied: true }, clipboard: prompt }
