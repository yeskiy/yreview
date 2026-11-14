import * as vscode from 'vscode'

import { commentAround, syntaxOf } from '../core/commentSyntax'
import { containedPath } from '../core/paths'
import { type TextCut, apartCuts, rowCut } from '../core/todoCut'
import type { ReviewTask } from '../tasks/reviewTask'
import { checkKey } from '../tasks/taskChecks'
import { firstLine } from '../tasks/taskLabels'
import {
  type TodoReport,
  lockedMessage,
  noCommentMessage,
  placeOf,
  sharedMessage,
} from '../tasks/taskRemoval'

type Lookup =
  | { readonly kind: 'found'; readonly document: vscode.TextDocument; readonly cut: TextCut }
  | { readonly kind: 'gone' | 'shared' | 'noComment' }

const GONE: Lookup = { kind: 'gone' }

/** The row holds one line. The line must still hold the text of the row, inside a comment. */
const lookup = (document: vscode.TextDocument, task: ReviewTask): Lookup => {
  const index = task.startLine - 1
  if (index < 0 || index >= document.lineCount) return GONE
  const line = document.lineAt(index)
  const column = firstLine(task.text) === '' ? -1 : line.text.indexOf(firstLine(task.text))
  if (column < 0) return GONE
  const text = document.getText()
  const comment = commentAround(
    text,
    document.offsetAt(new vscode.Position(index, column)),
    syntaxOf(document.languageId),
  )
  if (comment === undefined) return { kind: 'noComment' }
  const cut = rowCut(
    text,
    comment.start,
    comment.end,
    document.offsetAt(line.range.start),
    document.offsetAt(line.range.end),
  )
  return cut === undefined ? { kind: 'shared' } : { kind: 'found', document, cut }
}

/** The document of a task, or undefined when its path leaves the root or the file is gone. */
const documentOf = async (task: ReviewTask): Promise<vscode.TextDocument | undefined> => {
  const file = await containedPath(task.rootPath, task.path)
  return file === undefined
    ? undefined
    : vscode.workspace.openTextDocument(vscode.Uri.file(file)).then(
        (document) => document,
        () => undefined,
      )
}

const nameOf = (uri: vscode.Uri): string => uri.path.slice(uri.path.lastIndexOf('/') + 1)

/** Removes the TODO rows with one WorkspaceEdit. The files stay unsaved, and an undo puts the text back. */
export const deleteTodos = async (tasks: readonly ReviewTask[]): Promise<TodoReport> => {
  const todos = [
    ...new Map(
      tasks.filter((task) => task.kind === 'todo').map((task) => [checkKey(task), task] as const),
    ).values(),
  ]
  const found = await Promise.all(
    todos.map(async (task) => {
      const document = await documentOf(task)
      return { task, hit: document === undefined ? GONE : lookup(document, task) }
    }),
  )
  const edits = found.flatMap(({ hit }) => (hit.kind === 'found' ? [hit] : []))
  const documents = [
    ...new Map(edits.map((hit) => [hit.document.uri.toString(), hit.document] as const)).values(),
  ]
  const edit = new vscode.WorkspaceEdit()
  documents.forEach((document) =>
    apartCuts(
      edits
        .filter((hit) => hit.document.uri.toString() === document.uri.toString())
        .map((hit) => hit.cut),
    ).forEach((cut) =>
      edit.delete(
        document.uri,
        new vscode.Range(document.positionAt(cut.start), document.positionAt(cut.end)),
      ),
    ),
  )
  const applied = edits.length === 0 || (await vscode.workspace.applyEdit(edit))
  const places = (kind: Lookup['kind']): readonly string[] =>
    found.filter(({ hit }) => hit.kind === kind).map(({ task }) => placeOf(task))
  return {
    removed: applied ? edits.length : 0,
    missing: places('gone'),
    problems: [
      applied ? undefined : lockedMessage(documents.map((document) => nameOf(document.uri))),
      places('shared').length === 0 ? undefined : sharedMessage(places('shared')),
      places('noComment').length === 0 ? undefined : noCommentMessage(places('noComment')),
    ].filter((part) => part !== undefined),
  }
}
