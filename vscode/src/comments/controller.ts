import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import * as vscode from 'vscode'

import { parseGitUriQuery, refKindOf, revisionLabel } from '../core/diffAnchor'
import { type Segment, segments } from '../core/overlap'
import { commentRange, compactRange, hasColumns } from '../core/range'
import type { RecordRange } from '../core/record'
import { gitCalls } from '../git/runner'
import { guard } from '../guard'
import type { Log } from '../log'
import { watchNotes } from '../noteWatch'
import { readSettings } from '../settings'
import type { StoredComment } from '../store/commentBook'
import { ALL_REFS, isShared } from '../store/noteRefs'
import {
  type Anchor,
  type AnchorResult,
  NO_COMMIT,
  NO_PLACE,
  type ReviewService,
} from '../store/reviewService'

const FILE = 'file'
const GIT = 'git'
const OPEN = 'yreview.open'
const RESOLVED = 'yreview.resolved'
const COMMENT = 'yreview.comment'
const SAVING = 'yreview.saving'
const NATIVE_ADD = 'workbench.action.addComment'
const SCRATCH_DIR = `${path.sep}refs${path.sep}notes${path.sep}y-review${path.sep}scratch`

/** The box that Add Review Comment opened last, and the uri of its comment input once known. */
interface Box {
  readonly uri: vscode.Uri
  readonly line: number
  readonly thread?: vscode.CommentThread
  input?: string
}

const inputOf = (editor: vscode.TextEditor | undefined): string | undefined =>
  editor?.document.uri.scheme === 'comment' ? editor.document.uri.toString() : undefined

/** The file and the ref of a `git:` side that can take a comment. A merge stage cannot. */
const gitSide = (uri: vscode.Uri) => {
  if (uri.scheme !== GIT) return undefined
  const query = parseGitUriQuery(uri.query)
  return query === undefined || refKindOf(query.ref).kind === 'none' ? undefined : query
}

const canComment = (uri: vscode.Uri): boolean => uri.scheme === FILE || gitSide(uri) !== undefined

/** The settings of a `git:` side come from the folder of its file. */
const scopeOf = (uri: vscode.Uri): vscode.Uri => {
  const side = gitSide(uri)
  return side === undefined ? uri : vscode.Uri.file(side.path)
}

const refusalOf = (result: Exclude<AnchorResult, { kind: 'found' }>): string =>
  result.kind === 'noCommit' ? NO_COMMIT : (result.reason ?? NO_PLACE)

/** A thread on a diff side names the revision of that side in its label. */
const revisionOf = (uri: vscode.Uri, anchor: Anchor): string | undefined =>
  uri.scheme === GIT ? revisionLabel(anchor.head, anchor.dirty === true) : undefined

const linesLabel = (range: RecordRange, revision: string | undefined): string =>
  revision === undefined
    ? `Lines ${compactRange(range)}`
    : `Lines ${compactRange(range)} ${revision}`

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

/** Windows paths differ in the case of the drive letter, so a path key ignores case there. */
const fileKey = (file: string): string =>
  process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file)

const contentOf = (file: string): Promise<string | undefined> =>
  readFile(file, 'utf8').then(
    (text) => text.trim(),
    () => undefined,
  )

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

const labelOf = (stored: StoredComment, revision: string | undefined): string | undefined => {
  const range = stored.record.location?.range
  return range === undefined ? undefined : linesLabel(range, revision)
}

const openView = (stored: StoredComment, range: vscode.Range, revision: string | undefined) => ({
  comments: [commentOf(stored)],
  canReply: false,
  contextValue: OPEN,
  state: vscode.CommentThreadState.Unresolved,
  label: labelOf(stored, revision),
  range: firstLine(range),
})

const resolvedView = {
  state: vscode.CommentThreadState.Resolved,
  contextValue: RESOLVED,
  collapsibleState: vscode.CommentThreadCollapsibleState.Collapsed,
}

/** Sets only the parts that changed, so VS Code does not redraw a thread that is the same. */
const refresh = (
  old: Shown,
  stored: StoredComment,
  range: vscode.Range,
  revision: string | undefined,
): vscode.CommentThread =>
  Object.assign(old.thread, {
    ...(commentKey(old.stored) === commentKey(stored) ? {} : { comments: [commentOf(stored)] }),
    ...(old.thread.label === labelOf(stored, revision) ? {} : { label: labelOf(stored, revision) }),
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

/** A piece that ends at the start of a line ends on the line before it. */
const lastLineOf = (segment: Segment): number =>
  segment.end.character === 0 && segment.end.line > segment.start.line
    ? segment.end.line - 1
    : segment.end.line

const visibleUris = (): readonly vscode.Uri[] =>
  [
    ...new Set(vscode.window.visibleTextEditors.map((editor) => editor.document.uri.toString())),
  ].map((text) => vscode.Uri.parse(text))

/** The review comments of the open editors, drawn with the Comments API. */
export class ReviewComments implements vscode.Disposable {
  private readonly controller = vscode.comments.createCommentController('yreview', 'Yreview')

  /** Text under one open comment gets the range color, text under two or more the overlap color. */
  private readonly single = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('yreview.commentRangeBackground'),
  })

  private readonly overlap = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('yreview.commentOverlapBackground'),
    outlineColor: new vscode.ThemeColor('yreview.commentOverlapBorder'),
    outlineStyle: 'solid',
    outlineWidth: '1px',
  })

  /** The count of comments over an overlap, after the end of its last line. */
  private readonly countMark = vscode.window.createTextEditorDecorationType({
    after: {
      color: new vscode.ThemeColor('editorCodeLens.foreground'),
      margin: '0 0 0 1em',
      textDecoration: 'none; font-size: 85%',
    },
  })

  private readonly shown = new Map<string, readonly Shown[]>()

  /** Threads resolved in this session. They stay on screen until the window reloads. */
  private readonly resolved = new Set<Shown>()

  /** The full selection of each new comment, by file and first line, until its save. */
  private readonly pending = new Map<string, vscode.Range>()

  private readonly running = new Map<string, Promise<void>>()

  private readonly queued = new Map<string, Promise<void>>()

  /** The ids that a delete removes now, so a reload in the meantime does not draw them again. */
  private readonly deleting = new Set<string>()

  /** The writes of this window that run now. A note watcher waits for them. */
  private readonly writes = new Set<Promise<unknown>>()

  /** The content of each note ref file after the last write of this window, by file. */
  private readonly ownTips = new Map<string, string | undefined>()

  /** The author of the last saved comment. A new comment shows it while git writes the record. */
  private author: string | undefined

  private nativeAdd: Promise<boolean> | undefined

  private box: Box | undefined

  private readonly disposables: vscode.Disposable[] = []

  constructor(
    private readonly service: ReviewService,
    private readonly log: Log,
  ) {
    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (document) =>
        canComment(document.uri)
          ? [new vscode.Range(0, 0, Math.max(document.lineCount - 1, 0), 0)]
          : undefined,
    }
    this.controller.options = {
      prompt: 'Add a review comment',
      placeHolder: 'Write a review comment. Markdown works.',
    }
    this.disposables.push(
      this.controller,
      this.single,
      this.overlap,
      this.countMark,
      vscode.commands.registerCommand(
        'yreview.addComment',
        guard(log, 'Add Review Comment', () => this.startThread()),
      ),
      vscode.commands.registerCommand('yreview.saveLocal', (reply: vscode.CommentReply) =>
        this.saveOrKeep(reply, false),
      ),
      vscode.commands.registerCommand('yreview.saveShared', (reply: vscode.CommentReply) =>
        this.saveOrKeep(reply, true),
      ),
      vscode.commands.registerCommand('yreview.discard', (reply: vscode.CommentReply) =>
        this.discard(reply),
      ),
      vscode.commands.registerCommand(
        'yreview.closeBox',
        guard(log, 'Close', () => this.closeBox()),
      ),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (this.box !== undefined) this.box.input ??= inputOf(editor)
      }),
      vscode.commands.registerCommand(
        'yreview.resolve',
        guard(log, 'Resolve', (thread: vscode.CommentThread) =>
          this.timed('Resolve', () => this.resolve(thread)),
        ),
      ),
      vscode.commands.registerCommand(
        'yreview.delete',
        guard(log, 'Delete', (comment: vscode.Comment) => this.remove(comment)),
      ),
      vscode.languages.registerCodeActionsProvider(
        [{ scheme: FILE }, { scheme: GIT }],
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
      ...watchNotes((files) => this.noteChanged(files)),
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
    if (!canComment(uri)) return
    const known = new Set(this.snapshot(uri).map((entry) => entry.stored.id))
    const found = await this.anchorFor(uri)
    if (found.kind !== 'found') {
      this.clear(uri)
      this.decorate(uri)
      return
    }
    const stored = (await this.service.openAt(found.anchor)).filter(
      (entry) => !this.deleting.has(entry.id),
    )
    const document = await vscode.workspace.openTextDocument(uri)
    const ids = new Set(stored.map((entry) => entry.id))
    const before = this.snapshot(uri)
    const expanded = !this.shown.has(uri.toString()) && readSettings(scopeOf(uri)).editorMarks
    before
      .filter((entry) => known.has(entry.stored.id) && !ids.has(entry.stored.id))
      .forEach((entry) => entry.thread.dispose())
    this.shown.set(uri.toString(), [
      ...stored.map((entry) => {
        const range = fullRange(entry, document)
        const old = before.find((shown) => shown.stored.id === entry.id)
        return {
          thread:
            old === undefined
              ? this.draw(uri, entry, found.anchor, range, expanded)
              : refresh(old, entry, range, revisionOf(uri, found.anchor)),
          stored: entry,
          anchor: found.anchor,
          range,
        }
      }),
      ...before.filter((entry) => !known.has(entry.stored.id) && !ids.has(entry.stored.id)),
    ])
    this.decorate(uri)
  }

  /** A `git:` side anchors at the revision of its ref, and a file at HEAD or in a folder store. */
  private anchorFor(uri: vscode.Uri): Promise<AnchorResult> {
    const side = gitSide(uri)
    if (side !== undefined) return this.service.anchorOfRevision(side.path, side.ref)
    return uri.scheme === FILE
      ? this.service.anchorOf(uri.fsPath)
      : Promise.resolve({ kind: 'noPlace' })
  }

  /** The count of git processes so far. Tests use it. */
  readonly gitCalls = gitCalls

  /** True while a new comment box on this line keeps its selection. Tests use it. */
  hasPending(uri: vscode.Uri, at: number): boolean {
    return this.pending.has(pendingKey(uri, at))
  }

  snapshot(uri: vscode.Uri): readonly Shown[] {
    return this.shown.get(uri.toString()) ?? []
  }

  /** Draws the comments of the file and expands the thread of one comment. False when no thread shows it. */
  async reveal(uri: vscode.Uri, id: string): Promise<boolean> {
    const find = (): Shown | undefined => this.snapshot(uri).find((shown) => shown.stored.id === id)
    if (find() === undefined) await this.reload(uri)
    const entry = find()
    if (entry === undefined) return false
    Object.assign(entry.thread, { collapsibleState: vscode.CommentThreadCollapsibleState.Expanded })
    return true
  }

  /** The commented text of one file, split by the number of open comments that cover it. */
  segmentsOf(uri: vscode.Uri): Segment[] {
    return readSettings(scopeOf(uri)).editorMarks
      ? segments(
          this.snapshot(uri).map(({ range }) => ({
            start: plain(range.start),
            end: plain(range.end),
          })),
        )
      : []
  }

  /** The count marks of one file: one for each line where overlap pieces end, with the top count. */
  countMarksOf(uri: vscode.Uri): ReadonlyMap<number, number> {
    return this.segmentsOf(uri)
      .filter((segment) => segment.count > 1)
      .reduce(
        (marks, segment) =>
          marks.set(
            lastLineOf(segment),
            Math.max(marks.get(lastLineOf(segment)) ?? 0, segment.count),
          ),
        new Map<number, number>(),
      )
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
    anchor: Anchor,
    range: vscode.Range,
    expanded: boolean,
  ): vscode.CommentThread {
    return Object.assign(
      this.controller.createCommentThread(uri, firstLine(range), []),
      openView(stored, range, revisionOf(uri, anchor)),
      {
        collapsibleState: expanded
          ? vscode.CommentThreadCollapsibleState.Expanded
          : vscode.CommentThreadCollapsibleState.Collapsed,
      },
    )
  }

  private decorate(uri: vscode.Uri): void {
    const marks = this.segmentsOf(uri)
    const counts = this.countMarksOf(uri)
    vscode.window.visibleTextEditors
      .filter((editor) => editor.document.uri.toString() === uri.toString())
      .forEach((editor) => {
        editor.setDecorations(
          this.single,
          marks.filter((segment) => segment.count === 1).map(rangeOfSegment),
        )
        editor.setDecorations(
          this.overlap,
          marks
            .filter((segment) => segment.count > 1)
            .map((segment) => ({
              range: rangeOfSegment(segment),
              hoverMessage: `${segment.count} open review comments cover this text.`,
            })),
        )
        editor.setDecorations(
          this.countMark,
          [...counts].map(([at, count]) => {
            const { end } = editor.document.lineAt(at).range
            return {
              range: new vscode.Range(end, end),
              renderOptions: { after: { contentText: String(count) } },
            }
          }),
        )
      })
  }

  /** The setting picks the state of the threads when a file loads, and again when it changes. */
  private applyMarks(): void {
    visibleUris().forEach((uri) => {
      const collapsibleState = readSettings(scopeOf(uri)).editorMarks
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
  private noteChanged(files: readonly string[]): void {
    this.foreignChange(files)
      .then((foreign) => (foreign ? this.reloadVisible() : undefined))
      .catch((error: unknown) => this.log.error('The check of the note refs failed.', error))
  }

  /** False when each change is a folder, a scratch ref, a lock file, or a ref that this window wrote. */
  private async foreignChange(files: readonly string[]): Promise<boolean> {
    await Promise.allSettled([...this.writes])
    const answers = await Promise.all(
      files
        .filter(
          (file) =>
            !file.endsWith(SCRATCH_DIR) &&
            !file.includes(`${SCRATCH_DIR}${path.sep}`) &&
            !file.endsWith('.lock'),
        )
        .map(
          async (file) =>
            (await stat(file).catch(() => undefined))?.isDirectory() !== true &&
            (!this.ownTips.has(fileKey(file)) ||
              (await contentOf(file)) !== this.ownTips.get(fileKey(file))),
        ),
    )
    return answers.includes(true)
  }

  /** Keeps the note ref files as this window wrote them. Git keeps a loose ref under .git. */
  private async rememberTips(root: string): Promise<void> {
    await Promise.all(
      ALL_REFS.map((ref) => path.join(root, '.git', ...ref.split('/'))).map(async (file) =>
        this.ownTips.set(fileKey(file), await contentOf(file)),
      ),
    )
  }

  /** Runs one write of this window. The note watchers wait for it before they look at the refs. */
  private async write<T>(root: string, work: () => Promise<T>): Promise<T> {
    const done = work().then(async (result) => {
      await this.rememberTips(root)
      return result
    })
    this.writes.add(done)
    try {
      return await done
    } finally {
      this.writes.delete(done)
    }
  }

  /** Writes one debug line for each action with its duration and its count of git processes. */
  private async timed(what: string, work: () => Promise<void>): Promise<void> {
    const start = Date.now()
    const before = gitCalls()
    try {
      await work()
    } finally {
      this.log.debug(
        `${what} took ${Date.now() - start} ms and started ${gitCalls() - before} git processes.`,
      )
    }
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
    if (editor === undefined || !canComment(editor.document.uri)) return
    const { document, selection } = editor
    // A diff side with no file at its revision opens no box. The save of a file box gives its reason.
    const found =
      gitSide(document.uri) === undefined ? undefined : await this.anchorFor(document.uri)
    if (found !== undefined && found.kind !== 'found') {
      vscode.window.showErrorMessage(refusalOf(found)).then(undefined, () => undefined)
      return
    }
    const at = selection.start.line
    this.pending.set(pendingKey(document.uri, at), new vscode.Range(selection.start, selection.end))
    const glyphOnLine = this.find(
      (shown) =>
        shown.thread.uri.toString() === document.uri.toString() &&
        shown.thread.range?.end.line === at,
    )
    if ((await this.hasNativeAdd()) && glyphOnLine === undefined) {
      editor.selection = new vscode.Selection(selection.start, selection.start)
      this.box = { uri: document.uri, line: at }
      await vscode.commands.executeCommand(NATIVE_ADD)
      editor.selection = selection
      this.box.input ??= inputOf(vscode.window.activeTextEditor)
      return
    }
    this.box = {
      uri: document.uri,
      line: at,
      thread: Object.assign(
        this.controller.createCommentThread(document.uri, firstLine(selection), []),
        {
          canReply: true,
          collapsibleState: vscode.CommentThreadCollapsibleState.Expanded,
          label: found === undefined ? undefined : revisionOf(document.uri, found.anchor),
        },
      ),
    }
  }

  // The last hideComment handler of VS Code skips a comment input, so Escape does nothing there.
  // The native add command on the line of the box closes the box, and asks first when it has text.
  private async closeBox(): Promise<void> {
    const { box } = this
    if (box === undefined || box.input !== inputOf(vscode.window.activeTextEditor)) {
      await vscode.commands.executeCommand('workbench.action.hideComment')
      return
    }
    this.box = undefined
    if (box.thread !== undefined) {
      this.pending.delete(pendingKey(box.uri, box.line))
      box.thread.dispose()
      return
    }
    await vscode.commands.executeCommand(NATIVE_ADD, {
      range: { startLineNumber: box.line + 1, endLineNumber: box.line + 1, endColumn: 1 },
    })
  }

  private forgetBox(thread: vscode.CommentThread): void {
    if (
      this.box?.uri.toString() === thread.uri.toString() &&
      this.box.line === thread.range?.start.line
    ) {
      this.box = undefined
    }
  }

  /** A box with no saved comment closes at once, with no question about its text. */
  private discard(reply: vscode.CommentReply): void {
    this.pending.delete(pendingKey(reply.thread.uri, reply.thread.range?.start.line ?? 0))
    this.forgetBox(reply.thread)
    reply.thread.dispose()
  }

  /** A failed save rejects, because VS Code then keeps the text in the comment box. */
  private async saveOrKeep(reply: vscode.CommentReply, shared: boolean): Promise<void> {
    try {
      await this.timed(shared ? 'Save Shared' : 'Save Local', () => this.save(reply, shared))
    } catch (error) {
      this.log.error('Save failed.', error)
      vscode.window
        .showErrorMessage(`Save failed. ${error instanceof Error ? error.message : String(error)}`)
        .then(undefined, () => undefined)
      throw error
    }
  }

  /** The box shows the comment at once and becomes the saved thread. A failure opens the box again. */
  private async save(reply: vscode.CommentReply, shared: boolean): Promise<void> {
    const text = reply.text.trim()
    if (text === '') {
      await vscode.window.showWarningMessage('Write the comment text first.')
      return
    }
    const { thread } = reply
    const document = await vscode.workspace.openTextDocument(thread.uri)
    const key = pendingKey(document.uri, thread.range?.start.line ?? 0)
    const selected = this.pending.get(key) ?? thread.range ?? new vscode.Range(0, 0, 0, 0)
    const range = commentRange(
      selected.start.line + 1,
      selected.start.character,
      selected.end.line + 1,
      selected.end.character,
      document.lineAt(selected.end.line).text.length,
    )
    Object.assign(thread, {
      comments: [
        {
          body: untrusted(text),
          mode: vscode.CommentMode.Preview,
          author: { name: this.author ?? 'You' },
          label: shared ? 'shared, saving' : 'local, saving',
          contextValue: SAVING,
        },
      ],
      canReply: false,
      contextValue: SAVING,
      label: `Lines ${compactRange(range)}`,
      collapsibleState: vscode.CommentThreadCollapsibleState.Collapsed,
    })
    try {
      const found = await this.anchorFor(document.uri)
      if (found.kind !== 'found') throw new Error(refusalOf(found))
      const result = await this.write(found.anchor.root, () =>
        this.service.addComment(found.anchor, range, text, shared),
      )
      this.author = result.stored.record.author
      this.pending.delete(key)
      this.forgetBox(thread)
      const shownRange = fullRange(result.stored, document)
      Object.assign(
        thread,
        openView(result.stored, shownRange, revisionOf(document.uri, found.anchor)),
      )
      const twins = this.snapshot(document.uri).filter(
        (entry) => entry.stored.id === result.stored.id,
      )
      twins.forEach((entry) => entry.thread.dispose())
      this.shown.set(document.uri.toString(), [
        ...this.snapshot(document.uri).filter((entry) => !twins.includes(entry)),
        { thread, stored: result.stored, anchor: found.anchor, range: shownRange },
      ])
      this.decorate(document.uri)
      // A message that waits for a click would hold the command, so the notices do not wait.
      result.notices?.forEach((notice) => {
        vscode.window.showInformationMessage(notice).then(undefined, () => undefined)
      })
      if (result.shareError !== undefined) {
        await vscode.window.showWarningMessage(
          `The comment is in the local notes, but the push failed. ${result.shareError}`,
        )
      }
    } catch (error) {
      Object.assign(thread, {
        comments: [],
        canReply: true,
        contextValue: undefined,
        label: undefined,
        collapsibleState: vscode.CommentThreadCollapsibleState.Expanded,
      })
      throw error
    }
  }

  private async resolve(thread: vscode.CommentThread): Promise<void> {
    const entry = this.snapshot(thread.uri).find((shown) => shown.thread === thread)
    if (entry === undefined) return
    const result = await this.write(entry.anchor.root, () =>
      this.service.resolve(entry.anchor, entry.stored.id),
    )
    this.shown.set(
      thread.uri.toString(),
      this.snapshot(thread.uri).filter((shown) => shown !== entry),
    )
    this.resolved.add(entry)
    Object.assign(thread, resolvedView)
    this.decorate(thread.uri)
    if (result.shareError !== undefined) {
      await vscode.window.showWarningMessage(
        `The resolve is in the local notes, but the push failed. ${result.shareError}`,
      )
    }
  }

  private async remove(comment: vscode.Comment): Promise<void> {
    const choice = await vscode.window.showWarningMessage(
      'Delete this review comment? The extension removes it from the git notes, and you cannot undo this.',
      { modal: true },
      'Delete',
    )
    if (choice === 'Delete') await this.deleteComment(comment)
  }

  /** Deletes a shown comment with no question. The thread goes at once, and a failure draws it again. */
  async deleteComment(comment: vscode.Comment): Promise<void> {
    const entry = this.find((shown) => shown.thread.comments.includes(comment))
    if (entry === undefined) return
    const { uri } = entry.thread
    const wasResolved = this.resolved.delete(entry)
    this.shown.set(
      uri.toString(),
      this.snapshot(uri).filter((shown) => shown !== entry),
    )
    entry.thread.dispose()
    this.decorate(uri)
    this.deleting.add(entry.stored.id)
    await this.timed('Delete', async () => {
      try {
        const result = await this.write(entry.anchor.root, () =>
          this.service.removeStored(entry.anchor, [entry.stored]),
        )
        if (result.shareError !== undefined) {
          await vscode.window.showWarningMessage(
            `The delete is in the local notes, but the push failed. ${result.shareError}`,
          )
        }
      } catch (error) {
        const thread = this.draw(uri, entry.stored, entry.anchor, entry.range, false)
        const back = {
          ...entry,
          thread: wasResolved ? Object.assign(thread, resolvedView) : thread,
        }
        if (wasResolved) this.resolved.add(back)
        else this.shown.set(uri.toString(), [...this.snapshot(uri), back])
        this.decorate(uri)
        throw error
      } finally {
        this.deleting.delete(entry.stored.id)
      }
    })
  }
}
