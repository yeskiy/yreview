import { realpath } from 'node:fs/promises'
import nodePath from 'node:path'

import { sha256Hex } from './digest'
import { kotlinTrim } from './kotlinText'

const DRIVE = /^[A-Za-z]:/
// The `u` flag reads a pair of surrogates as one code point, as the Java regex engine does.
const NOT_ALPHANUMERIC = /[^A-Za-z0-9]/gu

/** The path with `/`, and with each `.` and `..` step made. A `..` at the top climbs nothing. */
export const resolvePath = (path: string): string => {
  const plain = path.replaceAll('\\', '/')
  const steps = plain.split('/').reduce<readonly string[]>((done, step) => {
    if (step === '' || step === '.') return done
    return step === '..' ? done.slice(0, -1) : [...done, step]
  }, [])
  return `${plain.startsWith('/') ? '/' : ''}${steps.join('/')}`
}

export const isUnder = (rootPath: string, filePath: string): boolean => {
  const root = resolvePath(rootPath)
  const file = resolvePath(filePath)
  return (
    root !== '' &&
    file.length > root.length + 1 &&
    file.startsWith(root) &&
    file[root.length] === '/'
  )
}

const isAbsolute = (path: string): boolean =>
  path.startsWith('/') || path.startsWith('\\') || DRIVE.test(path)

/** True when a path from a note names a file under the root. An absolute path is refused. */
export const isRelativeUnder = (rootPath: string, relative: string): boolean =>
  !isAbsolute(relative) && isUnder(rootPath, `${rootPath}/${relative}`)

/** A relative path with `/` and each step made, or undefined when empty, absolute or climbing out. */
export const normalizeRelative = (raw: string): string | undefined => {
  const text = kotlinTrim(raw).replaceAll('\\', '/')
  if (text === '' || text.startsWith('/') || DRIVE.test(text)) return undefined
  const steps = text
    .split('/')
    .filter((step) => step !== '' && step !== '.')
    .reduce<readonly string[] | undefined>((done, step) => {
      if (done === undefined) return undefined
      if (step !== '..') return [...done, step]
      return done.length === 0 ? undefined : done.slice(0, -1)
    }, [])
  return steps === undefined || steps.length === 0 ? undefined : steps.join('/')
}

/** The long real path of a file that may not exist: the real path of its deepest folder, then the rest. */
export const realOf = async (target: string): Promise<string> => {
  const real = await realpath(target).catch(() => undefined)
  if (real !== undefined) return real
  const parent = nodePath.dirname(target)
  return parent === target ? target : nodePath.join(await realOf(parent), nodePath.basename(target))
}

/** The absolute path of a note path under the root. Undefined when it leaves the root, also by a link. */
export const containedPath = async (
  root: string,
  relative: string,
): Promise<string | undefined> => {
  if (relative.includes('\u0000') || !isRelativeUnder(root, relative)) return undefined
  const joined = nodePath.resolve(root, relative)
  return isUnder(await realOf(root), await realOf(joined)) ? joined : undefined
}

const readable = (text: string): string => text.replace(NOT_ALPHANUMERIC, '-')

/** The name of the bridge discovery file of a project, as DiscoveryFile.fileName makes it. */
export const discoveryFileName = (projectPath: string): string =>
  `${readable(projectPath).slice(-58)}-${sha256Hex(projectPath).slice(0, 16)}.json`

/** The name of the handoff window folder of a project, as HandoffPlace.window makes it. */
export const windowFolderName = (projectPath: string): string =>
  `${readable(projectPath.split(/[/\\]/).pop() ?? '').slice(-24) || 'project'}-${sha256Hex(projectPath).slice(0, 8)}`
