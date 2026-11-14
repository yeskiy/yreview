import { open } from 'node:fs/promises'

import { isKotlinBlank } from '../core/kotlinText'

export const FILE_VARIABLE = 'Y_REVIEW_BRIDGE_FILE'
export const KEY_VARIABLE = 'Y_REVIEW_SESSION_KEY'
export const MIN_TOKEN_LENGTH = 16
export const MAX_FILE_BYTES = 65_536

export interface BridgeConfig {
  readonly bridgeUrl: string
  readonly token: string
  readonly sessionKey?: string
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError'
}

const LOOPBACK_NAMES = new Set(['localhost', '[::1]', '::1'])
const IPV4 = /^(\d{1,3})\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

const attempt = <T>(work: () => T): T | undefined => {
  try {
    return work()
  } catch {
    return undefined
  }
}

const optionalText = (value: unknown): boolean =>
  value === undefined || value === null || typeof value === 'string'

/** One open handle gives the size and the text, so the file cannot grow between the two. */
const readBounded = async (raw: string): Promise<string> => {
  const handle = await (async () => open(raw, 'r'))().catch(() => undefined)
  if (handle === undefined) throw new ConfigError(`${FILE_VARIABLE} names no file`)
  try {
    const stats = await handle.stat()
    if (!stats.isFile()) throw new ConfigError(`${FILE_VARIABLE} names no file`)
    if (stats.size > MAX_FILE_BYTES) {
      throw new ConfigError(`${FILE_VARIABLE} names a file that is too large to hold a bridge`)
    }
    return await handle.readFile('utf8').catch(() => {
      throw new ConfigError(`${FILE_VARIABLE} names a file that this session cannot read`)
    })
  } finally {
    await handle.close()
  }
}

/** The environment names the file, so the reader bounds what it takes before it reads. */
const readBridgeFile = async (
  raw: string | undefined,
): Promise<{ readonly url?: string; readonly token?: string }> => {
  if (raw === undefined || isKotlinBlank(raw)) {
    throw new ConfigError(`${FILE_VARIABLE} must name the bridge file of the project`)
  }
  const text = await readBounded(raw)
  const parsed = attempt(() => JSON.parse(text) as unknown)
  const fields =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  if (fields === undefined || !optionalText(fields.url) || !optionalText(fields.token)) {
    throw new ConfigError(`${FILE_VARIABLE} names a file that holds no valid JSON`)
  }
  return {
    url: (fields.url as string | null) ?? undefined,
    token: (fields.token as string | null) ?? undefined,
  }
}

const isLoopback = (hostname: string): boolean =>
  LOOPBACK_NAMES.has(hostname.toLowerCase()) || IPV4.exec(hostname)?.[1] === '127'

const checkUrl = (raw: string): string => {
  const url = attempt(() => new URL(raw))
  if (url === undefined)
    throw new ConfigError(`the file of ${FILE_VARIABLE} holds no address: ${raw}`)
  const scheme = url.protocol.replace(/:$/, '')
  if (scheme !== 'http')
    throw new ConfigError(`the file of ${FILE_VARIABLE} must use http, not ${scheme}`)
  if (url.hostname === '')
    throw new ConfigError(`the file of ${FILE_VARIABLE} holds no address: ${raw}`)
  if (!isLoopback(url.hostname)) {
    throw new ConfigError(
      `the file of ${FILE_VARIABLE} must point at the loopback address, not ${url.hostname}`,
    )
  }
  return `http://${url.hostname}${url.port === '' ? '' : `:${url.port}`}${url.pathname.replace(/\/+$/, '')}`
}

/** The message names the length and never the value, so no log line can hold a token. */
const checkToken = (raw: string | undefined): string => {
  if (raw === undefined || raw.length < MIN_TOKEN_LENGTH) {
    throw new ConfigError(
      `the file of ${FILE_VARIABLE} must hold a token of ${MIN_TOKEN_LENGTH} characters or more`,
    )
  }
  return raw
}

export const parseConfig = async (
  environment: Readonly<Record<string, string | undefined>>,
): Promise<BridgeConfig> => {
  const file = await readBridgeFile(environment[FILE_VARIABLE])
  const key = environment[KEY_VARIABLE]
  return {
    bridgeUrl: checkUrl(file.url ?? ''),
    token: checkToken(file.token),
    ...(key === undefined || isKotlinBlank(key) ? {} : { sessionKey: key }),
  }
}
