import { randomBytes } from 'node:crypto'
import path from 'node:path'

import * as vscode from 'vscode'

import type { Log } from '../log'
import type { LineRange } from '../preview/previewLines'
import { wholeLines } from '../preview/wholeLines'
import { contributionsOf } from './contributions'
import { linkTarget } from './links'
import { DEFAULT_FONT, type PreviewLook, pageHtml } from './page'
import { type FromWebview, type ToWebview, fromWebview } from './protocol'

export const VIEW_TYPE = 'yreview.preview'
const OWN_ID = 'yeskiy.yreview'
const RENDER_DELAY_MS = 200

/** Opens a URI outside VS Code. Tests replace it, so that no test starts a browser. */
export type Opener = (uri: vscode.Uri) => Thenable<boolean>

export interface PreviewHooks {
  readonly onMessage: (preview: ReviewPreview, message: FromWebview) => Promise<boolean>
  readonly onReady: (preview: ReviewPreview) => void
}

const lookOf = (uri: vscode.Uri): PreviewLook => {
  const markdown = vscode.workspace.getConfiguration('markdown.preview', uri)
  const editor = vscode.workspace.getConfiguration('editor', uri)
  return {
    fontFamily: markdown.get<string>('fontFamily', DEFAULT_FONT),
    fontSize: markdown.get<number>('fontSize', 14),
    lineHeight: markdown.get<number>('lineHeight', 1.6),
    scrollBeyondLastLine: editor.get<boolean>('scrollBeyondLastLine', true),
    wordWrap: editor.get<string>('wordWrap', 'off') !== 'off',
    markEditorSelection: markdown.get<boolean>('markEditorSelection', true),
  }
}

/** The workspace folder of the file, or its own folder when it is outside the workspace. */
const homeOf = (uri: vscode.Uri): vscode.Uri =>
  vscode.workspace.getWorkspaceFolder(uri)?.uri ?? vscode.Uri.joinPath(uri, '..')

/** The `markdown.styles` setting: web addresses as they are, other paths from the workspace folder. */
const userStyles = (uri: vscode.Uri): readonly vscode.Uri[] =>
  vscode.workspace
    .getConfiguration('markdown', uri)
    .get<unknown[]>('styles', [])
    .filter((entry): entry is string => typeof entry === 'string' && entry !== '')
    .map((entry) =>
      /^https?:\/\//i.test(entry)
        ? vscode.Uri.parse(entry)
        : vscode.Uri.file(path.resolve(homeOf(uri).fsPath, entry)),
    )

const sameFile = (a: vscode.Uri, b: vscode.Uri): boolean => a.toString() === b.toString()

/** One review preview of one Markdown file. */
export class ReviewPreview implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = []

  private readonly closed = new vscode.EventEmitter<void>()

  readonly onDidClose = this.closed.event

  private timer: NodeJS.Timeout | undefined

  private work: Promise<void> = Promise.resolve()

  /** The document version in the page HTML. A page that loads again after a hide shows it. */
  private pageVersion = -1

  /** Settles when the page script listens. The page drops a message that comes before that. */
  private page = Promise.withResolvers<void>()

  private pageLoaded = false

  /** The number of the last page build, and its HTML. */
  private built = { build: 0, html: '', resends: 0 }

  constructor(
    readonly panel: vscode.WebviewPanel,
    readonly uri: vscode.Uri,
    private readonly extensionUri: vscode.Uri,
    private readonly log: Log,
    private readonly hooks: () => PreviewHooks | undefined,
    private readonly openExternal: Opener,
  ) {
    this.panel.title = `Review ${path.basename(uri.fsPath)}`
    this.disposables.push(
      this.closed,
      panel.onDidDispose(() => this.dispose()),
      // A hidden page unloads, and it loads again when it shows.
      panel.onDidChangeViewState(() => {
        if (!panel.visible) this.reload()
      }),
      panel.webview.onDidReceiveMessage((value: unknown) => this.receive(value)),
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (sameFile(event.document.uri, uri)) this.later()
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('markdown', uri) ||
          event.affectsConfiguration('editor', uri)
        )
          this.queue(() => this.build())
      }),
      vscode.extensions.onDidChange(() => this.queue(() => this.build())),
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => this.follow(event)),
    )
    this.queue(() => this.build())
  }

  post(message: ToWebview): Thenable<boolean> {
    return this.panel.webview.postMessage(message)
  }

  /** Waits until the page script listens for messages. */
  whenReady(): Promise<void> {
    return this.page.promise
  }

  /** The number of the last page build. Tests read it. */
  get lastBuild(): number {
    return this.built.build
  }

  /** Waits for the render and the page build that run now. Tests call it. */
  settled(): Promise<void> {
    return this.work
  }

  dispose(): void {
    clearTimeout(this.timer)
    this.closed.fire()
    this.disposables.forEach((disposable) => disposable.dispose())
  }

  private queue(step: () => Promise<void>): void {
    this.work = this.work
      .then(step)
      .catch((error: unknown) => this.log.error('The review preview failed.', error))
  }

  private later(): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(
      () =>
        this.queue(async () => {
          await this.post({ type: 'content', html: await this.render() })
        }),
      RENDER_DELAY_MS,
    )
  }

  private async render(): Promise<string> {
    return vscode.commands.executeCommand<string>(
      'markdown.api.render',
      await vscode.workspace.openTextDocument(this.uri),
    )
  }

  /** Builds the whole page. A settings or an extension change needs it. A text change does not. */
  private async build(): Promise<void> {
    const { webview } = this.panel
    const found = contributionsOf(
      vscode.extensions.all.map((extension) => ({
        id: extension.id,
        root: extension.extensionUri,
        packageJSON: extension.packageJSON as unknown,
      })),
      OWN_ID,
      (root, relative) => vscode.Uri.joinPath(root, relative),
    )
    const document = await vscode.workspace.openTextDocument(this.uri)
    webview.options = {
      enableScripts: true,
      enableCommandUris: false,
      localResourceRoots: [
        ...found.roots,
        ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri),
        vscode.Uri.joinPath(this.uri, '..'),
        vscode.Uri.joinPath(this.extensionUri, 'dist'),
        vscode.Uri.joinPath(this.extensionUri, 'media'),
      ],
    }
    this.pageVersion = document.version
    this.reload()
    const build = this.built.build + 1
    const html = pageHtml({
      cspSource: webview.cspSource,
      nonce: randomBytes(16).toString('base64'),
      base: webview.asWebviewUri(this.uri).toString(),
      styles: [
        ...found.styles,
        ...userStyles(this.uri),
        vscode.Uri.joinPath(this.extensionUri, 'media', 'reviewPreview.css'),
      ].map((uri) => (uri.scheme === 'file' ? webview.asWebviewUri(uri) : uri).toString()),
      scripts: [
        ...found.scripts,
        { uri: vscode.Uri.joinPath(this.extensionUri, 'dist', 'reviewPreview.js'), module: false },
      ].map((script) => ({
        src: webview.asWebviewUri(script.uri).toString(),
        module: script.module,
      })),
      look: lookOf(this.uri),
      html: await vscode.commands.executeCommand<string>('markdown.api.render', document),
      state: { uri: this.uri.toString(), build },
    })
    this.built = { build, html, resends: 0 }
    webview.html = html
  }

  private follow(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    const [first] = event.visibleRanges
    if (
      first === undefined ||
      !sameFile(event.textEditor.document.uri, this.uri) ||
      !vscode.workspace
        .getConfiguration('markdown.preview', this.uri)
        .get<boolean>('scrollPreviewWithEditor', true)
    )
      return
    this.post({ type: 'scroll', line: first.start.line }).then(undefined, () => undefined)
  }

  /** The column of a visible source editor, else the column beside the preview. */
  sourceColumn(): vscode.ViewColumn {
    return (
      vscode.window.visibleTextEditors.find(
        (editor) =>
          sameFile(editor.document.uri, this.uri) && editor.viewColumn !== this.panel.viewColumn,
      )?.viewColumn ?? vscode.ViewColumn.Beside
    )
  }

  /** Shows the source beside the preview, with the whole lines selected. */
  async showSource(lines?: LineRange): Promise<vscode.TextEditor> {
    const editor = await vscode.window.showTextDocument(this.uri, {
      viewColumn: this.sourceColumn(),
      preserveFocus: false,
    })
    const selection = wholeLines(editor.document, lines)
    if (selection !== undefined) {
      editor.selection = selection
      editor.revealRange(selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
    }
    return editor
  }

  private reload(): void {
    if (!this.pageLoaded) return
    this.pageLoaded = false
    this.page = Promise.withResolvers<void>()
  }

  private receive(value: unknown): void {
    const message = fromWebview(value)
    if (message === undefined) {
      this.log.warn('The review preview sent a message that Yreview does not know.')
      return
    }
    this.handle(message).catch((error: unknown) =>
      this.log.error('The review preview message failed.', error),
    )
  }

  private async handle(message: FromWebview): Promise<void> {
    if ((await this.hooks()?.onMessage(this, message)) === true) return
    if (message.type === 'ready') await this.ready(message.build)
    if (message.type === 'showSource')
      await this.showSource({ start: message.line, end: message.line })
    if (message.type === 'openLink') await this.openLink(message.href)
  }

  /** A page that loads again after a hide has the HTML of the last build, so it gets the text now. */
  private async ready(build?: number): Promise<void> {
    // The webview can keep a page whose HTML came before the last build. The same HTML is not set again.
    if (build !== undefined && build !== this.built.build) {
      if (this.built.build === 0) return
      this.built = { ...this.built, resends: this.built.resends + 1 }
      this.panel.webview.html = `${this.built.html}<!-- ${this.built.resends} -->`
      return
    }
    this.pageLoaded = true
    this.page.resolve()
    if ((await vscode.workspace.openTextDocument(this.uri)).version !== this.pageVersion)
      await this.post({ type: 'content', html: await this.render() })
    this.hooks()?.onReady(this)
    const line = vscode.window.visibleTextEditors.find((shown) =>
      sameFile(shown.document.uri, this.uri),
    )?.visibleRanges[0]?.start.line
    if (line !== undefined) await this.post({ type: 'scroll', line })
  }

  private async openLink(href: string): Promise<void> {
    const target = linkTarget(
      href,
      this.uri.fsPath,
      vscode.workspace.getWorkspaceFolder(this.uri)?.uri.fsPath,
    )
    if (target?.kind === 'external') await this.openExternal(vscode.Uri.parse(target.uri))
    if (target?.kind === 'file')
      await vscode.window.showTextDocument(vscode.Uri.file(target.path), {
        viewColumn: this.sourceColumn(),
      })
  }
}
