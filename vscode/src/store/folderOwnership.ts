import { type GitRunner, isOk, ran } from '../git/runner'
import { FOLDER } from './folderNotes'

/** The mark that makes git read a pathspec as plain characters. */
export const LITERAL = ':(literal)'

// `--` and no `--end-of-options`: ls-files then reads `--` as a path, and a tracked folder looks untracked.
const answer = (git: GitRunner, folder: string) =>
  git.run(['ls-files', '--error-unmatch', '--', `${LITERAL}${folder}`])

/** True when git tracks at least one file under this folder. The runner works in the parent folder. */
export const isTracked = async (git: GitRunner, folder: string = FOLDER): Promise<boolean> =>
  isOk(await answer(git, folder))

/** True only when git answered and tracks no file there. A git that did not answer knows no owner. */
export const mayMigrate = async (git: GitRunner, folder: string = FOLDER): Promise<boolean> => {
  const result = await answer(git, folder)
  return ran(result) && !isOk(result)
}
