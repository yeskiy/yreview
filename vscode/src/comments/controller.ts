import * as vscode from 'vscode'

import { commentRange, compactRange } from '../core/range'
import { guard } from '../guard'
import type { Log } from '../log'
import { readSettings } from '../settings'
import type { StoredComment } from '../store/commentBook'
import { isShared } from '../store/noteRefs'
import { type Anchor, NO_COMMIT, NO_REPOSITORY, type ReviewService } from '../store/reviewService'

const OPEN = 'yreview.open'
const RESOLVED = 'yreview.resolved'
const COMMENT = 'yreview.comment'

export const NEEDS_REPOSITORY = `${NO_REPOSITORY} Open a folder that is a git repository.`

export interface Shown {
  readonly thread: vscode.CommentThread
  readonly stored: StoredComment
  readonly anchor: Anchor
}

const line = (value: number): number => Math.max(value - 1, 0)

const rangeOf = (stored: StoredComment): vscode.Range => {
  const range = stored.record.location?.range
  return range === undefined
    ? new vscode.Range(0, 0, 0, 0)
    : new vscode.Range(
        line(range.startLine),
        Math.max(range.startColumn ?? 0, 0),
        line(range.endLine),
        Math.max(range.endColumn ?? 0, 0),
      )
}

/** Comment text comes from other people, so it renders with no command links and no HTML. */
const untrusted = (text: string): vscode.MarkdownString =>
  Object.assign(new vscode.MarkdownString(text), { isTrusted: false, supportHtml: false })

const timeOf = (stored: StoredComment): Date | undefined => {
  const seconds = Number(stored.record.timestamp)
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : undefined
}

const visibleUris = (): readonly vscode.Uri[] =>
  [
    ...new Set(vscode.window.visibleTextEditors.map((editor) => editor.document.uri.toString())),
  ].map((text) => vscode.Uri.parse(text))

/** The review comments of the open editors, drawn with the Comments API. */
export class ReviewComments implements vscode.Disposable {
  private readonly controller = vscode.comments.createCommentController('yreview', 'Yreview')

  private readonly decoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('yreview.commentRangeBackground'),
    isWholeLine: true,
  })

  private readonly shown = new Map<string, readonly Shown[]>()

  /** Threads resolved in this session. They stay on screen until the window reloads. */
  private readonly resolved = new Set<Shown>()

  private readonly running = new Map<string, Promise<void>>()

  private readonly queued = new Map<string, Promise<void>>()

  private readonly disposables: vscode.Disposable[] = []

  constructor(
    private readonly service: ReviewService,
    private readonly log: Log,
  ) {
    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (document) =>
        document.uri.scheme === 'file'
          ? [new vscode.Range(0, 0, Math.max(document.lineCount - 1, 0), 0)]
          : undefined,
    }
    this.controller.options = {
      prompt: 'Add a review comment',
      placeHolder: 'Write a review comment. Markdown works.',
    }
    const stopListening = service.onDidChange(() => this.reloadVisible())
    this.disposables.push(
      this.controller,
      this.decoration,
      { dispose: stopListening },
      vscode.commands.registerCommand(
        'yreview.addComment',
        guard(log, 'Add Review Comment', () => this.startThread()),
      ),
      vscode.commands.registerCommand(
        'yreview.saveLocal',
        guard(log, 'Save', (reply: vscode.CommentReply) => this.save(reply, false)),
      ),
      vscode.commands.registerCommand(
        'yreview.saveShared',
        guard(log, 'Save', (reply: vscode.CommentReply) => this.save(reply, true)),
      ),
      vscode.commands.registerCommand(
        'yreview.resolve',
        guard(log, 'Resolve', (thread: vscode.CommentThread) => this.resolve(thread)),
      ),
      vscode.commands.registerCommand(
        'yreview.delete',
        guard(log, 'Delete', (comment: vscode.Comment) => this.remove(comment)),
      ),
      vscode.languages.registerCodeActionsProvider(
        { scheme: 'file' },
        {
          provideCodeActions: () => [
            Object.assign(
              new vscode.CodeAction('Add review comment', vscode.CodeActionKind.Empty),
              {
                command: { command: 'yreview.addComment', title: 'Add review comment' },
              },
            ),
          ],
        },
        { providedCodeActionKinds: [vscode.CodeActionKind.Empty] },
      ),
      vscode.window.onDidChangeVisibleTextEditors(() => this.showVisible()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('yreview.editorMarks')) this.reloadVisible()
      }),
      ...this.noteWatchers(),
    )
    this.reloadVisible()
  }

  /** Reads the open comments of one file again and draws them. Calls during a read share the next read. */
  reload(uri: vscode.Uri): Promise<void> {
    const key = uri.toString()
    const queued = this.queued.get(key)
    if (queued !== undefined) return queued
    const running = this.running.get(key)
    const start = (): Promise<void> => {
      const load = this.load(uri).finally(() => {
        if (this.running.get(key) === load) this.running.delete(key)
      })
      this.running.set(key, load)
      return load
    }
    if (running === undefined) return start()
    const next = running
      .catch(() => undefined)
      .then(() => {
        this.queued.delete(key)
        return start()
      })
    this.queued.set(key, next)
    return next
  }

  private async load(uri: vscode.Uri): Promise<void> {
    if (uri.scheme !== 'file') return
    const found = await this.service.anchorOf(uri.fsPath)
    const stored = found.kind === 'git' ? await this.service.openAt(found.anchor) : []
    this.clear(uri)
    if (found.kind !== 'git') return
    const expanded = readSettings(uri).editorMarks
    this.shown.set(
      uri.toString(),
      stored.map((entry) => ({
        thread: this.draw(uri, entry, expanded),
        stored: entry,
        anchor: found.anchor,
      })),
    )
    this.decorate(uri)
  }

  snapshot(uri: vscode.Uri): readonly Shown[] {
    return this.shown.get(uri.toString()) ?? []
  }

  dispose(): void {
    this.shown.forEach((entries) => entries.forEach((entry) => entry.thread.dispose()))
    this.resolved.forEach((entry) => entry.thread.dispose())
    this.disposables.forEach((disposable) => disposable.dispose())
  }

  // --- Drawing ---

  private draw(uri: vscode.Uri, stored: StoredComment, expanded: boolean): vscode.CommentThread {
    const thread = this.controller.createCommentThread(uri, rangeOf(stored), [
      {
        body: untrusted(stored.record.description ?? ''),
        mode: vscode.CommentMode.Preview,
        author: { name: stored.record.author },
        label: isShared(stored.ref) ? 'shared' : 'local',
        timestamp: timeOf(stored),
        contextValue: COMMENT,
      },
    ])
    const range = stored.record.location?.range
    return Object.assign(thread, {
      canReply: false,
      contextValue: OPEN,
      state: vscode.CommentThreadState.Unresolved,
      label: range === undefined ? undefined : `Lines ${compactRange(range)}`,
      collapsibleState: expanded
        ? vscode.CommentThreadCollapsibleState.Expanded
        : vscode.CommentThreadCollapsibleState.Collapsed,
    })
  }

  private decorate(uri: vscode.Uri): void {
    const marks = readSettings(uri).editorMarks
      ? this.snapshot(uri).map((entry) => entry.thread.range ?? new vscode.Range(0, 0, 0, 0))
      : []
    vscode.window.visibleTextEditors
      .filter((editor) => editor.document.uri.toString() === uri.toString())
      .forEach((editor) => editor.setDecorations(this.decoration, marks))
  }

  private clear(uri: vscode.Uri): void {
    this.snapshot(uri).forEach((entry) => entry.thread.dispose())
    this.shown.delete(uri.toString())
  }

  private reloadSafely(uri: vscode.Uri): void {
    this.reload(uri).catch((error: unknown) =>
      this.log.error('The reload of the review comments failed.', error),
    )
  }

  private reloadVisible(): void {
    visibleUris().forEach((uri) => this.reloadSafely(uri))
  }

  /** A drawn thread changes the visible editors too, so a file read before only gets its marks again. */
  private showVisible(): void {
    visibleUris().forEach((uri) =>
      this.shown.has(uri.toString()) ? this.decorate(uri) : this.reloadSafely(uri),
    )
  }

  /** A fetch or another program changes the note refs, so every visible file reads them again. */
  private noteWatchers(): vscode.Disposable[] {
    const timer: { handle?: NodeJS.Timeout } = {}
    const later = (): void => {
      clearTimeout(timer.handle)
      timer.handle = setTimeout(() => this.reloadVisible(), 300)
    }
    return [
      { dispose: () => clearTimeout(timer.handle) },
      ...(vscode.workspace.workspaceFolders ?? []).flatMap((folder) =>
        ['.git/refs/notes/**', '.git/packed-refs'].map((glob) => {
          const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(folder, glob),
          )
          watcher.onDidChange(later)
          watcher.onDidCreate(later)
          watcher.onDidDelete(later)
          return watcher
        }),
      ),
    ]
  }

  private find(predicate: (shown: Shown) => boolean): Shown | undefined {
    return [...[...this.shown.values()].flat(), ...this.resolved].find(predicate)
  }

  // --- Commands ---

  private async startThread(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (editor === undefined || editor.document.uri.scheme !== 'file') return
    const thread = this.controller.createCommentThread(editor.document.uri, editor.selection, [])
    Object.assign(thread, {
      canReply: true,
      collapsibleState: vscode.CommentThreadCollapsibleState.Expanded,
    })
  }

  private async save(reply: vscode.CommentReply, shared: boolean): Promise<void> {
    const text = reply.text.trim()
    if (text === '') {
      await vscode.window.showWarningMessage('Write the comment text first.')
      return
    }
    const document = await vscode.workspace.openTextDocument(reply.thread.uri)
    const found = await this.service.anchorOf(document.uri.fsPath)
    if (found.kind !== 'git') {
      await vscode.window.showErrorMessage(found.kind === 'noCommit' ? NO_COMMIT : NEEDS_REPOSITORY)
      return
    }
    const selected = reply.thread.range ?? new vscode.Range(0, 0, 0, 0)
    const result = await this.service.addComment(
      found.anchor,
      commentRange(
        selected.start.line + 1,
        selected.start.character,
        selected.end.line + 1,
        selected.end.character,
        document.lineAt(selected.end.line).text.length,
      ),
      text,
      shared,
    )
    reply.thread.dispose()
    await this.reload(document.uri)
    if (result.shareError !== undefined) {
      await vscode.window.showWarningMessage(
        `The comment is in the local notes, but the push failed. ${result.shareError}`,
      )
    }
  }

  private async resolve(thread: vscode.CommentThread): Promise<void> {
    const entry = this.snapshot(thread.uri).find((shown) => shown.thread === thread)
    if (entry === undefined) return
    const result = await this.service.resolve(entry.anchor, entry.stored.id)
    this.shown.set(
      thread.uri.toString(),
      this.snapshot(thread.uri).filter((shown) => shown !== entry),
    )
    this.resolved.add(entry)
    Object.assign(thread, {
      state: vscode.CommentThreadState.Resolved,
      contextValue: RESOLVED,
      collapsibleState: vscode.CommentThreadCollapsibleState.Collapsed,
    })
    this.decorate(thread.uri)
    if (result.shareError !== undefined) {
      await vscode.window.showWarningMessage(
        `The resolve is in the local notes, but the push failed. ${result.shareError}`,
      )
    }
  }

  private async remove(comment: vscode.Comment): Promise<void> {
    const entry = this.find((shown) => shown.thread.comments.includes(comment))
    if (entry === undefined) return
    const choice = await vscode.window.showWarningMessage(
      'Delete this review comment? The extension removes it from the git notes, and you cannot undo this.',
      { modal: true },
      'Delete',
    )
    if (choice !== 'Delete') return
    const result = await this.service.remove(entry.anchor, [entry.stored.id])
    this.resolved.delete(entry)
    entry.thread.dispose()
    await this.reload(entry.thread.uri)
    if (result.shareError !== undefined) {
      await vscode.window.showWarningMessage(
        `The delete is in the local notes, but the push failed. ${result.shareError}`,
      )
    }
  }
}
