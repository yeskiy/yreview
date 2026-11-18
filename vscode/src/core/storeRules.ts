// The parts of the store rule that read only path strings. All paths are real paths with "/".
import { FOLDER, NOTES } from '../store/folderNotes'

const DRIVE_ROOT = /^[A-Za-z]:\/$/
const SHARE_ROOT = /^\/\/[^/]+\/[^/]+\/?$/

const withSlash = (root: string): string => (root.endsWith('/') ? root : `${root}/`)

/** True for "/", "C:/" and "//host/share". */
export const isRoot = (path: string): boolean =>
  path === '/' || DRIVE_ROOT.test(path) || SHARE_ROOT.test(path)

export const parentOf = (path: string): string | undefined => {
  if (isRoot(path)) return undefined
  const cut = path.replace(/\/+$/, '').lastIndexOf('/')
  if (cut < 0) return undefined
  const head = path.slice(0, cut)
  if (head === '') return '/'
  return /^[A-Za-z]:$/.test(head) ? `${head}/` : head
}

/** True when the root is the file or an ancestor of it. A name prefix is not an ancestor. */
export const holds = (root: string, filePath: string): boolean =>
  filePath === root || filePath.startsWith(withSlash(root))

/** The path of the file under the root, or undefined when the root does not hold the file. */
export const relativeTo = (filePath: string, root: string): string | undefined =>
  filePath.startsWith(withSlash(root)) && filePath.length > withSlash(root).length
    ? filePath.slice(withSlash(root).length)
    : undefined

/** The folders that the walk checks, nearest first. The first ceiling that the walk reaches stops it. */
export const storeWalk = (
  dir: string,
  workspaceRoot: string | undefined,
  home: string | undefined,
): readonly string[] => {
  if (dir === home) return []
  const parent = dir === workspaceRoot ? undefined : parentOf(dir)
  return [
    dir,
    ...(parent === undefined || parent === home ? [] : storeWalk(parent, workspaceRoot, home)),
  ]
}

export const joinPath = (dir: string, name: string): string => `${withSlash(dir)}${name}`

/** A file directly in home or in the bridge folder of home. It gets no store. */
export const isHomeFile = (filePath: string, home: string | undefined): boolean =>
  home !== undefined && (parentOf(filePath) === home || holds(joinPath(home, FOLDER), filePath))

/** The notes folder of the store at the folder, with no doubled slash. */
export const storeFolderOf = (dir: string): string => joinPath(joinPath(dir, FOLDER), NOTES)

/** The last segment and the short path of a root. The short path puts "~" for home. */
export const rootLabel = (root: string, home: string | undefined): string => {
  if (root === home) return '~'
  const short = home !== undefined && holds(home, root) ? `~/${relativeTo(root, home) ?? ''}` : root
  const name = root.replace(/\/+$/, '').split('/').at(-1) ?? ''
  return name === '' || name.endsWith(':') ? short : `${name} (${short})`
}
