import { kotlinTrim } from '../core/kotlinText'
import { isMarkup, plainTitle } from '../tasks/taskLabels'

export interface OpenCodeSession {
  readonly id: string
  readonly title: string
  readonly directory: string
  readonly updated: number
}

const DRIVE = /^[a-z]:/

const textField = (value: unknown): string | undefined => {
  if (value === undefined) return ''
  return typeof value === 'string' ? value : undefined
}

const parsed = (body: string): unknown => {
  try {
    return JSON.parse(body) as unknown
  } catch {
    return undefined
  }
}

const sessionOf = (row: unknown): OpenCodeSession | undefined => {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return undefined
  const fields = row as Record<string, unknown>
  const time = fields.time ?? {}
  const updated =
    typeof time === 'object' && time !== null
      ? ((time as Record<string, unknown>).updated ?? 0)
      : undefined
  const [id, title, directory] = [
    textField(fields.id),
    textField(fields.title),
    textField(fields.directory),
  ]
  return id === undefined ||
    title === undefined ||
    directory === undefined ||
    typeof updated !== 'number'
    ? undefined
    : { id, title, directory, updated }
}

/** Every field has a default, so a new OpenCode release that drops one still parses. A bad answer holds no session. */
export const parseSessions = (body: string): readonly OpenCodeSession[] => {
  const value = parsed(body)
  if (!Array.isArray(value)) return []
  const rows = value.map(sessionOf)
  return rows.every((row) => row !== undefined) ? rows : []
}

const plain = (directory: string): string =>
  directory
    .replaceAll('\\', '/')
    .replace(/\/+$/, '')
    .replace(DRIVE, (drive) => drive.toUpperCase())

/** Case stays, because Linux holds Project and project as two folders. Only the drive letter folds. */
export const sameDirectory = (left: string, right: string): boolean => plain(left) === plain(right)

export const pickTitle = (
  sessions: readonly OpenCodeSession[],
  directory: string,
): string | undefined => {
  const newest = sessions
    .filter((session) => sameDirectory(session.directory, directory))
    .reduce<OpenCodeSession | undefined>(
      (best, session) => (best === undefined || session.updated > best.updated ? session : best),
      undefined,
    )
  const title = newest === undefined ? '' : kotlinTrim(newest.title)
  return title === '' || isMarkup(title) ? undefined : plainTitle(title)
}
