export const LINK_AUTHORITY = 'yeskiy.yreview'
export const LINK_PATH = '/comment'
export const MAX_LINE = 10_000_000
const BASE64URL = /^[A-Za-z0-9_-]+$/
const LINE = /^[1-9][0-9]{0,7}$/

export interface CommentTarget {
  readonly file: string
  readonly line: number
}

/** The address that opens an empty comment thread on one line. The path is base64url, so no decoder changes it. */
export const commentLink = (scheme: string, file: string, line: number): string =>
  `${scheme}://${LINK_AUTHORITY}${LINK_PATH}?file=${Buffer.from(file, 'utf8').toString('base64url')}&line=${line}`

const decoded = (value: string): string | undefined => {
  const text = Buffer.from(value, 'base64url').toString('utf8')
  return BASE64URL.test(value) &&
    Buffer.from(text, 'utf8').toString('base64url') === value &&
    !text.includes('\u0000')
    ? text
    : undefined
}

/** The target of a link, or undefined for a link that this extension did not make. */
export const parseCommentLink = (path: string, query: string): CommentTarget | undefined => {
  if (path !== LINK_PATH) return undefined
  const params = new URLSearchParams(query)
  const file = decoded(params.get('file') ?? '')
  const line = params.get('line') ?? ''
  return file !== undefined && LINE.test(line) && Number(line) <= MAX_LINE
    ? { file, line: Number(line) }
    : undefined
}
