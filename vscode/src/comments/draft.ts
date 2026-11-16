import path from 'node:path'

import * as vscode from 'vscode'

import { guard } from '../guard'
import type { Log } from '../log'

export const DRAFT_SCHEME = 'yreview-draft'
const DISCARD_QUESTION = 'Discard this review comment?'
const DISCARD = 'Discard'
const EMPTY = new Uint8Array()

/** Writes one new comment on a selection of a source file. A failure rejects. */
export type DraftWrite = (
  source: vscode.Uri,
  selection: vscode.Selection,
  text: string,
  shared: boolean,
) => Promise<void>

interface Draft {
  readonly key: string
  readonly source: vscode.Uri
  readonly selection: vscode.Selection
  readonly column: vscode.ViewColumn | undefined
}

const missing = (uri: vscode.Uri): never => {
  throw vscode.FileSystemError.FileNotFound(uri)
}

/** The drafts live only in memory, so a closed draft leaves no file on the disk. */
const memoryFiles = () => {
  const files = new Map<string, { data: Uint8Array; mtime: number }>()
  const changed = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
  return {
    onDidChangeFile: changed.event,
    watch: () => new vscode.Disposable(() => undefined),
    stat: (uri: vscode.Uri): vscode.FileStat => {
      const file = files.get(uri.toString())
      if (file !== undefined)
        return { type: vscode.FileType.File, ctime: 0, mtime: file.mtime, size: file.data.length }
      // A draft path is /<number>/<name>, so a shorter path is a folder.
      return uri.path.split('/').length <= 2
        ? { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 }
        : missing(uri)
    },
    readDirectory: (): [string, vscode.FileType][] => [],
    createDirectory: () => undefined,
    readFile: (uri: vscode.Uri): Uint8Array => files.get(uri.toString())?.data ?? missing(uri),
    writeFile: (uri: vscode.Uri, content: Uint8Array): void => {
      files.set(uri.toString(), { data: content, mtime: Date.now() })
      changed.fire([{ type: vscode.FileChangeType.Changed, uri }])
    },
    delete: (uri: vscode.Uri): void => {
      files.delete(uri.toString())
    },
    rename: (from: vscode.Uri): never => {
      throw vscode.FileSystemError.NoPermissions(from)
    },
    dispose: () => changed.dispose(),
  } satisfies vscode.FileSystemProvider & vscode.Disposable
}

/** A text editor for a new comment, beside its source. One draft for each file and line range. */
export class CommentDrafts implements vscode.Disposable {
  private readonly files = memoryFiles()

  private readonly drafts = new Map<string, Draft>()

  private readonly disposables: vscode.Disposable[]

  private count = 0

  constructor(
    private readonly write: DraftWrite,
    private readonly sharedFirst: (source: vscode.Uri) => boolean,
    private readonly closed: (source: vscode.Uri, selection: vscode.Selection) => void,
    log: Log,
  ) {
    this.disposables = [
      this.files,
      vscode.workspace.registerFileSystemProvider(DRAFT_SCHEME, this.files),
      vscode.workspace.onDidCloseTextDocument(({ uri }) => this.forget(uri)),
      vscode.commands.registerCommand(
        'yreview.draft.save',
        guard(log, 'Save', (uri?: vscode.Uri) => this.save(uri, undefined)),
      ),
      vscode.commands.registerCommand(
        'yreview.draft.saveLocal',
        guard(log, 'Save Local', (uri?: vscode.Uri) => this.save(uri, false)),
      ),
      vscode.commands.registerCommand(
        'yreview.draft.saveShared',
        guard(log, 'Save Shared', (uri?: vscode.Uri) => this.save(uri, true)),
      ),
      vscode.commands.registerCommand(
        'yreview.draft.discard',
        guard(log, 'Discard', (uri?: vscode.Uri) => this.discard(uri)),
      ),
    ]
  }

  /** Opens the draft of the lines beside the source and gives it the focus. */
  async open(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    lines: { readonly start: number; readonly end: number },
  ): Promise<void> {
    const source = editor.document.uri
    const key = `${source.toString()}#${lines.start}-${lines.end}`
    const known = [...this.drafts].find(([, draft]) => draft.key === key)?.[0]
    const uri =
      known === undefined
        ? this.create(source, key, selection, editor.viewColumn, lines)
        : vscode.Uri.parse(known)
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), {
      viewColumn: vscode.ViewColumn.Beside,
      preview: false,
    })
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose())
  }

  // The .md name gives the draft the Markdown language, and the tab shows the file and the lines.
  private create(
    source: vscode.Uri,
    key: string,
    selection: vscode.Selection,
    column: vscode.ViewColumn | undefined,
    lines: { readonly start: number; readonly end: number },
  ): vscode.Uri {
    this.count += 1
    const name = `Comment on ${path.posix.basename(source.path)} lines ${lines.start}-${lines.end}.md`
    const uri = vscode.Uri.from({ scheme: DRAFT_SCHEME, path: `/${this.count}/${name}` })
    this.files.writeFile(uri, EMPTY)
    this.drafts.set(uri.toString(), { key, source, selection, column })
    return uri
  }

  /** Writes the draft text to the lines of its source, then closes the draft. */
  private async save(target: vscode.Uri | undefined, shared: boolean | undefined): Promise<void> {
    const found = this.draftOf(target)
    if (found === undefined) return
    const text = found.document.getText().trim()
    if (text === '') {
      await vscode.window.showWarningMessage('Write the comment text first.')
      return
    }
    const { source, selection } = found.draft
    await this.write(source, selection, text, shared ?? this.sharedFirst(source))
    await this.close(found.document, found.draft)
  }

  /** Closes the draft. A draft with text closes only after the question. */
  private async discard(target: vscode.Uri | undefined): Promise<void> {
    const found = this.draftOf(target)
    if (found === undefined) return
    if (
      found.document.getText().trim() !== '' &&
      (await vscode.window.showWarningMessage(DISCARD_QUESTION, { modal: true }, DISCARD)) !==
        DISCARD
    )
      return
    await this.close(found.document, found.draft)
  }

  private draftOf(target: vscode.Uri | undefined) {
    const document =
      target === undefined
        ? vscode.window.activeTextEditor?.document
        : vscode.workspace.textDocuments.find((open) => open.uri.toString() === target.toString())
    const draft = document === undefined ? undefined : this.drafts.get(document.uri.toString())
    return document === undefined || draft === undefined ? undefined : { document, draft }
  }

  /** The text goes into memory first, so VS Code does not ask to save it when the tab closes. */
  private async close(document: vscode.TextDocument, draft: Draft): Promise<void> {
    if (document.isDirty) await document.save()
    this.forget(document.uri)
    await vscode.window.tabGroups.close(
      vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter(
          (tab) =>
            tab.input instanceof vscode.TabInputText &&
            tab.input.uri.toString() === document.uri.toString(),
        ),
    )
    const editor = await vscode.window.showTextDocument(draft.source, {
      viewColumn: draft.column,
      preview: false,
    })
    editor.selection = draft.selection
    editor.revealRange(draft.selection)
  }

  private forget(uri: vscode.Uri): void {
    const draft = this.drafts.get(uri.toString())
    if (draft === undefined) return
    this.drafts.delete(uri.toString())
    this.files.delete(uri)
    this.closed(draft.source, draft.selection)
  }
}
