import * as vscode from 'vscode'

import { firstAsk, type RangeAsk } from '../comments/controller'
import { shownRange } from '../core/lineMap'
import { guard } from '../guard'
import type { Log } from '../log'
import type { ReviewService } from '../store/reviewService'
import { gitApi, watchHeads } from '../views/repositories'
import type { LineSpan, PreviewSource } from './markdownPlugin'
import { linesOfSelection, rangeOfContext } from './previewLines'
import { wholeLines } from './wholeLines'

/** The longest wait for the source group to become the active group. */
const FOCUS_LIMIT_MS = 2000

/** The rich Markdown editor. VS Code keeps its selection for the editor that replaces it. */
const RICH_EDITOR = 'vscode.markdown.editor'

/** The custom editors of the built-in Markdown extension that show one Markdown file. */
const MARKDOWN_EDITORS = new Set(['vscode.markdown.preview.editor', RICH_EDITOR])

const refresh = (): void => {
  // The command exists only while the Markdown extension runs. Without it, no preview is open.
  vscode.commands.executeCommand('markdown.preview.refresh').then(undefined, () => undefined)
}

/** Opens a new editor beside the active group, and returns when it can take a comment box. */
const openBeside = async (
  asked: RangeAsk,
  document: vscode.TextDocument,
  selection?: vscode.Selection,
): Promise<vscode.TextEditor> => {
  // A box that opens before this read, or before the editor has the keyboard focus, gets no focus.
  const read = firstAsk(asked, document.uri)
  const editor = await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.Beside,
    selection,
  })
  await read
  await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup')
  return editor
}

/** The text editor of a file, in a visible group other than `column`, else beside it. */
const showBeside = async (
  asked: RangeAsk,
  uri: vscode.Uri,
  column: vscode.ViewColumn,
): Promise<vscode.TextEditor> => {
  const visible = vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.toString() === uri.toString() && editor.viewColumn !== column,
  )
  return visible === undefined
    ? openBeside(asked, await vscode.workspace.openTextDocument(uri))
    : vscode.window.showTextDocument(visible.document, visible.viewColumn)
}

/** The source editor of the active preview. The preview stays in view. */
const sourceEditor = async (asked: RangeAsk): Promise<vscode.TextEditor | undefined> => {
  const group = vscode.window.tabGroups.activeTabGroup
  const input = group.activeTab?.input
  if (input instanceof vscode.TabInputCustom && MARKDOWN_EDITORS.has(input.viewType)) {
    return showBeside(asked, input.uri, group.viewColumn)
  }
  // Only the Markdown extension knows the file of its preview panel.
  await vscode.commands.executeCommand('markdown.showSource')
  const editor = vscode.window.activeTextEditor
  if (editor === undefined || editor.viewColumn !== group.viewColumn) return editor
  await vscode.commands.executeCommand('workbench.action.openPreviousRecentlyUsedEditorInGroup')
  return openBeside(asked, editor.document, editor.selection)
}

/** The source beside the active rich editor, and the rich editor selection that a text editor reads. */
const besideRich = async (
  asked: RangeAsk,
): Promise<{ editor: vscode.TextEditor; selection?: vscode.Selection } | undefined> => {
  const { activeTab, viewColumn } = vscode.window.tabGroups.activeTabGroup
  const input = activeTab?.input
  if (!(input instanceof vscode.TabInputCustom) || input.viewType !== RICH_EDITOR) return undefined
  // The late range ask of this text editor would count as the ask of the source editor beside.
  const read = firstAsk(asked, input.uri)
  await vscode.commands.executeCommand('reopenActiveEditorWith', 'default')
  const text = vscode.window.activeTextEditor
  const selection =
    text?.document.uri.toString() === input.uri.toString() ? text.selection : undefined
  const temporary = vscode.window.tabGroups.activeTabGroup.activeTab
  await read
  // A webview that opens with the focus takes it late, also from the comment box.
  await vscode.commands.executeCommand('vscode.openWith', input.uri, RICH_EDITOR, {
    viewColumn,
    preserveFocus: true,
    preview: activeTab?.isPreview,
    selection,
  } satisfies vscode.TextDocumentShowOptions)
  const editor = await showBeside(asked, input.uri, viewColumn)
  // The tab closes after the focus left its group, so the group gives the focus to no editor.
  if (temporary?.input instanceof vscode.TabInputText)
    await vscode.window.tabGroups.close(temporary, true)
  return { editor, selection }
}

/** True when the editor is the active text editor and its group is the active group. */
const isFocused = (editor: vscode.TextEditor): boolean =>
  vscode.window.activeTextEditor?.document === editor.document &&
  vscode.window.activeTextEditor.viewColumn === editor.viewColumn &&
  vscode.window.tabGroups.activeTabGroup.viewColumn === editor.viewColumn

/** Gives the source the focus again when the rich editor group took it, and waits for that state. */
const focusSource = async (editor: vscode.TextEditor): Promise<void> => {
  if (isFocused(editor)) return
  const focused = Promise.withResolvers<void>()
  const check = (): void => {
    if (isFocused(editor)) focused.resolve()
  }
  const listeners = [
    vscode.window.onDidChangeActiveTextEditor(check),
    vscode.window.tabGroups.onDidChangeTabGroups(check),
  ]
  const timer = setTimeout(focused.resolve, FOCUS_LIMIT_MS)
  await vscode.window.showTextDocument(editor.document, {
    viewColumn: editor.viewColumn,
    preserveFocus: false,
  })
  check()
  await focused.promise
  clearTimeout(timer)
  listeners.forEach((listener) => listener.dispose())
}

/** Opens the comment box in the source, on the whole lines of the menu or the rich editor selection, else at the caret. */
const fromPreview =
  (asked: RangeAsk) =>
  async (context?: unknown): Promise<void> => {
    const lines = rangeOfContext(context)
    const rich = lines === undefined ? await besideRich(asked) : undefined
    const editor = rich?.editor ?? (await sourceEditor(asked))
    if (editor === undefined) return
    const selection = wholeLines(
      editor.document,
      rich?.selection === undefined
        ? lines
        : linesOfSelection(
            rich.selection.start.line,
            rich.selection.end.line,
            rich.selection.end.character,
          ),
    )
    if (selection !== undefined) {
      editor.selection = selection
      editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
    }
    // The native add opens the box in the active group, so the rich editor group must not have it.
    if (rich !== undefined) await focusSource(editor)
    await vscode.commands.executeCommand('yreview.addComment')
  }

/** The comment ranges of the files in the preview, and the Add Review Comment command there. */
export class PreviewHost implements vscode.Disposable {
  private readonly lines = new Map<string, readonly LineSpan[]>()

  private readonly loads = new Map<string, Promise<void>>()

  /** Grows on each forget, so a load that started before it writes no spans. */
  private generation = 0

  private readonly disposables: vscode.Disposable[] = []

  /** A commit, a checkout, or a reset maps the comments to other lines. */
  private readonly heads = gitApi().then((api) => watchHeads(api, () => this.forget()))

  readonly source: PreviewSource = {
    commented: (file) => this.commented(file),
    failed: (error) => this.log.error('The preview marks failed.', error),
  }

  constructor(
    private readonly service: ReviewService,
    private readonly log: Log,
    asked: RangeAsk,
  ) {
    const stopListening = service.onDidChange(() => this.forget())
    this.disposables.push(
      { dispose: stopListening },
      vscode.commands.registerCommand(
        'yreview.addCommentFromPreview',
        guard(log, 'Add Review Comment', fromPreview(asked)),
      ),
    )
  }

  /** Waits for each load of comment ranges. Tests call it. */
  async settled(): Promise<void> {
    await Promise.all(this.loads.values())
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose())
    this.heads.then(
      (watch) => watch.dispose(),
      () => undefined,
    )
  }

  private forget(): void {
    this.generation += 1
    this.lines.clear()
    this.loads.clear()
    refresh()
  }

  private commented(file: string): readonly LineSpan[] | undefined {
    const known = this.lines.get(file)
    if (known === undefined && !this.loads.has(file)) {
      const load: Promise<void> = this.load(file, this.generation).finally(() => {
        if (this.loads.get(file) === load) this.loads.delete(file)
      })
      this.loads.set(file, load)
    }
    return known
  }

  private async load(file: string, generation: number): Promise<void> {
    try {
      const found = await this.service.anchorOf(file)
      const spans =
        found.kind === 'found'
          ? (await this.service.placedAt(found.anchor))
              .map(({ carry }) => shownRange(carry))
              .flatMap((range) =>
                range === undefined ? [] : [{ start: range.startLine, end: range.endLine }],
              )
          : []
      if (generation !== this.generation) return
      this.lines.set(file, spans)
      if (spans.length > 0) refresh()
    } catch (error) {
      this.log.error('The preview could not read the comments.', error)
    }
  }
}
