import { stat } from 'node:fs/promises'
import path from 'node:path'

import * as vscode from 'vscode'

import { containedPath } from '../core/paths'
import { guard } from '../guard'
import type { Log } from '../log'
import type { ReviewService } from '../store/reviewService'
import { parseCommentLink } from './commentLink'
import type { LineSpan, PreviewSource } from './markdownPlugin'

const NOT_OURS = 'Yreview cannot open this link. It names no file of an open workspace folder.'

const refresh = (): void => {
  // The command exists only while the Markdown extension runs. Without it, no preview is open.
  vscode.commands.executeCommand('markdown.preview.refresh').then(undefined, () => undefined)
}

const fromPreview = async (): Promise<void> => {
  await vscode.commands.executeCommand('markdown.showSource')
  await vscode.commands.executeCommand('yreview.addComment')
}

/** The real path of a file under an open workspace folder, else undefined (invariant S4). */
const contained = async (file: string): Promise<string | undefined> => {
  if (!path.isAbsolute(file)) return undefined
  const real = (
    await Promise.all(
      (vscode.workspace.workspaceFolders ?? []).map((folder) =>
        containedPath(
          folder.uri.fsPath,
          path.relative(folder.uri.fsPath, file).replaceAll('\\', '/'),
        ),
      ),
    )
  ).find((candidate) => candidate !== undefined)
  return real !== undefined && (await stat(real).catch(() => undefined))?.isFile() === true
    ? real
    : undefined
}

/** Opens the line of a comment link and starts an empty thread. It never writes. */
const open = async (uri: vscode.Uri): Promise<void> => {
  const target = parseCommentLink(uri.path, uri.query)
  const file = target === undefined ? undefined : await contained(target.file)
  if (target === undefined || file === undefined) {
    vscode.window.showWarningMessage(NOT_OURS)
    return
  }
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file))
  const line = Math.min(target.line, document.lineCount) - 1
  await vscode.window.showTextDocument(document, {
    selection: new vscode.Range(line, 0, line, 0),
    preview: false,
  })
  await vscode.commands.executeCommand('yreview.addComment')
}

/** The comment ranges of the files in the preview, the comment links, and the preview button. */
export class PreviewHost implements vscode.Disposable, vscode.UriHandler {
  private readonly lines = new Map<string, readonly LineSpan[]>()

  private readonly loads = new Map<string, Promise<void>>()

  private readonly disposables: vscode.Disposable[] = []

  readonly source: PreviewSource = {
    scheme: () => vscode.env.uriScheme,
    commented: (file) => this.commented(file),
    failed: (error) => this.log.error('The preview comment links failed.', error),
  }

  constructor(
    private readonly service: ReviewService,
    private readonly log: Log,
  ) {
    const stopListening = service.onDidChange(() => {
      this.lines.clear()
      refresh()
    })
    this.disposables.push(
      { dispose: stopListening },
      vscode.window.registerUriHandler(this),
      vscode.commands.registerCommand(
        'yreview.addCommentFromPreview',
        guard(log, 'Add Review Comment', fromPreview),
      ),
    )
  }

  async handleUri(uri: vscode.Uri): Promise<void> {
    await guard(this.log, 'Open the comment link', () => open(uri))()
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
