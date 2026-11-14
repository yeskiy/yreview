import { SECRET_MARK } from '../core/redact'
import { type OpenCodeSession, parseSessions } from './openCodeTitle'

export const OPENCODE_USER = 'opencode'
export const PASSWORD_VARIABLE = 'OPENCODE_SERVER_PASSWORD'
export const APPEND_PATH = '/tui/append-prompt'
export const SUBMIT_PATH = '/tui/submit-prompt'
export const LIST_PATH = '/session?roots=true'
export const TIMEOUT_MS = 5000
const LOOPBACK = '127.0.0.1'
/** The append route inserts at the cursor, so a blank line keeps a half typed line apart. */
const BREAK = '\n\n'

export const appendBody = (text: string): string => JSON.stringify({ text })

export const authorization = (password: string): string =>
  `Basic ${Buffer.from(`${OPENCODE_USER}:${password}`, 'utf8').toString('base64')}`

const hide = (password: string, text: string): string =>
  password === '' ? text : text.replaceAll(password, SECRET_MARK)

const causeOf = (failure: unknown): string => {
  const error = failure instanceof Error ? failure : new Error(String(failure))
  const inner =
    error.cause instanceof Error && error.cause.message !== '' ? ` (${error.cause.message})` : ''
  return error.message.trim() === '' ? error.name : `${error.name}: ${error.message.trim()}${inner}`
}

/** The text of a call that got no answer. It never holds the password. */
export const callProblem = (path: string, password: string, failure: unknown): string =>
  hide(
    password,
    `The OpenCode session did not answer at ${path}. The cause is ${causeOf(failure)}.`,
  )

const post = async (
  port: number,
  password: string,
  path: string,
  body: string,
): Promise<number> => {
  const response = await fetch(`http://${LOOPBACK}:${port}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authorization(password) },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  await response.body?.cancel()
  return response.status
}

const call = (
  port: number,
  password: string,
  path: string,
  body: string,
): Promise<number | string> =>
  post(port, password, path, body).catch((failure: unknown) => callProblem(path, password, failure))

/** Undefined after a good push. A 200 proves that the server took the text, not that the session read it. */
export const pushPrompt = async (
  port: number,
  password: string,
  text: string,
): Promise<string | undefined> => {
  const append = await call(port, password, APPEND_PATH, appendBody(BREAK + text))
  if (typeof append === 'string') return append
  if (append !== 200) return `${APPEND_PATH} answered ${append}.`
  const submit = await call(port, password, SUBMIT_PATH, '')
  if (typeof submit === 'string') return submit
  return submit === 200 ? undefined : `${SUBMIT_PATH} answered ${submit}.`
}

/** The sessions of the server, or undefined after any failure. A tab name needs no error. */
export const listSessions = (
  port: number,
  password: string,
): Promise<readonly OpenCodeSession[] | undefined> =>
  fetch(`http://${LOOPBACK}:${port}${LIST_PATH}`, {
    headers: { Authorization: authorization(password) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
    .then(async (response) =>
      response.status === 200 ? parseSessions(await response.text()) : undefined,
    )
    .catch(() => undefined)
