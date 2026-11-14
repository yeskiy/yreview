import { realpath } from 'node:fs'
import { promisify } from 'node:util'

import { kotlinTrim } from '../core/kotlinText'
import { isUnder } from '../core/paths'
import { type GitRunner, isOk } from '../git/runner'

const realpathNative = promisify(realpath.native)

/** The long real path with `/`, as git spells a root. On Windows it gives the long form of an 8.3 path. */
export const projectPath = async (fsPath: string): Promise<string> =>
  (await realpathNative(fsPath).catch(() => fsPath)).replaceAll('\\', '/')

/** The repository root of the folder of the runner, or undefined outside every repository. */
export const gitRoot = async (
  git: GitRunner,
  signal?: AbortSignal,
): Promise<string | undefined> => {
  const result = await git.run(['rev-parse', '--show-toplevel'], signal)
  return isOk(result) ? kotlinTrim(result.stdout) : undefined
}

const holds = (outer: string, inner: string): boolean => inner === outer || isUnder(outer, inner)

/** The innermost workspace folder that holds the root. A root outside every folder gets none. */
export const basePathOf =
  (folders: readonly string[]) =>
  (root: string): string | undefined =>
    [...folders].filter((folder) => holds(folder, root)).sort((a, b) => b.length - a.length)[0]

/** True when this root holds the file and no deeper root holds it. */
export const ownsFile = (root: string, filePath: string, roots: readonly string[]): boolean =>
  holds(root, filePath) &&
  !roots.some((other) => other.length > root.length && holds(other, filePath))

export const uniqueRoots = (roots: readonly (string | undefined)[]): readonly string[] =>
  [...new Set(roots.filter((root): root is string => root !== undefined && root !== ''))].sort()
