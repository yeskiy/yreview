import { randomBytes } from 'node:crypto'

export const SESSION_KEY_VARIABLE = 'Y_REVIEW_SESSION_KEY'
export const SESSION_HEADER = 'X-Y-Review-Session'

export const KEY_BYTES = 8
const MIN_LENGTH = 8
export const MAX_LENGTH = 64
const ALLOWED = /^[A-Za-z0-9-]+$/

/** The address of one session on the bridge. It names a session and guards nothing. */
export const newSessionKey = (): string => randomBytes(KEY_BYTES).toString('hex')

export const isValidSessionKey = (value: string | undefined): boolean =>
  value !== undefined &&
  value.length >= MIN_LENGTH &&
  value.length <= MAX_LENGTH &&
  ALLOWED.test(value)
