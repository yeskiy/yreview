import path from 'node:path'

import { type GitRunner, isOk } from './runner'

export const REVIEW_FOLDER = 'y-review'

/** The git directory of the repository or worktree of the runner, or undefined outside git. */
export const gitDirOf = async (git: GitRunner): Promise<string | undefined> => {
  const result = await git.run(['rev-parse', '--absolute-git-dir'])
  const text = result.stdout.trim()
  return isOk(result) && text !== '' ? path.resolve(text) : undefined
}

/** The folder of the extension in the git directory. Git never tracks it, so it needs no ignore entry. */
export const reviewFolderOf = async (git: GitRunner): Promise<string | undefined> => {
  const dir = await gitDirOf(git)
  return dir === undefined ? undefined : path.join(dir, REVIEW_FOLDER)
}
