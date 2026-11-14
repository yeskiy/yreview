export const MAX_TRIES = 5
/** A start that lost its port ends after about 0.9 s, far under this limit. */
export const SHORT_MS = 5000

export const startAgain = (push: string, livedMs: number, tries: number): boolean =>
  push === 'local_http' && livedMs < SHORT_MS && tries < MAX_TRIES
