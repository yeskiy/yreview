import { stat } from 'node:fs/promises'
import path from 'node:path'

import {
  WORKTREE,
  folderRoot as rootOfFolders,
  planAnchor,
  relativeTo,
  slashPath,
} from '../core/anchor'
import { storeFolderOf, storeWalk } from '../core/storeRules'
import { lineTextOnDisk } from '../core/lineText'
import { containedPath, isRelativeUnder, realOf } from '../core/paths'
import type { RecordRange } from '../core/record'
import { gitAuthor } from '../git/author'
import { NotesWriteError } from '../git/errors'
import { reviewFolderOf } from '../git/gitDir'
import { NotesGateway } from '../git/notes'
import { diffAnchorOf } from '../git/revision'
import { type GitResult, ProcessGitRunner, isOk, ran } from '../git/runner'
import { NotesSharing } from '../git/sharing'
import { readNotes } from '../tasks/noteScan'
import { type Placed, placedComments } from '../tasks/placedComments'
import { CommentBook, type StoredComment } from './commentBook'
import { FOLDER, FolderNotes } from './folderNotes'
import { mayMigrate } from './folderOwnership'
import {
  type MigrationReport,
  RewrittenNotes,
  copyFolder,
  migrationNotice,
  moveStoreFolder,
  prefixOf,
  rewriteRecords,
} from './migration'
import { ALL_REFS, isShared, refFor } from './noteRefs'
import { RefspecAsks } from './refspecAsks'
import { ShareLog } from './shareLog'
import { childStores } from './storeSearch'

export type StoreKind = 'git' | 'folder'

/** Where the comments of one file or one diff side live, and under which key. */
export interface Anchor {
  readonly store: StoreKind
  readonly root: string
  /** The commit of the note, or `worktree` for a folder store. */
  readonly head: string
  readonly path: string
  /** True for a diff side that shows the index or the working tree. */
  readonly dirty?: boolean
}

export type AnchorResult =
  | { readonly kind: 'found'; readonly anchor: Anchor }
  | { readonly kind: 'noCommit' }
  | { readonly kind: 'homeFile' }
  | { readonly kind: 'noPlace'; readonly reason?: string }

/** The comment that was written, the reason the push failed, and messages about the folder store. */
export interface WriteResult {
  readonly stored: StoredComment
  readonly shareError?: string
  readonly notices?: readonly string[]
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
  /** The workspace folders, as file system paths. */
  workspaceFolders(): readonly string[]
  /** The real home folder with "/", or undefined when it is not known. */
  home(): string | undefined
  /** The folder roots that already got the first folder store notice. */
  toldFolders(): readonly string[]
  saveToldFolders(roots: readonly string[]): Promise<void>
  say(message: string): void
  warn(message: string): void
}

export const NO_COMMIT = 'This repository has no commit yet.'
export const NO_PLACE =
  'Yreview keeps comments only for a saved local file in a folder that exists. Save the file in a local folder, then add the comment.'
export const HOME_FILE =
  'Yreview does not keep comments for a file directly in your home folder or in its .y-review folder. Move the file into a folder, then add the comment.'
export const NO_REVISION =
  'This side of the diff has no revision in git, so a comment has nowhere to anchor.'

export const folderFirstNotice = (root: string): string =>
  `No git repository covers this file. The review comments go to ${root}/${FOLDER}. Yreview moves them into the git notes by itself after a repository with a commit exists here.`

const NO_PLACE_RESULT: AnchorResult = { kind: 'noPlace' }

const isDirectory = async (dir: string): Promise<boolean> =>
  (await stat(dir).catch(() => undefined))?.isDirectory() === true

const exists = async (target: string): Promise<boolean> =>
  (await stat(target).catch(() => undefined)) !== undefined

/** The deepest existing folder on the way up from `dir`. */
const nearestDirectory = async (dir: string): Promise<string> =>
  (await isDirectory(dir)) || path.dirname(dir) === dir ? dir : nearestDirectory(path.dirname(dir))

/** True when the folder or a parent holds a `.git` entry, also one that git refuses. */
const insideRepository = async (dir: string): Promise<boolean> =>
  (await exists(path.join(dir, '.git'))) ||
  (path.dirname(dir) !== dir && (await insideRepository(path.dirname(dir))))

/** An answer of the runner states nothing about the repository, so it stops the caller. */
const fromGit = (result: GitResult): GitResult => {
  if (!ran(result)) throw new NotesWriteError(result.stderr.trim() || 'Git did not answer.')
  return result
}

const topOf = (result: GitResult): string | undefined =>
  isOk(result) ? slashPath(path.resolve(result.stdout.trim())) : undefined

const found = (anchor: Anchor): AnchorResult => ({ kind: 'found', anchor })

const holdsRecords = async (root: string): Promise<boolean> =>
  (await Promise.all(ALL_REFS.map((ref) => new FolderNotes(root).commitsWithNotes(ref)))).some(
    (keys) => keys.length > 0,
  )

/** Every record line of one folder store. A read that fails stops the caller. */
const allLines = async (store: FolderNotes): Promise<readonly string[]> =>
  (
    await Promise.all(
      ALL_REFS.map(async (ref) =>
        (
          await Promise.all(
            (await store.commitsOrRefuse(ref)).map((key) => store.readOrRefuse(ref, key)),
          )
        ).flat(),
      ),
    )
  ).flat()

/** The new place of the old folder, and undefined while the folder stays where it is. */
const moveAway = async (
  runner: ProcessGitRunner,
  root: string,
  n: number,
): Promise<string | undefined> => {
  const folder = await reviewFolderOf(runner)
  const target = folder === undefined ? undefined : path.join(folder, `migrated-${Date.now()}-${n}`)
  return target !== undefined && (await moveStoreFolder(root, target)) ? target : undefined
}

/** A store below the root copies with new paths and identifiers. A store at the root copies byte for byte. */
const copyStore = async (
  folder: FolderNotes,
  prefix: string,
  runner: ProcessGitRunner,
  head: string,
): Promise<{ readonly report: MigrationReport; readonly renames: ReadonlyMap<string, string> }> => {
  try {
    const { renames } =
      prefix === ''
        ? { renames: new Map<string, string>() }
        : rewriteRecords(await allLines(folder), prefix)
    return {
      report: await copyFolder(
        new RewrittenNotes(folder, prefix, renames),
        new NotesGateway(runner),
        ALL_REFS,
        head,
      ),
      renames,
    }
  } catch (error) {
    if (!(error instanceof NotesWriteError)) throw error
    return { report: { moved: 0, problem: error.message }, renames: new Map() }
  }
}

/** Writes, resolves and deletes review comments in git notes or folder stores, and pushes the shared ones. */
export class ReviewService {
  private readonly listeners = new Set<() => void>()

  private readonly roots = new Set<string>()

  private readonly books = new Map<string, CommentBook>()

  private readonly migrating = new Map<string, Promise<void>>()

  private readonly searching = new Map<string, Promise<void>>()

  /** The untracked stores inside a repository with a commit that did not move yet. */
  private readonly leftovers = new Set<string>()

  private readonly asks: RefspecAsks

  private pending: Promise<void> = Promise.resolve()

  constructor(
    private readonly host: ServiceHost,
    private readonly shareLog: ShareLog = new ShareLog(),
  ) {
    this.asks = new RefspecAsks(host.declinedRoots())
  }

  /** The store of one file: the repository with a commit, else the nearest store of the walk. */
  async anchorOf(filePath: string): Promise<AnchorResult> {
    const real = await realOf(filePath)
    const dir = path.dirname(real)
    if (!(await isDirectory(dir))) return NO_PLACE_RESULT
    // The folder of the file and the root name one repository, so the two reads run together.
    const runner = this.runner(dir)
    const [top, head] = await Promise.all([
      runner.run(['rev-parse', '--show-toplevel']).then(fromGit),
      runner.run(['rev-parse', '-q', '--verify', 'HEAD^{commit}']).then(fromGit),
    ])
    const root = topOf(top)
    if (root === undefined && (await insideRepository(dir))) {
      return {
        kind: 'noPlace',
        reason: `Git did not open the repository of this file. ${top.stderr.trim()}`.trim(),
      }
    }
    const commit = root !== undefined && isOk(head) ? head.stdout.trim() : undefined
    const home = this.host.home()
    // A repository with a commit takes no folder store, so its files probe no folder.
    const ceiling =
      commit === undefined
        ? rootOfFolders(slashPath(real), undefined, await this.folderRoots())
        : undefined
    const walk = commit === undefined ? storeWalk(slashPath(dir), ceiling, home) : []
    const stores = new Set(
      (
        await Promise.all(
          walk.map(async (folder) => ((await isDirectory(storeFolderOf(folder))) ? [folder] : [])),
        )
      ).flat(),
    )
    const plan = planAnchor(
      slashPath(real),
      root,
      commit,
      () => ceiling,
      home,
      (folder) => stores.has(folder),
    )
    if (plan.kind === 'noCommit') return { kind: 'noCommit' }
    if (plan.kind === 'homeFile') return { kind: 'homeFile' }
    if (plan.kind === 'noPlace') return NO_PLACE_RESULT
    this.roots.add(plan.root)
    if (plan.kind === 'folder') {
      return found({ store: 'folder', root: plan.root, head: WORKTREE, path: plan.path })
    }
    if ((await this.folderRoots()).includes(plan.root)) await this.settle(plan.root, true)
    return found({ store: 'git', root: plan.root, head: plan.commit, path: plan.path })
  }

  /** The store of one diff side: the file and the ref of a `git:` URI. */
  async anchorOfRevision(filePath: string, ref: string): Promise<AnchorResult> {
    const real = await realOf(filePath)
    const top = fromGit(
      await this.runner(await nearestDirectory(path.dirname(real))).run([
        'rev-parse',
        '--show-toplevel',
      ]),
    )
    const root = topOf(top)
    if (root === undefined) return NO_PLACE_RESULT
    const relative = relativeTo(slashPath(real), root)
    const side =
      relative === undefined || (await containedPath(root, relative)) === undefined
        ? undefined
        : await diffAnchorOf(this.runner(root), root, slashPath(real), ref)
    if (side === undefined) return { kind: 'noPlace', reason: NO_REVISION }
    this.roots.add(root)
    return found({ store: 'git', root, head: side.commit, path: side.path, dirty: side.dirty })
  }

  /** The open comments of the anchored file. A path from a note must stay under the root. */
  async openAt(anchor: Anchor): Promise<readonly StoredComment[]> {
    return (await this.book(anchor).open(anchor.head)).filter((stored) => {
      const notePath = stored.record.location?.path
      return (
        notePath !== undefined && isRelativeUnder(anchor.root, notePath) && notePath === anchor.path
      )
    })
  }

  /** The open comments of the anchored file, at their place in the working tree. */
  async placedAt(anchor: Anchor): Promise<readonly Placed[]> {
    const runner = this.runner(anchor.root)
    const notes =
      anchor.store === 'git'
        ? ((await readNotes(runner, anchor.root)) ?? new NotesGateway(runner))
        : new FolderNotes(anchor.root)
    return placedComments(runner, anchor.root, anchor.head, notes, anchor.path)
  }

  /** A folder store has no remote, so it takes only local comments. */
  async addComment(
    anchor: Anchor,
    range: RecordRange,
    text: string,
    shared: boolean,
    lineText?: string | null,
  ): Promise<WriteResult> {
    const stored = await this.book(anchor).add(
      refFor(shared && anchor.store === 'git'),
      anchor.head,
      anchor.path,
      range,
      text,
      lineText === undefined
        ? await lineTextOnDisk(anchor.root, anchor.path, range)
        : (lineText ?? undefined),
    )
    this.notify()
    if (anchor.store === 'folder') {
      return { stored, notices: await this.folderNotices(anchor.root) }
    }
    const shareError = isShared(stored.ref) ? await this.share(anchor.root, stored.ref) : undefined
    if (shareError !== undefined) await this.shareLog.mark(stored.id, anchor.root, stored.ref)
    return { stored, shareError }
  }

  async resolve(anchor: Anchor, id: string): Promise<WriteResult> {
    const book = this.book(anchor)
    const target = await book.findAt(anchor.head, id)
    if (target === undefined) {
      throw new NotesWriteError('The comment is no longer in the notes. Reload the file.')
    }
    const stored = await book.resolve(target)
    this.notify()
    const shareError =
      anchor.store === 'git' && isShared(stored.ref)
        ? await this.share(anchor.root, stored.ref)
        : undefined
    if (shareError !== undefined) await this.shareLog.mark(stored.id, anchor.root, stored.ref)
    return { stored, shareError }
  }

  /** A delete is final. A failed push leaves the note, and the next good push carries the change. */
  async remove(anchor: Anchor, ids: readonly string[]): Promise<DeleteResult> {
    return this.removeStored(anchor, await this.book(anchor).findAll(new Set(ids)))
  }

  /** Deletes records that the caller read before, with no search of every note. */
  async removeStored(anchor: Anchor, records: readonly StoredComment[]): Promise<DeleteResult> {
    const removed = await this.book(anchor).remove(records)
    if (removed === 0) return { removed }
    this.notify()
    if (anchor.store === 'folder') return { removed }
    const errors = await Promise.all(
      [...new Set(records.map((stored) => stored.ref).filter(isShared))].map((ref) =>
        this.share(anchor.root, ref),
      ),
    )
    const reasons = errors.filter((error) => error !== undefined).join(' ')
    return { removed, shareError: reasons === '' ? undefined : reasons }
  }

  /** Moves each workspace folder store that a repository now covers, then gives every store that still holds records. */
  async folderStoreRoots(writes: boolean): Promise<readonly string[]> {
    const roots = await this.folderRoots()
    await roots.reduce(
      (done, root) => done.then(() => this.settle(root, writes)),
      Promise.resolve(),
    )
    return (
      await Promise.all(
        [...new Set([...roots, ...this.leftovers])].map(async (root) =>
          !(await this.isRepositoryRoot(root)) && (await holdsRecords(root)) ? [root] : [],
        ),
      )
    ).flat()
  }

  /** The folder store of each folder that holds records. Later phases read stores only through this method. */
  async folderStores(writes: boolean): Promise<readonly { root: string; store: FolderNotes }[]> {
    return (await this.folderStoreRoots(writes)).map((root) => ({
      root,
      store: new FolderNotes(root),
    }))
  }

  /** Moves every untracked store inside the work tree of a repository with a commit. One search runs at a time. */
  async settleRepository(root: string): Promise<void> {
    const repository = slashPath(await realOf(root))
    const running = this.searching.get(repository)
    if (running !== undefined) return running
    const work = this.searchAndMove(repository).finally(() => this.searching.delete(repository))
    this.searching.set(repository, work)
    return work
  }

  /** Moves the nearest store of one file that holds records, when a repository with a commit covers it. */
  async settleFile(filePath: string): Promise<void> {
    const dir = path.posix.dirname(slashPath(await realOf(filePath)))
    if (!(await isDirectory(dir))) return
    const repository = topOf(await this.runner(dir).run(['rev-parse', '--show-toplevel']))
    if (repository === undefined || (await this.headOf(repository)) === undefined) return
    const folder = await this.nearestStore(dir, repository, () => Promise.resolve(true))
    if (folder !== undefined) await this.settle(folder, true)
  }

  /** The folder anchor of an untracked store with records between the file and the root of its git anchor. */
  async leftoverOf(anchor: Anchor, filePath: string): Promise<Anchor | undefined> {
    if (anchor.store !== 'git') return undefined
    const real = slashPath(await realOf(filePath))
    const folder = await this.nearestStore(path.posix.dirname(real), anchor.root, (store) =>
      mayMigrate(this.runner(store)),
    )
    const relative = folder === undefined ? undefined : relativeTo(real, folder)
    return folder === undefined || relative === undefined
      ? undefined
      : { store: 'folder', root: folder, head: WORKTREE, path: relative }
  }

  /** The real home folder with "/", or undefined when it is not known. */
  home(): string | undefined {
    return this.host.home()
  }

  /** Every root that this service anchored, for the log redaction. */
  knownRoots(): readonly string[] {
    return [...this.roots]
  }

  /** True when a push of the comment failed and no later push of its ref worked. */
  unshared(id: string): boolean {
    return this.shareLog.isUnshared(id)
  }

  /** The new identifier of a migrated record for an old identifier or its handle. */
  forward(given: string): string {
    return this.shareLog.forward(given)
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

  /** Tells the listeners about a write that went past this service, for example a review tool. */
  notifyChanged(): void {
    this.notify()
  }

  private runner(cwd: string): ProcessGitRunner {
    return new ProcessGitRunner(cwd, this.host.gitPath())
  }

  /** One book for each store, root and git program, so the book keeps what it read about the store. */
  private book(anchor: Pick<Anchor, 'store' | 'root'>): CommentBook {
    const key = `${anchor.store}\u0000${this.host.gitPath()}\u0000${anchor.root}`
    const known = this.books.get(key)
    if (known !== undefined) return known
    // A folder root is not a repository, and `git config user.email` still answers there.
    const runner = this.runner(anchor.root)
    const book = new CommentBook(
      anchor.store === 'git' ? new NotesGateway(runner) : new FolderNotes(anchor.root),
      () => gitAuthor(runner),
    )
    this.books.set(key, book)
    return book
  }

  private async headOf(root: string): Promise<string | undefined> {
    const head = fromGit(
      await this.runner(root).run(['rev-parse', '-q', '--verify', 'HEAD^{commit}']),
    )
    return isOk(head) ? head.stdout.trim() : undefined
  }

  /** The long real paths of the workspace folders, with `/`. */
  private folderRoots(): Promise<readonly string[]> {
    return Promise.all(
      this.host.workspaceFolders().map(async (folder) => slashPath(await realOf(folder))),
    )
  }

  private async isRepositoryRoot(root: string): Promise<boolean> {
    return topOf(fromGit(await this.runner(root).run(['rev-parse', '--show-toplevel']))) === root
  }

  private async folderNotices(root: string): Promise<readonly string[]> {
    const told = this.host.toldFolders().includes(root)
    if (!told) {
      await this.host.saveToldFolders([...new Set([...this.host.toldFolders(), root])].sort())
    }
    return told ? [] : [folderFirstNotice(root)]
  }

  /** The nearest folder of the walk whose store holds records and passes the test. */
  private async nearestStore(
    dir: string,
    ceiling: string,
    test: (folder: string) => Promise<boolean>,
  ): Promise<string | undefined> {
    const walk = storeWalk(dir, ceiling, this.host.home())
    const hits = await Promise.all(
      walk.map(
        async (folder) =>
          (await isDirectory(storeFolderOf(folder))) &&
          (await holdsRecords(folder)) &&
          (await test(folder)),
      ),
    )
    return walk.find((_, n) => hits[n])
  }

  /** The search and the moves of one repository. The stores move one after the other. */
  private async searchAndMove(repository: string): Promise<void> {
    const runner = this.runner(repository)
    if (topOf(await runner.run(['rev-parse', '--show-toplevel'])) !== repository) return
    if ((await this.headOf(repository)) === undefined) return
    const roots = await Promise.all(
      ((await childStores(runner, repository)) ?? []).map(async (store) =>
        slashPath(await realOf(store)),
      ),
    )
    await roots.reduce(
      (done, root, n) => done.then(() => this.settle(root, true, repository, n)),
      Promise.resolve(),
    )
  }

  /** One migration for each folder at a time, so a folder never moves into two repositories. */
  private settle(root: string, writes: boolean, repository?: string, n = 0): Promise<void> {
    if (!writes) return Promise.resolve()
    const running = this.migrating.get(root)
    if (running !== undefined) return running
    const work = this.migrate(root, repository, n).finally(() => this.migrating.delete(root))
    this.migrating.set(root, work)
    return work
  }

  /** The copy and its check run first, the renames next, and the move of the folder last. */
  private async migrate(
    folderRoot: string,
    expected: string | undefined,
    n: number,
  ): Promise<void> {
    if (!(await holdsRecords(folderRoot))) {
      this.leftovers.delete(folderRoot)
      return
    }
    const repository = topOf(await this.runner(folderRoot).run(['rev-parse', '--show-toplevel']))
    const prefix = repository === undefined ? undefined : prefixOf(repository, folderRoot)
    // A store moves only into the repository that the search saw.
    if (repository === undefined || prefix === undefined) return
    if (expected !== undefined && expected !== repository) return
    const head = await this.headOf(repository)
    if (head === undefined || !(await mayMigrate(this.runner(folderRoot)))) return
    this.leftovers.add(folderRoot)
    const runner = this.runner(repository)
    const { report, renames } = await copyStore(new FolderNotes(folderRoot), prefix, runner, head)
    if (report.problem === undefined) await this.shareLog.rename(renames, repository)
    const movedTo = report.problem === undefined ? await moveAway(runner, folderRoot, n) : undefined
    if (movedTo !== undefined) this.leftovers.delete(folderRoot)
    const notice = migrationNotice(report, folderRoot, path.basename(repository), movedTo)
    if (notice.warning) this.host.warn(notice.text)
    else this.host.say(notice.text)
    if (notice.refresh) this.notify()
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener())
  }

  // --- Sharing ---

  /** Pushes one shared ref. Undefined after a good push, and the reason after a failed one. */
  private async share(root: string, ref: string): Promise<string | undefined> {
    const settings = this.host.settings(root)
    const sharing = new NotesSharing(this.runner(root), settings.remote, settings.writeRefspec)
    const result = await sharing.share(ref)
    if (!result.ok) return result.message
    await this.shareLog.clear(root, ref)
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
