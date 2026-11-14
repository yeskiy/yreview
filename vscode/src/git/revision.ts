import { relativeTo } from '../core/anchor'
import { type DiffAnchor, changeFacts, refKindOf, resolveDiffAnchor } from '../core/diffAnchor'
import { NotesWriteError } from './errors'
import { type GitResult, type GitRunner, isOk, ran } from './runner'

const END = '--end-of-options'
// Git reads a pathspec with this mark as plain characters, never as a pattern.
const LITERAL = ':(literal)'

/** An answer of the runner states nothing about the repository, so it stops the caller. */
const answered = (result: GitResult): GitResult => {
  if (!ran(result)) throw new NotesWriteError(result.stderr.trim() || 'Git did not answer.')
  return result
}

/** The full hash of the commit that a revision names, or undefined when it names no commit. */
export const commitOf = async (git: GitRunner, rev: string): Promise<string | undefined> => {
  const result = answered(await git.run(['rev-parse', '-q', '--verify', END, `${rev}^{commit}`]))
  return isOk(result) ? result.stdout.trim() : undefined
}

export const hasFile = async (git: GitRunner, commit: string, relative: string): Promise<boolean> =>
  isOk(answered(await git.run(['cat-file', '-e', END, `${commit}:${relative}`])))

/** True when the index holds a change of this file against HEAD. No external diff program runs. */
export const isStaged = async (git: GitRunner, relative: string): Promise<boolean> =>
  answered(
    await git.run([
      'diff',
      '--cached',
      '--quiet',
      '--no-ext-diff',
      '--no-textconv',
      'HEAD',
      '--',
      `${LITERAL}${relative}`,
    ]),
  ).exitCode === 1

/** The anchor of one `git:` side. An index side anchors at HEAD and is dirty. */
export const diffAnchorOf = async (
  git: GitRunner,
  root: string,
  filePath: string,
  ref: string,
): Promise<DiffAnchor | undefined> => {
  const kind = refKindOf(ref)
  const relative = relativeTo(filePath, root)
  if (kind.kind === 'none' || relative === undefined) return undefined
  const head = await commitOf(git, 'HEAD')
  if (kind.kind === 'index' || (kind.kind === 'indexOrHead' && (await isStaged(git, relative)))) {
    return resolveDiffAnchor(
      changeFacts({ after: { revision: '', file: filePath } }, head, root),
      'right',
    )
  }
  const commit = await commitOf(git, kind.kind === 'commit' ? kind.rev : 'HEAD')
  // A side whose commit lacks the file is a new file, and the left side never falls back.
  const before =
    commit !== undefined && (await hasFile(git, commit, relative))
      ? { revision: commit, file: filePath }
      : undefined
  return resolveDiffAnchor(changeFacts({ before }, head, root), 'left')
}
