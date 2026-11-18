import { isRelativeUnder } from '../core/paths'
import { type GitRunner, isOk } from '../git/runner'
import { LITERAL } from '../store/folderOwnership'

const NUL = String.fromCharCode(0)

/** The paths of `git status --porcelain=v1 -z` that still name a file of the working tree. */
export const parseStatus = (output: string): readonly string[] =>
  output.split(NUL).flatMap((entry) => {
    if (entry.length < 4 || entry[2] !== ' ') return []
    return entry[0] === 'D' || entry[1] === 'D' ? [] : [entry.slice(3)]
  })

/** The changed files of one repository, or of the given paths only, each as root and path with `/`. */
// --no-optional-locks keeps git status from a write of the index, which starts a new scan.
export const changeFiles = async (
  git: GitRunner,
  root: string,
  signal?: AbortSignal,
  paths?: readonly string[],
): Promise<readonly string[] | undefined> => {
  if (paths?.length === 0) return []
  const result = await git.run(
    [
      '--no-optional-locks',
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
      '--no-renames',
      ...(paths === undefined ? [] : ['--', ...paths.map((file) => `${LITERAL}${file}`)]),
    ],
    signal,
  )
  if (!isOk(result)) return undefined
  return parseStatus(result.stdout)
    .filter((path) => isRelativeUnder(root, path))
    .map((path) => `${root}/${path}`)
}
