import * as vscode from 'vscode'

import { guard } from '../guard'
import type { Log } from '../log'
import { rangeOfContext } from '../preview/previewLines'
import { readSettings } from '../settings'
import { type Opener, type PreviewHooks, ReviewPreview, VIEW_TYPE } from './previewPanel'
import { stateOf } from './protocol'

/** The Markdown file of the active editor or tab, or undefined. */
const activeMarkdown = (): vscode.Uri | undefined => {
  const editor = vscode.window.activeTextEditor
  if (editor?.document.languageId === 'markdown' && editor.document.uri.scheme === 'file')
    return editor.document.uri
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input
  return input instanceof vscode.TabInputCustom &&
    input.uri.scheme === 'file' &&
    input.uri.path.endsWith('.md')
    ? input.uri
    : undefined
}

const openOutside: Opener = (uri) => vscode.env.openExternal(uri)

/** The review previews of the window, their commands and their restore after a reload. */
export class ReviewPreviews implements vscode.Disposable {
  private readonly shown = new Map<string, ReviewPreview>()

  private current: ReviewPreview | undefined

  private hooks: PreviewHooks | undefined

  private opener: Opener = openOutside

  private readonly disposables: vscode.Disposable[] = []

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly log: Log,
  ) {
    this.disposables.push(
      vscode.commands.registerCommand(
        'yreview.openReviewPreview',
        guard(log, 'Open Review Preview', async (uri?: unknown) => {
          const target = uri instanceof vscode.Uri ? uri : activeMarkdown()
          if (target !== undefined) await this.open(target)
        }),
      ),
      vscode.commands.registerCommand(
        'yreview.addCommentFromReviewPreview',
        guard(log, 'Add Review Comment', async (context?: unknown) => {
          const preview = this.current
          if (preview === undefined) return
          preview.panel.reveal(undefined, false)
          await preview.whenReady()
          await preview.post({
            type: 'openBox',
            lines: rangeOfContext(context),
            shared: readSettings(preview.uri).newComments === 'shared',
          })
        }),
      ),
      vscode.commands.registerCommand(
        'yreview.showReviewPreviewSource',
        guard(log, 'Show Source', async () => {
          await this.current?.showSource()
        }),
      ),
      vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
        deserializeWebviewPanel: async (panel, state) => {
          const found = stateOf(state)
          if (found === undefined) panel.dispose()
          else this.adopt(panel, vscode.Uri.parse(found.uri, true))
        },
      }),
    )
  }

  setHooks(hooks: PreviewHooks): void {
    this.hooks = hooks
  }

  /** Replaces the opener of web and mail links. Tests use it. */
  setOpener(opener: Opener): void {
    this.opener = opener
  }

  active(): ReviewPreview | undefined {
    return this.current
  }

  all(): readonly ReviewPreview[] {
    return [...this.shown.values()]
  }

  /** Shows the review preview of a file beside the active group, and makes one when it has none. */
  async open(uri: vscode.Uri): Promise<ReviewPreview> {
    const known = this.shown.get(uri.toString())
    if (known !== undefined) {
      known.panel.reveal(undefined, false)
      return known
    }
    return this.adopt(
      vscode.window.createWebviewPanel(
        VIEW_TYPE,
        'Review',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        { enableScripts: true, enableFindWidget: true },
      ),
      uri,
    )
  }

  dispose(): void {
    this.all().forEach((preview) => preview.panel.dispose())
    this.disposables.forEach((disposable) => disposable.dispose())
  }

  private adopt(panel: vscode.WebviewPanel, uri: vscode.Uri): ReviewPreview {
    const preview = new ReviewPreview(
      panel,
      uri,
      this.extensionUri,
      this.log,
      () => this.hooks,
      (target) => this.opener(target),
    )
    this.shown.set(uri.toString(), preview)
    if (panel.active) this.current = preview
    panel.onDidChangeViewState((event) => {
      if (event.webviewPanel.active) this.current = preview
    })
    preview.onDidClose(() => {
      if (this.shown.get(uri.toString()) === preview) this.shown.delete(uri.toString())
      if (this.current === preview) this.current = undefined
    })
    return preview
  }
}
