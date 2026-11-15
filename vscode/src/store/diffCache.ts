import { stat } from 'node:fs/promises'
import path from 'node:path'

import { type FileDiff, parseDiff } from '../core/lineMap'
import { type GitRunner, isOk } from '../git/runner'

interface Entry {
  readonly head: string
  readonly stamp: string
  readonly diff: FileDiff | undefined
}

const CACHE = new Map<string, Entry>()
const REFUSED = new Map<string, string>()
const MAX_ENTRIES = 4000
const PATHS_PER_CALL = 100
const OBJECT_ID = /^[0-9a-f]{40}([0-9a-f]{24})?$/u

export const forgetDiffs = (): void => {
  CACHE.clear()
  REFUSED.clear()
}

const keyOf = (...parts: readonly string[]): string => parts.join('\u0000')

const stampOf = async (root: string, file: string): Promise<string> => {
  const info = await stat(path.join(root, file)).catch(() => undefined)
  return info === undefined ? 'missing' : `${info.size}:${info.mtimeMs}`
}

const chunksOf = <T>(items: readonly T[]): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / PATHS_PER_CALL) }, (_, index) =>
    items.slice(index * PATHS_PER_CALL, (index + 1) * PATHS_PER_CALL),
  )

const read = async (
  git: GitRunner,
  commit: string,
  paths: readonly string[],
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, FileDiff> | undefined> => {
  const result = await git.run(
    [
      '--literal-pathspecs',
      '-c',
      'core.quotePath=false',
      'diff',
      '-U0',
      '--no-color',
      '--no-ext-diff',
      '--no-renames',
      '--no-textconv',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      commit,
      '--',
      ...paths,
    ],
    signal,
  )
  return isOk(result) ? parseDiff(result.stdout) : undefined
}

/** The diff of each path from `commit` to the working tree. Undefined when git refused the commit. */
export const diffsOf = async (
  git: GitRunner,
  root: string,
  head: string,
  commit: string,
  paths: readonly string[],
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, FileDiff | undefined> | undefined> => {
  if (!OBJECT_ID.test(commit) || REFUSED.get(keyOf(root, commit)) === head) return undefined
  const stamps = new Map(
    await Promise.all(paths.map(async (file) => [file, await stampOf(root, file)] as const)),
  )
  const known = new Map(
    paths.flatMap((file) => {
      const entry = CACHE.get(keyOf(root, commit, file))
      return entry?.head === head && entry.stamp === stamps.get(file)
        ? [[file, entry.diff] as const]
        : []
    }),
  )
  const wanted = paths.filter((file) => !known.has(file))
  const answers = await chunksOf(wanted).reduce<
    Promise<readonly (ReadonlyMap<string, FileDiff> | undefined)[]>
  >(
    async (done, chunk) => [...(await done), await read(git, commit, chunk, signal)],
    Promise.resolve([]),
  )
  if (answers.includes(undefined)) {
    REFUSED.set(keyOf(root, commit), head)
    return undefined
  }
  if (CACHE.size + wanted.length > MAX_ENTRIES) CACHE.clear()
  const fresh = wanted.map(
    (file) => [file, answers.find((answer) => answer?.has(file))?.get(file)] as const,
  )
  fresh.forEach(([file, diff]) =>
    CACHE.set(keyOf(root, commit, file), { head, stamp: stamps.get(file) ?? 'missing', diff }),
  )
  return new Map([...known, ...fresh])
}
