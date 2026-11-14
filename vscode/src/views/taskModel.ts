import * as vscode from 'vscode'

import { ProcessGitRunner, inBackground } from '../git/runner'
import type { Log } from '../log'
import { watchNotes } from '../noteWatch'
import { readTaskSettings } from '../settings'
import type { Anchor, ReviewService } from '../store/reviewService'
import { changeFiles } from '../tasks/changeScan'
import { type ChangeFacts, NO_CHANGES } from '../tasks/changeTab'
import { basePathOf } from '../tasks/roots'
import { type ScanPhase, ScanRuns, ScanState } from '../tasks/scanRuns'
import {
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
}

const EMPTY: Base = {
  repositories: [],
  changes: NO_CHANGES,
  roots: [],
  folders: [],
  patterns: [],
}
const EDIT_DELAY_MS = 300

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

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size === b.size && [...a].every((value) => b.has(value))

/** The one scan behind every task view. A dirty document replaces the TODO items of its file. */
export class TaskModel implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>()

  readonly onDidChange = this.emitter.event

  private readonly runs = new ScanRuns()

  private readonly state = new ScanState()

  private readonly overlays = new Map<string, string>()

  private readonly anchors = new Map<string, Promise<Anchor | undefined>>()

  private readonly timers = new Map<string, NodeJS.Timeout>()

  private readonly schedule = new ScanSchedule((kind) => this.scanLater(kind))

  private readonly disposables: vscode.Disposable[] = []

  private base: Base = EMPTY

  private pending: Promise<void> = Promise.resolve()

  private running: ScanKind | undefined

  private refused = ''

  private api: GitApi | undefined

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
          this.timers.forEach((timer) => clearTimeout(timer))
          this.schedule.cancel()
          this.runs.cancel()
        },
      },
      ...watchNotes(() => this.schedule.request('notes')),
      vscode.workspace.onDidSaveTextDocument((document) =>
        this.overlay(document).then(() => this.schedule.request('full')),
      ),
      vscode.workspace.onDidChangeTextDocument((event) =>
        this.later(
          `edit ${event.document.uri.toString()}`,
          () => this.overlay(event.document),
          EDIT_DELAY_MS,
        ),
      ),
      vscode.workspace.onDidCloseTextDocument((document) => this.overlay(document)),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.schedule.request('full')),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('yreview.todoPatterns')) this.schedule.request('full')
      }),
    )
  }

  /** Finds the git extension and runs the first scan. */
  async start(): Promise<void> {
    this.api = await gitApi()
    this.disposables.push(
      watchRepositories(this.api, () => this.later('changes', () => this.refreshChanges())),
    )
    await this.refresh()
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

  /** Scans now. A later signal starts a new scan, which aborts this one. */
  refresh(): Promise<void> {
    this.schedule.cancel()
    this.pending = this.scan('full')
    return this.pending
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

  private later(name: string, work: () => Promise<void>, delay = SCAN_DELAY_MS): void {
    clearTimeout(this.timers.get(name))
    this.timers.set(
      name,
      setTimeout(() => {
        this.timers.delete(name)
        work().catch((error: unknown) =>
          this.log.error('The update of the review tasks failed.', error),
        )
      }, delay),
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
    if (!this.state.finish(ticket, outcome.rows === undefined)) return
    if (outcome.rows !== undefined) this.base = outcome.rows
    this.emitter.fire()
  }

  private async read(signal: AbortSignal): Promise<Base> {
    const compiled = compilePatterns(readTaskSettings().todoPatterns)
    this.warnRefused(compiled.refused)
    const folders = await workspaceFolders()
    const roots = await repositoryRoots(this.api, this.gitPath, folders, signal)
    return {
      repositories: await scanProject(await this.input(roots, folders, compiled.patterns, signal)),
      changes: { gitFound: roots.length > 0, files: await changesOf(roots, this.gitPath, signal) },
      roots,
      folders,
      patterns: compiled.patterns,
    }
  }

  /** The comments of the last scan read again, with its roots, TODO items and changed files. */
  private async readNotes(signal: AbortSignal): Promise<Base> {
    const { base } = this
    return {
      ...base,
      repositories: await rescanNotes(
        await this.input(base.roots, base.folders, base.patterns, signal),
        base.repositories,
      ),
    }
  }

  private async input(
    roots: readonly string[],
    folders: readonly string[],
    patterns: readonly CompiledPattern[],
    signal: AbortSignal,
  ): Promise<ScanInput> {
    return {
      gitPath: this.gitPath,
      roots,
      basePathOf: basePathOf(folders),
      patterns,
      unshared: (id) => this.service.unshared(id),
      signal,
      folderStores: await this.service.folderStores(true),
    }
  }

  /** The git extension reads the status often, so this reads the changed files only. */
  private async refreshChanges(): Promise<void> {
    const files = await inBackground(() => changesOf(this.base.roots, this.gitPath))
    if (sameSet(files, this.base.changes.files)) return
    this.base = { ...this.base, changes: { gitFound: this.base.roots.length > 0, files } }
    this.emitter.fire()
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
