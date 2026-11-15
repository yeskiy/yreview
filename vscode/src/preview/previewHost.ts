import * as vscode from 'vscode'

import { firstAsk, type RangeAsk } from '../comments/controller'
import { guard } from '../guard'
import type { Log } from '../log'
import type { ReviewService } from '../store/reviewService'
import type { LineSpan, PreviewSource } from './markdownPlugin'
import { fitted, rangeOfContext } from './previewLines'

/** The custom editors of the built-in Markdown extension that show one Markdown file. */
const MARKDOWN_EDITORS = new Set(['vscode.markdown.preview.editor', 'vscode.markdown.editor'])

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

/** Opens the comment box in the source, on the preview lines of the context menu or at the caret. */
const fromPreview =
  (asked: RangeAsk) =>
  async (context?: unknown): Promise<void> => {
    const lines = rangeOfContext(context)
    const editor = await sourceEditor(asked)
    if (editor === undefined) return
    const { document } = editor
    const range =
      lines === undefined
        ? undefined
        : fitted(lines, document.lineCount, (line) => document.lineAt(line).isEmptyOrWhitespace)
    if (range !== undefined) {
      editor.selection = new vscode.Selection(
        range.start,
        0,
        range.end,
        document.lineAt(range.end).text.length,
      )
      editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
    }
    await vscode.commands.executeCommand('yreview.addComment')
  }

/** The comment ranges of the files in the preview, and the Add Review Comment command there. */
export class PreviewHost implements vscode.Disposable {
  private readonly lines = new Map<string, readonly LineSpan[]>()

  private readonly loads = new Map<string, Promise<void>>()

  private readonly disposables: vscode.Disposable[] = []

  readonly source: PreviewSource = {
    commented: (file) => this.commented(file),
    failed: (error) => this.log.error('The preview marks failed.', error),
  }

  constructor(
    private readonly service: ReviewService,
    private readonly log: Log,
    asked: RangeAsk,
  ) {
    const stopListening = service.onDidChange(() => {
      this.lines.clear()
      refresh()
    })
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
  }

  private commented(file: string): readonly LineSpan[] | undefined {
    const known = this.lines.get(file)
    if (known === undefined && !this.loads.has(file)) {
      this.loads.set(
        file,
        this.load(file).finally(() => this.loads.delete(file)),
      )
    }
    return known
  }

  private async load(file: string): Promise<void> {
    try {
      const found = await this.service.anchorOf(file)
      const spans =
        found.kind === 'found'
          ? (await this.service.openAt(found.anchor)).flatMap(({ record }) =>
              record.location?.range === undefined
                ? []
                : [{ start: record.location.range.startLine, end: record.location.range.endLine }],
            )
          : []
      this.lines.set(file, spans)
      if (spans.length > 0) refresh()
    } catch (error) {
      this.log.error('The preview could not read the comments.', error)
    }
  }
}
