import { isNoteRef } from './notes'
import { type GitResult, type GitRunner, isOk, ran } from './runner'
import { exactly } from './valuePattern'

/** `needsRefspec` is true when the remote has no safe fetch refspec for the notes. */
export interface ShareResult {
  readonly ok: boolean
  readonly message: string
  readonly needsRefspec: boolean
}

export const FETCH_REFSPEC = 'refs/notes/devtools/*:refs/notes/devtools/*'
export const FORCED_REFSPEC = `+${FETCH_REFSPEC}`
export const DEFAULT_REMOTE = 'origin'
const NOTHING_TO_UNSET = 5
const END = '--end-of-options'

const done = (ok: boolean, message: string): ShareResult => ({ ok, message, needsRefspec: false })
const failure = (result: GitResult, fallback: string): ShareResult =>
  done(false, result.stderr.trim() || fallback)
const lines = (text: string): readonly string[] => text.split(/\r?\n/).map((value) => value.trim())

/** Pushes a shared note ref. It writes the git configuration only in `addFetchRefspec`. */
export class NotesSharing {
  constructor(
    private readonly git: GitRunner,
    private readonly remote: string = DEFAULT_REMOTE,
    private readonly writeRefspec = true,
  ) {}

  async share(ref: string): Promise<ShareResult> {
    if (!isNoteRef(ref)) {
      return done(
        false,
        `The extension shares only a note ref, and ${JSON.stringify(ref)} is not one.`,
      )
    }
    // Both reads only read the configuration, so they run together before the push.
    const [known, inPlace] = await Promise.all([
      this.known(),
      this.writeRefspec ? this.refspecInPlace() : Promise.resolve(true),
    ])
    if (!known) {
      return done(
        false,
        `Git has no remote with the name ${this.remote}. The comment stays in the local notes.`,
      )
    }
    const pushed = await this.git.run(['push', END, this.remote, ref])
    if (!isOk(pushed)) return failure(pushed, 'The push failed.')
    return { ok: true, message: '', needsRefspec: !inPlace }
  }

  /** Runs only after the user agrees. It drops the forced refspec and adds the safe one once. */
  async addFetchRefspec(): Promise<ShareResult> {
    if (!(await this.known())) return done(false, `Git has no remote with the name ${this.remote}.`)
    const configured = await this.writeFetchRefspec()
    return isOk(configured)
      ? done(true, '')
      : failure(configured, 'The fetch refspec was not added.')
  }

  /** The name must be a remote of this repository, so a setting cannot push to a path or a URL. */
  private async known(): Promise<boolean> {
    if (this.remote === '' || this.remote.startsWith('-')) return false
    const result = await this.git.run(['remote'])
    return isOk(result) && lines(result.stdout).includes(this.remote)
  }

  private key(): string {
    return `remote.${this.remote}.fetch`
  }

  private async refspecInPlace(): Promise<boolean> {
    const current = await this.git.run(['config', '--get-all', END, this.key()])
    if (!isOk(current)) return !ran(current)
    const values = lines(current.stdout)
    return values.includes(FETCH_REFSPEC) && !values.includes(FORCED_REFSPEC)
  }

  /** Git takes the first matching refspec, so the forced one goes before the safe one is added. */
  private async writeFetchRefspec(): Promise<GitResult> {
    const dropped = await this.git.run([
      'config',
      '--unset-all',
      END,
      this.key(),
      exactly(FORCED_REFSPEC),
    ])
    if (!isOk(dropped) && dropped.exitCode !== NOTHING_TO_UNSET) return dropped
    const current = await this.git.run(['config', '--get-all', END, this.key()])
    if (isOk(current) && lines(current.stdout).includes(FETCH_REFSPEC)) return current
    return this.git.run(['config', '--add', END, this.key(), FETCH_REFSPEC])
  }
}
