import * as vscode from 'vscode'

import { WORKTREE, slashPath } from '../core/anchor'
import { containedPath, realOf } from '../core/paths'
import { gitAuthor } from '../git/author'
import { NotesGateway } from '../git/notes'
import { hasFile } from '../git/revision'
import { ProcessGitRunner, isOk } from '../git/runner'
import { type ToolHost, type ToolStore, inWorkspace } from '../mcp/reviewTools'
import { readSettings } from '../settings'
import { CommentBook } from '../store/commentBook'
import type { ReviewService } from '../store/reviewService'

const headOf = async (git: ProcessGitRunner): Promise<string | undefined> => {
  const result = await git.run(['rev-parse', '-q', '--verify', 'HEAD^{commit}'])
  return isOk(result) ? result.stdout.trim() : undefined
}

const lineRange = (line: number): vscode.Range =>
  new vscode.Range(Math.max(line - 1, 0), 0, Math.max(line - 1, 0), 0)

const fileFolders = (): readonly string[] =>
  (vscode.workspace.workspaceFolders ?? [])
    .filter((folder) => folder.uri.scheme === 'file')
    .map((folder) => folder.uri.fsPath)

const realFolders = (): Promise<readonly string[]> =>
  Promise.all(fileFolders().map(async (folder) => slashPath(await realOf(folder))))

/** The editor side of the review tools. A book writes a resolve record, so it gets the git author. */
export const toolHost = (service: ReviewService, gitPath: string): ToolHost => ({
  stores: async () => [
    ...(await Promise.all(
      inWorkspace(service.knownRoots(), await realFolders()).map(
        async (root): Promise<ToolStore> => {
          const git = new ProcessGitRunner(root, gitPath)
          return {
            root,
            kind: 'git',
            head: await headOf(git),
            book: new CommentBook(new NotesGateway(git), () => gitAuthor(git)),
          }
        },
      ),
    )),
    ...(await service.folderStores(false)).map(({ root, store }): ToolStore => ({
      root,
      kind: 'folder',
      head: WORKTREE,
      book: new CommentBook(store, () => gitAuthor(new ProcessGitRunner(root, gitPath))),
    })),
  ],
  folders: fileFolders,
  workspaceRoots: async () => inWorkspace(service.knownRoots(), await realFolders()),
  containedPath,
  anchorOf: (filePath) => service.anchorOf(filePath),
  addComment: (anchor, range, text, shared) => service.addComment(anchor, range, text, shared),
  shareByDefault: (root) => readSettings(vscode.Uri.file(root)).newComments === 'shared',
  changed: () => service.notifyChanged(),
  showFile: async (file, line) => {
    await vscode.window.showTextDocument(vscode.Uri.file(file), { selection: lineRange(line) })
  },
  showDiff: async (root, path, revision, line) => {
    const file = await containedPath(root, path)
    if (file === undefined) return false
    const found = await hasFile(new ProcessGitRunner(root, gitPath), revision, path).catch(
      () => false,
    )
    if (!found) return false
    const right = vscode.Uri.file(file)
    await vscode.commands.executeCommand(
      'vscode.diff',
      right.with({ scheme: 'git', query: JSON.stringify({ path: file, ref: revision }) }),
      right,
      `${path} (${revision.slice(0, 12)}, the comment) and the working tree`,
      { selection: lineRange(line) },
    )
    return true
  },
})
