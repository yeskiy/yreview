import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const TOKEN_HEADER = 'X-Y-Review-Token'

export const newToken = (): string => randomBytes(32).toString('hex')

const digestOf = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest()

/** Constant time over the digests, so the time tells nothing about the token or its length. */
export const tokenMatches = (expected: string, given: string | undefined): boolean =>
  expected !== '' &&
  given !== undefined &&
  given !== '' &&
  timingSafeEqual(digestOf(expected), digestOf(given))
