import assert from 'node:assert/strict'
import path from 'node:path'

import * as vscode from 'vscode'

import type { ReviewComments, Shown } from '../../src/comments/controller'
import type { YreviewApi } from '../../src/extension'

import { until } from './window'

export const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
export const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()
export const reviewComments = async (): Promise<ReviewComments> =>
  (await api()).comments ?? assert.fail('the comment features are off')
// Lines: 0 heading, 2 first paragraph, 4 second paragraph.
export const notes = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', 'notes.md'))
export const textOf = (shown: Shown): string =>
  (shown.thread.comments[0]?.body as vscode.MarkdownString).value
const isNotes = (editor: vscode.TextEditor | undefined): boolean =>
  editor?.document.uri.toString() === notes().toString()

/** The tab of a Markdown view of the notes, and its group. */
export const viewTab = (kind: 'panel' | string) =>
  vscode.window.tabGroups.all
    .flatMap((group) => group.tabs.map((tab) => ({ group, tab })))
    .find(({ tab }) =>
      kind === 'panel'
        ? tab.input instanceof vscode.TabInputWebview &&
          tab.input.viewType.endsWith('markdown.preview')
        : tab.input instanceof vscode.TabInputCustom && tab.input.viewType === kind,
    )

/** The text editor of the notes in a group other than the view. The focused box hides it. */
export const sourceBeside = (kind: string): vscode.TextEditor | undefined =>
  vscode.window.visibleTextEditors.find(
    (editor) => isNotes(editor) && editor.viewColumn !== viewTab(kind)?.group.viewColumn,
  )

/** Waits until the view is the active tab of the active group, so that it has the focus. */
export const focused = async (kind: string): Promise<void> => {
  assert.ok(await until(() => viewTab(kind) !== undefined), `no ${kind} tab`)
  const { group } = viewTab(kind) ?? assert.fail()
  await vscode.commands.executeCommand(
    group.viewColumn === vscode.ViewColumn.One
      ? 'workbench.action.focusFirstEditorGroup'
      : 'workbench.action.focusSecondEditorGroup',
  )
  assert.ok(
    await until(() => {
      const active = vscode.window.tabGroups.activeTabGroup.activeTab
      return active !== undefined && active === viewTab(kind)?.tab
    }),
    `the ${kind} tab has no focus`,
  )
}

/** The view stays the active tab of its group, so the user still sees it. */
export const stillShown = (kind: string): boolean =>
  ((found) => found !== undefined && found.group.activeTab === found.tab)(viewTab(kind))

/** Types into the focused box, saves it, and gives the first and last line of the saved comment. */
export const saveBox = async (text: string): Promise<readonly number[]> => {
  assert.ok(
    await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment'),
    'the comment box did not get the focus',
  )
  await vscode.commands.executeCommand('type', { text })
  await vscode.commands.executeCommand('editor.action.submitComment')
  const comments = await reviewComments()
  assert.ok(
    await until(() => comments.snapshot(notes()).some((shown) => textOf(shown) === text)),
    `the box did not save "${text}"`,
  )
  const saved = comments.snapshot(notes()).find((shown) => textOf(shown) === text)
  return [saved?.range.start.line ?? -1, saved?.range.end.line ?? -1]
}

export const showNotes = async (selection: vscode.Selection): Promise<void> => {
  const editor = await vscode.window.showTextDocument(notes(), {
    viewColumn: vscode.ViewColumn.One,
    preview: false,
  })
  editor.selection = selection
}

/** Deletes the comments of the notes. A resolved thread stays on its line, and a new box there gets no focus. */
export const deleteNotesComments = async (): Promise<void> => {
  const comments = await reviewComments()
  await comments.reload(notes())
  await comments
    .snapshot(notes())
    .reduce<Promise<unknown>>(
      (done, shown) =>
        done.then(() =>
          shown.thread.comments[0] === undefined
            ? undefined
            : comments.deleteComment(shown.thread.comments[0]),
        ),
      Promise.resolve(),
    )
  await vscode.commands.executeCommand('workbench.action.closeAllEditors')
}
