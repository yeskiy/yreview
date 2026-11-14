import { NotesWriteError } from './errors'
import { type GitRunner, isOk, ran } from './runner'

/** The author of a new record. It is part of the record identity, so it must come from git. */
export const gitAuthor = async (runner: GitRunner): Promise<string> => {
  const answer = await runner.run(['config', 'user.email'])
  const email = answer.stdout.trim()
  if (isOk(answer) && email !== '') return email
  const reason = ran(answer)
    ? 'Git has no user.email. Set git user.name and user.email, for example with git config --global user.email.'
    : `Git did not answer. Make sure that the extension can start git. ${answer.stderr.trim()}`
  throw new NotesWriteError(
    `The extension wrote no comment, because it cannot get the author. ${reason}`.trim(),
  )
}
