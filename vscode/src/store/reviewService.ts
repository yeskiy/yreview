import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'

import { isRelativeUnder } from '../core/paths'
import type { RecordRange } from '../core/record'
import { gitAuthor } from '../git/author'
import { NotesWriteError } from '../git/errors'
import { NotesGateway } from '../git/notes'
import { type GitResult, ProcessGitRunner, isOk, ran } from '../git/runner'
import { NotesSharing } from '../git/sharing'
import { CommentBook, type StoredComment } from './commentBook'
import { isShared, refFor } from './noteRefs'
import { RefspecAsks } from './refspecAsks'

export interface Anchor {
  readonly root: string
  readonly head: string
  readonly path: string
}

export type AnchorResult =
  | { readonly kind: 'git'; readonly anchor: Anchor }
  | { readonly kind: 'noCommit' }
  | { readonly kind: 'noRepository' }

/** The comment that was written, and the reason the push failed when it did. */
export interface WriteResult {
  readonly stored: StoredComment
  readonly shareError?: string
}

/** How many note lines a delete removed, and the reason the push failed when it did. */
export interface DeleteResult {
  readonly removed: number
  readonly shareError?: string
}

export type RefspecAnswer = 'add' | 'never' | undefined

/** What the service needs from the editor. Tests give a fake. */
export interface ServiceHost {
  gitPath(): string
  settings(root: string): { readonly remote: string; readonly writeRefspec: boolean }
  askRefspec(root: string, name: string): Promise<RefspecAnswer>
  declinedRoots(): readonly string[]
  saveDeclinedRoots(roots: readonly string[]): Promise<void>
  warn(message: string): void
}

export const NO_COMMIT = 'This repository has no commit yet.'
export const NO_REPOSITORY =
  'This file is not in a git repository. Yreview for VS Code keeps comments in git notes only.'

const NO_REPOSITORY_RESULT: AnchorResult = { kind: 'noRepository' }

const isDirectory = async (dir: string): Promise<boolean> =>
  (await stat(dir).catch(() => undefined))?.isDirectory() === true

/** An answer of the runner states nothing about the repository, so it stops the caller. */
const fromGit = (result: GitResult): GitResult => {
  if (!ran(result)) throw new NotesWriteError(result.stderr.trim() || 'Git did not answer.')
  return result
}

/** Writes, resolves and deletes review comments in the git notes, and pushes the shared ones. */
export class ReviewService {
  private readonly listeners = new Set<() => void>()

  private readonly roots = new Set<string>()

  private readonly asks: RefspecAsks

  private pending: Promise<void> = Promise.resolve()

  constructor(private readonly host: ServiceHost) {
    this.asks = new RefspecAsks(host.declinedRoots())
  }

  /** The repository, the commit and the path of one file. A git that did not answer stops the caller. */
  async anchorOf(filePath: string): Promise<AnchorResult> {
    const real = await realpath(filePath).catch(() => path.resolve(filePath))
    if (!(await isDirectory(path.dirname(real)))) return NO_REPOSITORY_RESULT
    const top = fromGit(await this.runner(path.dirname(real)).run(['rev-parse', '--show-toplevel']))
    if (!isOk(top)) return NO_REPOSITORY_RESULT
    const root = top.stdout.trim()
    const relative = path.relative(root, real).split(path.sep).join('/')
    if (!isRelativeUnder(root, relative)) return NO_REPOSITORY_RESULT
    this.roots.add(root)
    const head = fromGit(
      await this.runner(root).run(['rev-parse', '-q', '--verify', 'HEAD^{commit}']),
    )
    if (!isOk(head)) return { kind: 'noCommit' }
    return { kind: 'git', anchor: { root, head: head.stdout.trim(), path: relative } }
  }

  /** The open comments of the anchored file. A path from a note must stay under the root. */
  async openAt(anchor: Anchor): Promise<readonly StoredComment[]> {
    return (await this.book(anchor.root).open(anchor.head)).filter((stored) => {
      const notePath = stored.record.location?.path
      return (
        notePath !== undefined && isRelativeUnder(anchor.root, notePath) && notePath === anchor.path
      )
    })
  }

  async addComment(
    anchor: Anchor,
    range: RecordRange,
    text: string,
    shared: boolean,
  ): Promise<WriteResult> {
    const stored = await this.book(anchor.root).add(
      refFor(shared),
      anchor.head,
      anchor.path,
      range,
      text,
    )
    this.notify()
    return { stored, shareError: shared ? await this.share(anchor.root, stored.ref) : undefined }
  }

  async resolve(anchor: Anchor, id: string): Promise<WriteResult> {
    const book = this.book(anchor.root)
    const found = await book.findAt(anchor.head, id)
    if (found === undefined) {
      throw new NotesWriteError('The comment is no longer in the git notes. Reload the file.')
    }
    const stored = await book.resolve(found)
    this.notify()
    return {
      stored,
      shareError: isShared(stored.ref) ? await this.share(anchor.root, stored.ref) : undefined,
    }
  }

  /** A delete is final. A failed push leaves the note, and the next good push carries the change. */
  async remove(anchor: Anchor, ids: readonly string[]): Promise<DeleteResult> {
    const book = this.book(anchor.root)
    const records = await book.findAll(new Set(ids))
    const removed = await book.remove(records)
    if (removed === 0) return { removed }
    this.notify()
    const errors = await Promise.all(
      [...new Set(records.map((stored) => stored.ref).filter(isShared))].map((ref) =>
        this.share(anchor.root, ref),
      ),
    )
    const reasons = errors.filter((error) => error !== undefined).join(' ')
    return { removed, shareError: reasons === '' ? undefined : reasons }
  }

  /** Every repository root that this service anchored, for the log redaction. */
  knownRoots(): readonly string[] {
    return [...this.roots]
  }

  onDidChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Waits for the open refspec question. Tests use it. */
  settled(): Promise<void> {
    return this.pending
  }

  private runner(cwd: string): ProcessGitRunner {
    return new ProcessGitRunner(cwd, this.host.gitPath())
  }

  private book(root: string): CommentBook {
    const runner = this.runner(root)
    return new CommentBook(new NotesGateway(runner), () => gitAuthor(runner))
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener())
  }

  /** Pushes one shared ref. Undefined after a good push, and the reason after a failed one. */
  private async share(root: string, ref: string): Promise<string | undefined> {
    const settings = this.host.settings(root)
    const sharing = new NotesSharing(this.runner(root), settings.remote, settings.writeRefspec)
    const result = await sharing.share(ref)
    if (!result.ok) return result.message
    if (result.needsRefspec) {
      this.pending = this.pending
        .then(() => this.offerRefspec(root, sharing))
        .catch((error: unknown) =>
          this.host.warn(`The extension did not ask about the fetch refspec. ${String(error)}`),
        )
    }
    return undefined
  }

  /** One question for each repository in a session, and none after "Do not ask again". */
  private async offerRefspec(root: string, sharing: NotesSharing): Promise<void> {
    if (this.host.declinedRoots().includes(root) || !this.asks.mayAsk(root)) return
    const answer = await this.host.askRefspec(root, path.basename(root))
    if (answer === 'never') {
      this.asks.decline(root)
      await this.host.saveDeclinedRoots(
        [...new Set([...this.host.declinedRoots(), ...this.asks.declined()])].sort(),
      )
    }
    if (answer === 'add') {
      const added = await sharing.addFetchRefspec()
      if (!added.ok) this.host.warn(`The extension did not add the fetch refspec. ${added.message}`)
    }
  }
}
