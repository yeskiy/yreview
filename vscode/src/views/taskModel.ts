import * as vscode from 'vscode'

import { ProcessGitRunner, inBackground } from '../git/runner'
import type { Log } from '../log'
import { watchNotes } from '../noteWatch'
import { readTaskSettings } from '../settings'
import type { Anchor, ReviewService } from '../store/reviewService'
import { changeFiles } from '../tasks/changeScan'
import { type ChangeFacts, NO_CHANGES } from '../tasks/changeTab'
import { basePathOf } from '../tasks/roots'
import {
  DelayedWork,
  FirstScan,
  type ScanPhase,
  ScanRuns,
  ScanState,
  newest,
} from '../tasks/scanRuns'
import {
  type OutsideRoot,
  type RepositoryTasks,
  SCAN_DELAY_MS,
  type ScanInput,
  type ScanKind,
  ScanSchedule,
  rescanNotes,
  scanProject,
  withOverlays,
} from '../tasks/taskScan'
import { type CompiledPattern, compilePatterns, refusedMessage } from '../tasks/todoPatterns'
import {
  type GitApi,
  gitApi,
  repositoryRoots,
  watchRepositories,
  workspaceFolders,
} from './repositories'
import { openFileUris, outsideFiles, outsideKey, outsideRoots, textOfDocuments } from './tabRoots'

export interface ModelSnapshot {
  readonly repositories: readonly RepositoryTasks[]
  readonly changes: ChangeFacts
  readonly phase: ScanPhase
}

interface Base {
  readonly repositories: readonly RepositoryTasks[]
  readonly changes: ChangeFacts
  readonly roots: readonly string[]
  readonly folders: readonly string[]
  readonly patterns: readonly CompiledPattern[]
  /** The changed files of the inside roots. The changes add the open changed files of outside roots. */
  readonly insideChanges: ReadonlySet<string>
  readonly outside: readonly OutsideRoot[]
}

const EMPTY: Base = {
  repositories: [],
  changes: NO_CHANGES,
  roots: [],
  folders: [],
  patterns: [],
  insideChanges: new Set(),
  outside: [],
}
const EDIT_DELAY_MS = 300
/** The name prefix of a waiting overlay update. A refresh runs these first. */
const EDIT = 'edit '

const changesOf = async (
  roots: readonly string[],
  gitPath: string,
  signal?: AbortSignal,
): Promise<ReadonlySet<string>> =>
  new Set(
    (
      await Promise.all(
        roots.map((root) => changeFiles(new ProcessGitRunner(root, gitPath), root, signal)),
      )
    ).flatMap((files) => files ?? []),
  )

/** The changed files of each outside git root, kept to the open files of that root. */
const outsideChangesOf = async (
  outside: readonly OutsideRoot[],
  gitPath: string,
  signal?: AbortSignal,
): Promise<readonly string[]> =>
  (
    await Promise.all(
      outside
        .filter((entry) => entry.store === 'git')
        .map(async ({ root, files }) => {
          const open = new Set(files.map((file) => `${root}/${file.path}`))
          return (
            (await changeFiles(new ProcessGitRunner(root, gitPath), root, signal)) ?? []
          ).filter((file) => open.has(file))
        }),
    )
  ).flat()

const changeFactsOf = (
  roots: readonly string[],
  inside: ReadonlySet<string>,
  outside: readonly OutsideRoot[],
  outsideChanges: readonly string[],
): ChangeFacts => ({
  gitFound: roots.length > 0 || outside.some((entry) => entry.store === 'git'),
  files: new Set([...inside, ...outsideChanges]),
})

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((value) => b.has(value))

/** The one scan behind every task view. A dirty document replaces the TODO items of its file. */
export class TaskModel implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>()

  readonly onDidChange = this.emitter.event

  private readonly runs = new ScanRuns()

  private readonly state = new ScanState()

  private readonly first = new FirstScan()

  private readonly overlays = new Map<string, string>()

  private readonly anchors = new Map<string, Promise<Anchor | undefined>>()

  private readonly delayed = new DelayedWork((error) =>
    this.log.error('The update of the review tasks failed.', error),
  )

  private readonly schedule = new ScanSchedule((kind) => this.scanLater(kind))

  private readonly disposables: vscode.Disposable[] = []

  private base: Base = EMPTY

  private pending: Promise<void> = Promise.resolve()

  private running: ScanKind | undefined

  private refused = ''

  private api: GitApi | undefined

  /** The outside open files of the last scan, so a tab event that changes nothing starts no scan. */
  private outsideSeen = ''

  constructor(
    private readonly service: ReviewService,
    private readonly gitPath: string,
    private readonly log: Log,
  ) {
    const stopListening = service.onDidChange(() => this.schedule.request('notes'))
    this.disposables.push(
      this.emitter,
      { dispose: stopListening },
      {
        dispose: () => {
          this.delayed.cancel()
          this.schedule.cancel()
          this.runs.cancel()
          this.first.settle()
        },
      },
      ...watchNotes(() => this.schedule.request('notes')),
      vscode.workspace.onDidSaveTextDocument((document) =>
        this.overlay(document).then(() => this.schedule.request('full')),
      ),
      vscode.workspace.onDidChangeTextDocument((event) =>
        this.delayed.later(
          `${EDIT}${event.document.uri.toString()}`,
          () => this.overlay(event.document),
          EDIT_DELAY_MS,
        ),
      ),
      vscode.workspace.onDidCloseTextDocument((document) => this.overlay(document)),
      vscode.window.tabGroups.onDidChangeTabs(() =>
        this.delayed.later('tabs', () => this.tabsChanged(), 0),
      ),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.schedule.request('full')),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('yreview.todoPatterns')) this.schedule.request('full')
      }),
    )
  }

  /** Finds the git extension and runs the first scan. */
  async start(): Promise<void> {
    try {
      this.api = await gitApi()
      this.disposables.push(
        watchRepositories(
          this.api,
          () => this.delayed.later('changes', () => this.refreshChanges(), SCAN_DELAY_MS),
          () => this.schedule.request('full'),
        ),
      )
      await this.refresh()
    } catch (error) {
      this.first.settle()
      throw error
    }
  }

  snapshot(): ModelSnapshot {
    return {
      repositories: withOverlays(
        this.base.repositories,
        this.overlays,
        this.base.patterns,
        this.base.roots,
        basePathOf(this.base.folders),
      ),
      changes: this.base.changes,
      phase: this.state.phase,
    }
  }

  roots(): readonly string[] {
    return this.base.roots
  }

  /** The roots after the first full scan. A write reads these, so it never sees the empty start. */
  readyRoots(): Promise<readonly string[]> {
    return this.first.after(() => this.base.roots)
  }

  /** Scans now. A newer scan aborts this one, and the wait then ends after the newer scan. */
  async refresh(): Promise<void> {
    this.schedule.cancel()
    await this.delayed.now(EDIT)
    this.pending = this.scan('full')
    await newest(() => this.pending)
  }

  settled(): Promise<void> {
    return this.pending
  }

  /** The repository and the path of a file, cached for each document. */
  anchorOf(uri: vscode.Uri): Promise<Anchor | undefined> {
    if (uri.scheme !== 'file') return Promise.resolve(undefined)
    const cached = this.anchors.get(uri.toString())
    if (cached !== undefined) return cached
    const found = inBackground(() => this.service.anchorOf(uri.fsPath)).then(
      (result) => (result.kind === 'found' ? result.anchor : undefined),
      () => undefined,
    )
    this.anchors.set(uri.toString(), found)
    return found
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose())
  }

  /** A note change reads the comments only, unless a full scan runs or no full scan read the tasks yet. */
  private scanLater(kind: ScanKind): void {
    this.pending = this.scan(this.running === 'full' || this.base === EMPTY ? 'full' : kind).catch(
      (error: unknown) => this.log.error('The update of the review tasks failed.', error),
    )
  }

  private async scan(kind: ScanKind): Promise<void> {
    const signal = this.runs.next()
    const ticket = this.state.start()
    this.running = kind
    if (kind === 'full') this.anchors.clear()
    this.emitter.fire()
    const outcome = await this.runs.run(signal, () =>
      inBackground(() => (kind === 'full' ? this.read(signal) : this.readNotes(signal))),
    )
    if (this.state.current(ticket)) this.running = undefined
    if (outcome === undefined) return
    if (outcome.failure !== undefined) {
      this.log.error('The scan of the review tasks failed.', outcome.failure)
    }
    const finished = this.state.finish(ticket, outcome.rows === undefined)
    if (finished && outcome.rows !== undefined) this.base = outcome.rows
    if (kind === 'full') this.first.settle()
    if (finished) this.emitter.fire()
  }

  private async read(signal: AbortSignal): Promise<Base> {
    const compiled = compilePatterns(readTaskSettings().todoPatterns)
    this.warnRefused(compiled.refused)
    const folders = await workspaceFolders()
    const roots = await repositoryRoots(this.api, this.gitPath, folders, signal)
    const input = await this.input(roots, folders, compiled.patterns, signal)
    const insideChanges = await changesOf(roots, this.gitPath, signal)
    return {
      repositories: await scanProject(input),
      changes: changeFactsOf(
        roots,
        insideChanges,
        input.outside,
        await outsideChangesOf(input.outside, this.gitPath, signal),
      ),
      roots,
      folders,
      patterns: compiled.patterns,
      insideChanges,
      outside: input.outside,
    }
  }

  /** The comments of the last scan read again, with its roots, TODO items and changed files. */
  private async readNotes(signal: AbortSignal): Promise<Base> {
    const { base } = this
    const input = await this.input(base.roots, base.folders, base.patterns, signal)
    return {
      ...base,
      repositories: await rescanNotes(input, base.repositories),
      changes: changeFactsOf(
        base.roots,
        base.insideChanges,
        input.outside,
        await outsideChangesOf(input.outside, this.gitPath, signal),
      ),
      outside: input.outside,
    }
  }

  private async input(
    roots: readonly string[],
    folders: readonly string[],
    patterns: readonly CompiledPattern[],
    signal: AbortSignal,
  ): Promise<ScanInput & { readonly outside: readonly OutsideRoot[] }> {
    const inside = [...roots, ...folders]
    const uris = openFileUris(vscode.window.tabGroups.all)
    this.outsideSeen = outsideKey(await outsideFiles(uris, inside, (uri) => this.anchorOf(uri)))
    return {
      gitPath: this.gitPath,
      roots,
      basePathOf: basePathOf(folders),
      patterns,
      unshared: (id) => this.service.unshared(id),
      signal,
      folderStores: await this.service.folderStores(true),
      outside: await outsideRoots(
        uris,
        inside,
        (uri) => this.anchorOf(uri),
        textOfDocuments(() => vscode.workspace.textDocuments),
        this.service.home(),
      ),
    }
  }

  /** The git extension reads the status often, so this reads the changed files only. */
  private async refreshChanges(): Promise<void> {
    const [insideChanges, outsideChanges] = await inBackground(() =>
      Promise.all([
        changesOf(this.base.roots, this.gitPath),
        outsideChangesOf(this.base.outside, this.gitPath),
      ]),
    )
    const changes = changeFactsOf(this.base.roots, insideChanges, this.base.outside, outsideChanges)
    if (sameSet(changes.files, this.base.changes.files)) return
    this.base = { ...this.base, changes, insideChanges }
    this.emitter.fire()
  }

  /** A notes scan reads the outside roots again when the set of outside open files changed. */
  private async tabsChanged(): Promise<void> {
    const seen = outsideKey(
      await outsideFiles(
        openFileUris(vscode.window.tabGroups.all),
        [...this.base.roots, ...this.base.folders],
        (uri) => this.anchorOf(uri),
      ),
    )
    if (seen !== this.outsideSeen) this.schedule.request('notes')
  }

  private async overlay(document: vscode.TextDocument): Promise<void> {
    const anchor = await this.anchorOf(document.uri)
    if (anchor === undefined) return
    const key = `${anchor.root}/${anchor.path}`
    if (document.isDirty && !document.isClosed) this.overlays.set(key, document.getText())
    else if (!this.overlays.delete(key)) return
    this.emitter.fire()
  }

  private warnRefused(refused: readonly string[]): void {
    if (refused.join('\n') === this.refused) return
    this.refused = refused.join('\n')
    if (refused.length === 0) return
    this.log.warn(refusedMessage(refused))
    vscode.window.showWarningMessage(refusedMessage(refused)).then(undefined, () => undefined)
  }
}
