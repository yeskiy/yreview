import { kotlinTrim } from '../core/kotlinText'
import { NotesWriteError } from '../git/errors'
import { type NoteStore, splitNote } from '../git/notes'
import { type GitRunner, isOk, ran } from '../git/runner'
import { ALL_REFS } from '../store/noteRefs'

type Notes = ReadonlyMap<string, readonly string[]>

interface Entry {
  readonly tip: string
  readonly notes: Notes
}

const NUL = String.fromCharCode(0)
const OBJECT_ID = /^[0-9a-f]{40}([0-9a-f]{24})?$/
// The exit code of git grep when no line matched.
const NO_MATCH = 1
const READ_ONLY = 'A note snapshot takes no write.'
const CACHE = new Map<string, Entry>()

const cacheKey = (root: string, ref: string): string => `${root}${NUL}${ref}`

export const forgetNotes = (): void => CACHE.clear()

/** A scan only reads, so a CommentBook of a scan gets an author that refuses every write. */
export const noAuthor = (): Promise<string> =>
  Promise.reject(new NotesWriteError('A scan of the review tasks writes no record.'))

const refused = (): Promise<never> => Promise.reject(new Error(READ_ONLY))

/** Every note of the review refs of one repository, held in memory. */
export const noteSnapshot = (notes: ReadonlyMap<string, Notes>): NoteStore => ({
  readLines: (ref, commit) => Promise.resolve(notes.get(ref)?.get(commit) ?? []),
  readOrRefuse: (ref, commit) => Promise.resolve(notes.get(ref)?.get(commit) ?? []),
  commitsWithNotes: (ref) => Promise.resolve([...(notes.get(ref)?.keys() ?? [])]),
  commitsOrRefuse: (ref) => Promise.resolve([...(notes.get(ref)?.keys() ?? [])]),
  append: refused,
  rewrite: refused,
  edit: refused,
})

/** The tip of each ref that exists, in the order of refs. */
const tipsOf = async (
  git: GitRunner,
  refs: readonly string[],
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, string> | undefined> => {
  const result = await git.run(
    ['for-each-ref', '--format=%(objectname)%09%(refname)', '--end-of-options', ...refs],
    signal,
  )
  if (!isOk(result)) return undefined
  const found = new Map(
    result.stdout
      .split('\n')
      .map((line) => kotlinTrim(line).split('\t'))
      .flatMap(([id, name, ...more]) =>
        id !== undefined && name !== undefined && more.length === 0 && OBJECT_ID.test(id)
          ? [[name, id] as const]
          : [],
      ),
  )
  return new Map(
    refs.flatMap((ref) => {
      const tip = found.get(ref)
      return tip === undefined ? [] : [[ref, tip] as const]
    }),
  )
}

/** The lines of every note by tip and by object. */
// An output line is "tip:path", a NUL, and one note line.
const notesOf = async (
  git: GitRunner,
  tips: readonly string[],
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, Notes> | undefined> => {
  const result = await git.run(
    [
      'grep',
      '-z',
      '-a',
      '-G',
      '--no-color',
      '--no-line-number',
      '--no-column',
      '-e',
      '^',
      '--end-of-options',
      ...tips,
    ],
    signal,
  )
  if (!ran(result) || (result.exitCode !== 0 && result.exitCode !== NO_MATCH)) return undefined
  const hits = result.stdout.split('\n').flatMap((record) => {
    const name = record.slice(0, Math.max(record.indexOf(NUL), 0))
    const colon = name.indexOf(':')
    const target = name.slice(colon + 1).replaceAll('/', '')
    return colon > 0 && OBJECT_ID.test(target)
      ? [{ tip: name.slice(0, colon), target, line: record.slice(name.length + 1) }]
      : []
  })
  return hits.reduce((byTip, hit) => {
    const notes = byTip.get(hit.tip) ?? new Map<string, readonly string[]>()
    const lines = [...(notes.get(hit.target) ?? []), ...splitNote(hit.line)]
    return byTip.set(hit.tip, lines.length === 0 ? notes : notes.set(hit.target, lines))
  }, new Map<string, Map<string, readonly string[]>>())
}

/** Undefined when git gave no full answer, so the caller reads each note in turn. */
export const readNotes = async (
  git: GitRunner,
  root: string,
  refs: readonly string[] = ALL_REFS,
  signal?: AbortSignal,
): Promise<NoteStore | undefined> => {
  const tips = await tipsOf(git, refs, signal)
  if (tips === undefined) return undefined
  signal?.throwIfAborted()
  const stale = [
    ...new Set(
      [...tips]
        .filter(([ref, tip]) => CACHE.get(cacheKey(root, ref))?.tip !== tip)
        .map(([, tip]) => tip),
    ),
  ]
  const fresh = stale.length === 0 ? new Map<string, Notes>() : await notesOf(git, stale, signal)
  if (fresh === undefined) return undefined
  signal?.throwIfAborted()
  refs.filter((ref) => !tips.has(ref)).forEach((ref) => CACHE.delete(cacheKey(root, ref)))
  return noteSnapshot(
    new Map(
      [...tips].map(([ref, tip]) => {
        const cached = CACHE.get(cacheKey(root, ref))
        if (cached?.tip === tip) return [ref, cached.notes] as const
        const entry = { tip, notes: fresh.get(tip) ?? new Map<string, readonly string[]>() }
        CACHE.set(cacheKey(root, ref), entry)
        return [ref, entry.notes] as const
      }),
    ),
  )
}
