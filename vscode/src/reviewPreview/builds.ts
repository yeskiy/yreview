/** The last page build of a panel, its HTML, and how many times the panel sent that HTML again. */
export interface Built {
  readonly build: number
  readonly html: string
  readonly resends: number
}

/** A page report: the page script listens, or the webview host keeps the loaded page hidden. */
export interface PageReport {
  readonly type: 'ready' | 'stalled'
  readonly build?: number
}

export type PageAnswer = 'accept' | 'resend' | 'ignore'

/** A page that does not show after this many resends keeps its state, so the panel cannot loop. */
export const MAX_RESENDS = 5

export const NO_BUILD: Built = { build: 0, html: '', resends: 0 }

/** What the panel does with a page report. A page of an old build, or a hidden page, gets the last HTML again. */
export const answerOf = (built: Built, report: PageReport): PageAnswer => {
  const current = report.build === undefined || report.build === built.build
  if (report.type === 'ready' && current) return 'accept'
  if (built.build === 0 || (report.type === 'stalled' && !current)) return 'ignore'
  return built.resends < MAX_RESENDS ? 'resend' : 'ignore'
}

/** The next resend. The webview skips HTML that equals its last HTML, so each resend differs. */
export const resend = (built: Built): { readonly built: Built; readonly html: string } => ({
  built: { ...built, resends: built.resends + 1 },
  html: `${built.html}<!-- ${built.resends + 1} -->`,
})
