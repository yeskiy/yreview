import { stat } from 'node:fs/promises'
import path from 'node:path'

import { type GitRunner, isOk } from '../git/runner'

const STORE = '.y-review'
const LEFT_OUT = new Set(['node_modules', '.git'])

const UNTRACKED = [
  'ls-files',
  '-z',
  '--others',
  '--exclude-standard',
  '--',
  ':(glob)**/.y-review/notes/**',
]
const IGNORED = ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory']

const entriesOf = (stdout: string): readonly string[] =>
  stdout.split('\u0000').filter((entry) => entry !== '')

/** The segments before the first `.y-review` segment, or undefined when the entry has none. */
const rootSegments = (entry: string): readonly string[] | undefined => {
  const segments = entry.split('/')
  const at = segments.indexOf(STORE)
  return at < 0 ? undefined : segments.slice(0, at)
}

const isFolder = (folder: string): Promise<boolean> =>
  stat(folder).then(
    (found) => found.isDirectory(),
    () => false,
  )

/** Every untracked store root inside the work tree of root, nested repositories and ignored folders left out. */
// The runner runs git in root. Undefined means that git did not answer, so the caller moves nothing.
export const childStores = async (
  runner: GitRunner,
  root: string,
  signal?: AbortSignal,
): Promise<readonly string[] | undefined> => {
  const [untracked, ignored] = await Promise.all([
    runner.run(UNTRACKED, signal),
    runner.run(IGNORED, signal),
  ])
  if (!isOk(untracked) || !isOk(ignored)) return undefined
  const kept = await Promise.all(
    entriesOf(ignored.stdout)
      .map((entry) => entry.replace(/\/+$/, ''))
      .filter((entry) => entry.split('/').at(-1) === STORE)
      .map(async (entry) =>
        (await isFolder(path.join(root, entry, 'notes'))) ? entry : undefined,
      ),
  )
  return [
    ...new Set(
      [...entriesOf(untracked.stdout), ...kept.filter((entry) => entry !== undefined)]
        .map(rootSegments)
        .filter(
          (segments) =>
            segments !== undefined && !segments.some((segment) => LEFT_OUT.has(segment)),
        )
        .map((segments) => path.join(root, ...(segments ?? []))),
    ),
  ].sort()
}
