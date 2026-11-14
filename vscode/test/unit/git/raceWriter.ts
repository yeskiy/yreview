// One writer process of notesRace.test.ts: it appends one line, then removes another line.
import { NotesGateway } from '../../../src/git/notes'
import { ProcessGitRunner } from '../../../src/git/runner'

const [repo = '', ref = '', commit = '', add = '', drop = ''] = process.argv.slice(2)
const gateway = new NotesGateway(new ProcessGitRunner(repo))

const outcome = (work: Promise<unknown>): Promise<boolean> =>
  work.then(
    () => true,
    () => false,
  )

outcome(gateway.append(ref, commit, add))
  .then(async (added) => ({
    added,
    dropped: await outcome(
      gateway.edit(ref, commit, (lines) => lines.filter((line) => line !== drop)),
    ),
  }))
  .then((answer) => process.stdout.write(JSON.stringify(answer)))
