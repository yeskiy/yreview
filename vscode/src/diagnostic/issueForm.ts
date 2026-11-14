import { isKotlinBlank, kotlinTrim } from '../core/kotlinText'
import { type CleanFailure, failureText } from '../core/redact'
import type { Places } from '../log'
import { cleanWith } from './report'

export const ISSUE_URL = 'https://github.com/yeskiy/yreview/issues/new'
/** The smallest cap a browser is known to hold. A longer address loses its tail. */
export const MAX_URL = 2000
/** The lines of one stack that reach the form. The first lines name the defect. */
export const STACK_LINES = 30
export const TITLE_LENGTH = 80
const FENCE = '```'
const LINE_BREAK = /\r\n|\n|\r/

export interface IssueLink {
  readonly url: string
  readonly prefilled: boolean
}

/** The cut runs after the redaction. A cut path would otherwise not match and stay. */
export const issueTitle = (type: string, message: string, places: Places): string => {
  const first = cleanWith(places)(message).split(LINE_BREAK)[0] ?? ''
  return isKotlinBlank(first) ? type : `${type}: ${first.slice(0, TITLE_LENGTH)}`
}

const cut = (stack: string): string => stack.split(LINE_BREAK).slice(0, STACK_LINES).join('\n')

export const issueBody = (
  details: string | undefined,
  stacks: readonly string[],
  machine: string,
  places: Places,
): string =>
  cleanWith(places)(
    [
      '### What happened',
      '',
      kotlinTrim(details ?? '') || 'The reporter wrote nothing here.',
      '',
      '### Stack',
      '',
      stacks.map((stack) => `${FENCE}\n${cut(stack)}\n${FENCE}`).join('\n\n'),
      '',
      '### Machine',
      '',
      FENCE,
      machine,
      FENCE,
      '',
      'Run Yreview: Copy Diagnostic Report, and paste the report here. The report holds the switches and the last records.',
    ].join('\n'),
  )

/** The address of the form. A text over the cap gives the plain address, and the caller copies the text. */
export const issueLink = (base: string, title: string, body: string): IssueLink => {
  const full = `${base}?${new URLSearchParams({ title, body }).toString()}`
  return full.length > MAX_URL ? { url: base, prefilled: false } : { url: full, prefilled: true }
}

/** The stack of a clean failure, with each cause after its frames. */
export const failureStack = (failure: CleanFailure): string =>
  [
    failureText(failure),
    ...failure.frames.map((frame) => `    ${frame}`),
    ...(failure.cause === undefined ? [] : [`Caused by: ${failureStack(failure.cause)}`]),
  ].join('\n')
