import * as vscode from 'vscode'

import { MAX_DEPTH, type Segment, segments } from '../core/overlap'
import { commentRange, compactRange, hasColumns } from '../core/range'
import { guard } from '../guard'
import type { Log } from '../log'
import { readSettings } from '../settings'
import type { StoredComment } from '../store/commentBook'
import { isShared } from '../store/noteRefs'
import { type Anchor, NO_COMMIT, NO_REPOSITORY, type ReviewService } from '../store/reviewService'

const OPEN = 'yreview.open'
const RESOLVED = 'yreview.resolved'
const COMMENT = 'yreview.comment'
const NATIVE_ADD = 'workbench.action.addComment'
const LAYER_COLORS = [
  'yreview.commentRangeBackground',
  'yreview.commentRangeBackground2',
  'yreview.commentRangeBackground3',
]

export const NEEDS_REPOSITORY = `${NO_REPOSITORY} Open a folder that is a git repository.`

export interface Shown {
  readonly thread: vscode.CommentThread
  readonly stored: StoredComment
  readonly anchor: Anchor
  /** The full commented text. The thread itself sits on the first line of it. */
  readonly range: vscode.Range
}

const line = (value: number): number => Math.max(value - 1, 0)

/** The stored range in the document. A range of whole lines ends at the end of its last line. */
const fullRange = (stored: StoredComment, document: vscode.TextDocument): vscode.Range => {
  const range = stored.record.location?.range
  if (range === undefined) return new vscode.Range(0, 0, 0, 0)
  return document.validateRange(
    hasColumns(range.startColumn, range.endColumn)
      ? new vscode.Range(
          line(range.startLine),
          Math.max(range.startColumn ?? 0, 0),
          line(range.endLine),
          Math.max(range.endColumn ?? 0, 0),
        )
      : new vscode.Range(line(range.startLine), 0, line(range.endLine), Number.MAX_SAFE_INTEGER),
  )
}

/** The native comment box opens under the last line of the thread range, so the range is one line. */
const firstLine = (range: vscode.Range): vscode.Range =>
  new vscode.Range(range.start.line, 0, range.start.line, 0)

const pendingKey = (uri: vscode.Uri, at: number): string => `${uri.toString()}#${at}`

/** Comment text comes from other people, so it renders with no command links and no HTML. */
const untrusted = (text: string): vscode.MarkdownString =>
  Object.assign(new vscode.MarkdownString(text), { isTrusted: false, supportHtml: false })

const timeOf = (stored: StoredComment): Date | undefined => {
  const seconds = Number(stored.record.timestamp)
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : undefined
}

const commentOf = (stored: StoredComment): vscode.Comment => ({
  body: untrusted(stored.record.description ?? ''),
  mode: vscode.CommentMode.Preview,
  author: { name: stored.record.author },
  label: isShared(stored.ref) ? 'shared' : 'local',
  timestamp: timeOf(stored),
  contextValue: COMMENT,
})

const commentKey = (stored: StoredComment): string =>
  JSON.stringify([
    stored.record.description,
    stored.record.author,
    stored.record.timestamp,
    isShared(stored.ref),
  ])

const labelOf = (stored: StoredComment): string | undefined => {
  const range = stored.record.location?.range
  return range === undefined ? undefined : `Lines ${compactRange(range)}`
}

const openView = (stored: StoredComment, range: vscode.Range) => ({
  comments: [commentOf(stored)],
  canReply: false,
  contextValue: OPEN,
  state: vscode.CommentThreadState.Unresolved,
  label: labelOf(stored),
  range: firstLine(range),
})

/** Sets only the parts that changed, so VS Code does not redraw a thread that is the same. */
const refresh = (old: Shown, stored: StoredComment, range: vscode.Range): vscode.CommentThread =>
  Object.assign(old.thread, {
    ...(commentKey(old.stored) === commentKey(stored) ? {} : { comments: [commentOf(stored)] }),
    ...(labelOf(old.stored) === labelOf(stored) ? {} : { label: labelOf(stored) }),
    ...(old.thread.range?.isEqual(firstLine(range)) ? {} : { range: firstLine(range) }),
  })

const plain = (position: vscode.Position) => ({
  line: position.line,
  character: position.character,
})

const rangeOfSegment = (segment: Segment): vscode.Range =>
  new vscode.Range(
    segment.start.line,
    segment.start.character,
    segment.end.line,
    segment.end.character,
  )

const visibleUris = (): readonly vscode.Uri[] =>
  [
    ...new Set(vscode.window.visibleTextEditors.map((editor) => editor.document.uri.toString())),
  ].map((text) => vscode.Uri.parse(text))

/** The review comments of the open editors, drawn with the Comments API. */
export class ReviewComments implements vscode.Disposable {
  private readonly controller = vscode.comments.createCommentController('yreview', 'Yreview')

  /** Layer N colors the text that N or more open comments cover, so overlaps get darker. */
  private readonly layers = LAYER_COLORS.slice(0, MAX_DEPTH).map((color) =>
    vscode.window.createTextEditorDecorationType({ backgroundColor: new vscode.ThemeColor(color) }),
  )

  private readonly hover = vscode.window.createTextEditorDecorationType({})

  private readonly shown = new Map<string, readonly Shown[]>()

  /** Threads resolved in this session. They stay on screen until the window reloads. */
  private readonly resolved = new Set<Shown>()

  /** The full selection of each new comment, by file and first line, until its save. */
  private readonly pending = new Map<string, vscode.Range>()

  private readonly running = new Map<string, Promise<void>>()

  private readonly queued = new Map<string, Promise<void>>()

  private nativeAdd: Promise<boolean> | undefined

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
      ...this.layers,
      this.hover,
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
        if (event.affectsConfiguration('yreview.editorMarks')) this.applyMarks()
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

  /** Keeps the thread of each known comment id, so a reload does not make the threads flicker. */
  private async load(uri: vscode.Uri): Promise<void> {
    if (uri.scheme !== 'file') return
    const known = new Set(this.snapshot(uri).map((entry) => entry.stored.id))
    const found = await this.service.anchorOf(uri.fsPath)
    if (found.kind !== 'git') {
      this.clear(uri)
      this.decorate(uri)
      return
    }
    const stored = await this.service.openAt(found.anchor)
    const document = await vscode.workspace.openTextDocument(uri)
    const ids = new Set(stored.map((entry) => entry.id))
    const before = this.snapshot(uri)
    const expanded = !this.shown.has(uri.toString()) && readSettings(uri).editorMarks
    before
      .filter((entry) => known.has(entry.stored.id) && !ids.has(entry.stored.id))
      .forEach((entry) => entry.thread.dispose())
    this.shown.set(uri.toString(), [
      ...stored.map((entry) => {
        const range = fullRange(entry, document)
        const old = before.find((shown) => shown.stored.id === entry.id)
        return {
          thread:
            old === undefined ? this.draw(uri, entry, range, expanded) : refresh(old, entry, range),
          stored: entry,
          anchor: found.anchor,
          range,
        }
      }),
      ...before.filter((entry) => !known.has(entry.stored.id) && !ids.has(entry.stored.id)),
    ])
    this.decorate(uri)
  }

  snapshot(uri: vscode.Uri): readonly Shown[] {
    return this.shown.get(uri.toString()) ?? []
  }

  /** The commented text of one file, split by the number of open comments that cover it. */
  segmentsOf(uri: vscode.Uri): Segment[] {
    return readSettings(uri).editorMarks
      ? segments(
          this.snapshot(uri).map(({ range }) => ({
            start: plain(range.start),
            end: plain(range.end),
          })),
        )
      : []
  }

  dispose(): void {
    this.shown.forEach((entries) => entries.forEach((entry) => entry.thread.dispose()))
    this.resolved.forEach((entry) => entry.thread.dispose())
    this.disposables.forEach((disposable) => disposable.dispose())
  }

  // --- Drawing ---

  private draw(
    uri: vscode.Uri,
    stored: StoredComment,
    range: vscode.Range,
    expanded: boolean,
  ): vscode.CommentThread {
    return Object.assign(
      this.controller.createCommentThread(uri, firstLine(range), []),
      openView(stored, range),
      {
        collapsibleState: expanded
          ? vscode.CommentThreadCollapsibleState.Expanded
          : vscode.CommentThreadCollapsibleState.Collapsed,
      },
    )
  }

  private decorate(uri: vscode.Uri): void {
    const marks = this.segmentsOf(uri)
    vscode.window.visibleTextEditors
      .filter((editor) => editor.document.uri.toString() === uri.toString())
      .forEach((editor) => {
        this.layers.forEach((layer, index) =>
          editor.setDecorations(
            layer,
            marks.filter((segment) => segment.depth > index).map(rangeOfSegment),
          ),
        )
        editor.setDecorations(
          this.hover,
          marks
            .filter((segment) => segment.count > 1)
            .map((segment) => ({
              range: new vscode.Range(
                segment.start.line,
                segment.start.character,
                segment.start.line,
                segment.start.line === segment.end.line
                  ? segment.end.character
                  : editor.document.lineAt(segment.start.line).text.length,
              ),
              hoverMessage: `${segment.count} open review comments cover this text.`,
            })),
        )
      })
  }

  /** The setting picks the state of the threads when a file loads, and again when it changes. */
  private applyMarks(): void {
    visibleUris().forEach((uri) => {
      const collapsibleState = readSettings(uri).editorMarks
        ? vscode.CommentThreadCollapsibleState.Expanded
        : vscode.CommentThreadCollapsibleState.Collapsed
      this.snapshot(uri).forEach(({ thread }) => Object.assign(thread, { collapsibleState }))
      this.decorate(uri)
    })
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

  /** The native command focuses the comment box, so it is used when it exists. */
  private hasNativeAdd(): Promise<boolean> {
    this.nativeAdd ??= Promise.resolve(vscode.commands.getCommands(true)).then((all) => {
      const found = all.includes(NATIVE_ADD)
      if (!found)
        this.log.warn(`VS Code has no ${NATIVE_ADD} command. The comment box opens without focus.`)
      return found
    })
    return this.nativeAdd
  }

  /** VS Code opens a comment box itself, with the focus in it, on the first line of the selection. */
  private async startThread(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (editor === undefined || editor.document.uri.scheme !== 'file') return
    const { document, selection } = editor
    const at = selection.start.line
    this.pending.set(pendingKey(document.uri, at), new vscode.Range(selection.start, selection.end))
    const glyphOnLine = this.find(
      (shown) =>
        shown.thread.uri.toString() === document.uri.toString() &&
        shown.thread.range?.end.line === at,
    )
    if ((await this.hasNativeAdd()) && glyphOnLine === undefined) {
      editor.selection = new vscode.Selection(selection.start, selection.start)
      await vscode.commands.executeCommand(NATIVE_ADD)
      editor.selection = selection
      return
    }
    Object.assign(this.controller.createCommentThread(document.uri, firstLine(selection), []), {
      canReply: true,
      collapsibleState: vscode.CommentThreadCollapsibleState.Expanded,
    })
  }

  /** The comment box becomes the saved thread, so nothing on screen closes and opens again. */
  private async save(reply: vscode.CommentReply, shared: boolean): Promise<void> {
    const text = reply.text.trim()
    if (text === '') {
      await vscode.window.showWarningMessage('Write the comment text first.')
      return
    }
    const { thread } = reply
    const document = await vscode.workspace.openTextDocument(thread.uri)
    const found = await this.service.anchorOf(document.uri.fsPath)
    if (found.kind !== 'git') {
      await vscode.window.showErrorMessage(found.kind === 'noCommit' ? NO_COMMIT : NEEDS_REPOSITORY)
      return
    }
    const key = pendingKey(document.uri, thread.range?.start.line ?? 0)
    const selected = this.pending.get(key) ?? thread.range ?? new vscode.Range(0, 0, 0, 0)
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
    this.pending.delete(key)
    const range = fullRange(result.stored, document)
    Object.assign(thread, openView(result.stored, range), {
      collapsibleState: vscode.CommentThreadCollapsibleState.Collapsed,
    })
    const twins = this.snapshot(document.uri).filter(
      (entry) => entry.stored.id === result.stored.id,
    )
    twins.forEach((entry) => entry.thread.dispose())
    this.shown.set(document.uri.toString(), [
      ...this.snapshot(document.uri).filter((entry) => !twins.includes(entry)),
      { thread, stored: result.stored, anchor: found.anchor, range },
    ])
    this.decorate(document.uri)
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
    const { uri } = entry.thread
    this.resolved.delete(entry)
    this.shown.set(
      uri.toString(),
      this.snapshot(uri).filter((shown) => shown !== entry),
    )
    entry.thread.dispose()
    this.decorate(uri)
    if (result.shareError !== undefined) {
      await vscode.window.showWarningMessage(
        `The delete is in the local notes, but the push failed. ${result.shareError}`,
      )
    }
  }
}
