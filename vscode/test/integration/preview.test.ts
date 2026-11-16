import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import type { PreviewHost } from '../../src/preview/previewHost'

import {
  api,
  deleteNotesComments,
  focused,
  notes,
  reviewComments,
  saveBox,
  showNotes,
  sourceBeside,
  stillShown,
  textOf,
  workspace,
} from './previewKit'
import { focusWindow, until } from './window'

const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' })
const preview = async (): Promise<PreviewHost> =>
  (await api()).preview ?? assert.fail('the preview is off')
const render = async (): Promise<string> =>
  vscode.commands.executeCommand<string>(
    'markdown.api.render',
    await vscode.workspace.openTextDocument(notes()),
  )

/** Counts each external open. The test shares the vscode module of the extension. */
const spyExternal = () => {
  const calls: string[] = []
  const original = vscode.env.openExternal
  Object.defineProperty(vscode.env, 'openExternal', {
    configurable: true,
    value: async (target: vscode.Uri) => {
      calls.push(target.toString())
      return false
    },
  })
  return {
    calls,
    stop: () => Object.defineProperty(vscode.env, 'openExternal', { value: original }),
  }
}

/** Types into the focused box. The text stays out of the file only while the box has the focus. */
const boxHasFocus = async (): Promise<boolean> => {
  await vscode.commands.executeCommand('type', { text: 'y' })
  const document = await vscode.workspace.openTextDocument(notes())
  const dirty = document.isDirty
  if (dirty) {
    await vscode.window.showTextDocument(document)
    await vscode.commands.executeCommand('workbench.action.files.revert')
  } else await vscode.commands.executeCommand('undo')
  await vscode.commands.executeCommand('yreview.closeBox')
  return !dirty
}

/** The rich Markdown editor ships with VS Code 1.146 and later. */
const hasRichEditor = (): boolean =>
  (
    (
      vscode.extensions.getExtension('vscode.markdown-language-features')?.packageJSON as
        { contributes?: { customEditors?: { viewType: string }[] } } | undefined
    )?.contributes?.customEditors ?? []
  ).some((editor) => editor.viewType === 'vscode.markdown.editor')

/** The changes of the active group and the active text editor in this test, with their times in ms. */
const timeline = { start: Date.now(), events: [] as string[] }
const note = (event: string): void => {
  timeline.events.push(`${Date.now() - timeline.start} ${event}`)
}
const watchers = [
  vscode.window.tabGroups.onDidChangeTabGroups(() =>
    note(`group ${vscode.window.tabGroups.activeTabGroup.viewColumn}`),
  ),
  vscode.window.onDidChangeActiveTextEditor((editor) =>
    note(`editor ${editor?.document.uri.scheme ?? 'none'} ${editor?.viewColumn ?? ''}`),
  ),
]

/** Where the focus is, for the message of a failed focus check. */
const focusState = (): string =>
  JSON.stringify({
    timeline: timeline.events,
    group: vscode.window.tabGroups.activeTabGroup.viewColumn,
    tabs: vscode.window.tabGroups.all.map((group) =>
      group.tabs.map(
        ({ input, isActive }) =>
          `${isActive ? '*' : ''}${(input as { viewType?: string } | undefined)?.viewType ?? (input instanceof vscode.TabInputText ? 'text' : 'other')}`,
      ),
    ),
    editor: vscode.window.activeTextEditor?.document.uri.toString(),
  })

describe('comments from the Markdown preview', () => {
  beforeEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await focusWindow()
    Object.assign(timeline, { start: Date.now(), events: [] })
  })

  after(() => watchers.forEach((watcher) => watcher.dispose()))

  afterEach(deleteNotesComments)

  it('renders no comment link and no app address into the preview', async () => {
    const html = await render()
    assert.doesNotMatch(html, /yreview-add|yeskiy\.yreview|vscode:\/\//)
    assert.equal('handleUri' in (await preview()), false)
  })

  it('comments on the preview lines of the context menu, in the source beside the preview', async () => {
    await showNotes(new vscode.Selection(0, 0, 0, 0))
    await vscode.commands.executeCommand('markdown.showPreviewToSide', notes())
    await focused('panel')
    // A new webview takes the keyboard focus late, and no event tells when. A real menu comes after it.
    await wait(1000)
    const external = spyExternal()
    try {
      // The webview context menu gives the JSON of data-vscode-context, here the lines 4 and 5.
      await vscode.commands.executeCommand('yreview.addCommentFromPreview', {
        webview: 'markdown.preview',
        yreviewStart: 4,
        yreviewEnd: 5,
      })
      if (!(await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment')))
        assert.fail(`the comment box did not get the focus: ${focusState()}`)
      const editor = sourceBeside('panel')
      assert.ok(editor?.selection.isEqual(new vscode.Selection(4, 0, 4, 17)), 'the selection')
      assert.ok(stillShown('panel'), 'the preview left the view')
      await vscode.commands.executeCommand('type', { text: 'From the preview.' })
      await vscode.commands.executeCommand('editor.action.submitComment')
      const comments = await reviewComments()
      assert.ok(
        await until(() =>
          comments.snapshot(notes()).some((shown) => textOf(shown) === 'From the preview.'),
        ),
        'the box did not save the comment',
      )
      const saved = comments
        .snapshot(notes())
        .find((shown) => textOf(shown) === 'From the preview.')
      assert.deepEqual([saved?.range.start.line, saved?.range.end.line], [4, 4])
      assert.equal(editor?.document.isDirty, false)
      assert.deepEqual(external.calls, [])
    } finally {
      external.stop()
    }
  })

  it('opens the source beside a preview in the same group, at the caret of the source', async () => {
    await showNotes(new vscode.Selection(2, 0, 2, 5))
    await vscode.commands.executeCommand('markdown.showPreview', notes())
    await focused('panel')
    const external = spyExternal()
    try {
      await vscode.commands.executeCommand('yreview.addCommentFromPreview')
      await wait(1500)
      assert.ok(
        sourceBeside('panel')?.selection.isEqual(new vscode.Selection(2, 0, 2, 5)),
        'no source beside the preview, or the caret moved',
      )
      assert.ok(stillShown('panel'), 'the preview left the view')
      assert.ok(await boxHasFocus(), 'the comment box did not get the focus')
      assert.deepEqual(external.calls, [])
    } finally {
      external.stop()
    }
  })

  it('opens the source beside the preview editor of the tab', async () => {
    await vscode.commands.executeCommand(
      'vscode.openWith',
      notes(),
      'vscode.markdown.preview.editor',
    )
    await focused('vscode.markdown.preview.editor')
    await vscode.commands.executeCommand('yreview.addCommentFromPreview', {
      webview: 'vscode.markdown.preview.editor',
      yreviewStart: 2,
      yreviewEnd: 3,
    })
    await wait(1500)
    assert.ok(
      sourceBeside('vscode.markdown.preview.editor')?.selection.isEqual(
        new vscode.Selection(2, 0, 2, 16),
      ),
      'no source beside the preview, or not on the lines of the menu',
    )
    assert.ok(stillShown('vscode.markdown.preview.editor'), 'the preview left the view')
    assert.ok(await boxHasFocus(), 'the comment box did not get the focus')
  })

  it('opens the source beside the rich Markdown editor', async function richEditor() {
    if (!hasRichEditor()) this.skip()
    await vscode.commands.executeCommand('vscode.openWith', notes(), 'vscode.markdown.editor')
    await focused('vscode.markdown.editor')
    await vscode.commands.executeCommand('yreview.addCommentFromPreview')
    await wait(1500)
    assert.ok(sourceBeside('vscode.markdown.editor'), 'no source beside the rich editor')
    assert.ok(stillShown('vscode.markdown.editor'), 'the rich editor left the view')
    assert.ok(await boxHasFocus(), 'the comment box did not get the focus')
  })

  it('comments on the selection of the rich Markdown editor', async function richSelection() {
    if (!hasRichEditor()) this.skip()
    await vscode.commands.executeCommand('vscode.openWith', notes(), 'vscode.markdown.editor')
    await focused('vscode.markdown.editor')
    await wait(1000)
    await [
      'markdown.editor.cursorDocumentStart',
      'markdown.editor.cursorDown',
      'markdown.editor.cursorDownSelect',
      'markdown.editor.cursorLogicalLineEndSelect',
    ].reduce<Promise<unknown>>(
      (done, command) => done.then(() => vscode.commands.executeCommand(command)),
      Promise.resolve(),
    )
    note('add')
    await vscode.commands.executeCommand('yreview.addCommentFromPreview')
    note('added')
    if (!(await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment')))
      assert.fail(`the comment box did not get the focus: ${focusState()}`)
    assert.ok(
      sourceBeside('vscode.markdown.editor')?.selection.isEqual(new vscode.Selection(2, 0, 4, 17)),
      'no source beside the rich editor, or not on its selection',
    )
    assert.ok(stillShown('vscode.markdown.editor'), 'the rich editor left the view')
    assert.deepEqual(await saveBox('From the rich editor.'), [2, 4])
  })

  it('selects the whole heading line for words of the rich Markdown editor', async function richHeading() {
    if (!hasRichEditor()) this.skip()
    await vscode.commands.executeCommand('vscode.openWith', notes(), 'vscode.markdown.editor')
    await focused('vscode.markdown.editor')
    await wait(1000)
    await vscode.commands.executeCommand('markdown.editor.cursorDocumentStart')
    await vscode.commands.executeCommand('markdown.editor.cursorWordRightSelect')
    note('add')
    await vscode.commands.executeCommand('yreview.addCommentFromPreview')
    note('added')
    if (!(await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment')))
      assert.fail(`the comment box did not get the focus: ${focusState()}`)
    const selection = sourceBeside('vscode.markdown.editor')?.selection
    assert.ok(
      selection?.isEqual(new vscode.Selection(0, 0, 0, 7)),
      `the source does not select all of "# Notes": ${JSON.stringify(selection)}`,
    )
    assert.deepEqual(await saveBox('On the heading.'), [0, 0])
  })

  it('comments on the selected lines of the text editor', async () => {
    await showNotes(new vscode.Selection(2, 0, 4, 6))
    await vscode.commands.executeCommand('yreview.addComment')
    assert.deepEqual(await saveBox('On the selection.'), [2, 4])
  })

  // TODO: remove the skip once a second box on a line with a comment gets the focus.
  it.skip('opens a second box on the lines of a comment, in the text editor', async () => {
    await showNotes(new vscode.Selection(2, 0, 4, 6))
    await vscode.commands.executeCommand('yreview.addComment')
    assert.deepEqual(await saveBox('The first comment.'), [2, 4])
    await showNotes(new vscode.Selection(2, 0, 4, 6))
    await vscode.commands.executeCommand('yreview.addComment')
    assert.deepEqual(await saveBox('The second comment.'), [2, 4])
  })

  it('marks the block of an open comment', async () => {
    const controller = vscode.comments.createCommentController('yreview-preview-test', 'Test')
    await vscode.commands.executeCommand('yreview.saveLocal', {
      thread: controller.createCommentThread(notes(), new vscode.Range(2, 0, 2, 0), []),
      text: 'Check this paragraph.',
    })
    controller.dispose()
    await render()
    await (await preview()).settled()
    assert.match(await render(), /yreview-commented/)
  })

  it('moves the mark of a drawn preview to the mapped lines when HEAD moves', async () => {
    const start = git('rev-parse', 'HEAD').trim()
    const controller = vscode.comments.createCommentController('yreview-preview-test', 'Test')
    await vscode.commands.executeCommand('yreview.saveLocal', {
      thread: controller.createCommentThread(notes(), new vscode.Range(4, 0, 4, 0), []),
      text: 'Check the second paragraph.',
    })
    controller.dispose()
    const marks = async (): Promise<readonly number[]> => {
      await render()
      await (await preview()).settled()
      return [...(await render()).matchAll(/<p[^>]*>/gu)]
        .filter(([tag]) => tag.includes('yreview-commented'))
        .map(([tag]) => Number(/data-line="(\d+)"/u.exec(tag)?.[1]))
    }
    const marksAt = async (lines: readonly number[], tries: number): Promise<boolean> =>
      JSON.stringify(await marks()) === JSON.stringify(lines) ||
      (tries > 0 && wait(250).then(() => marksAt(lines, tries - 1)))
    const shifted = '# Notes\n\nTop paragraph.\n\nFirst paragraph.\n\nSecond paragraph.\n'
    try {
      assert.deepEqual(await marks(), [4], 'the preview did not mark the comment before the commit')
      writeFileSync(notes().fsPath, shifted)
      git('commit', '-q', '-am', 'add a paragraph above the comment')
      const document = await vscode.workspace.openTextDocument(notes())
      assert.ok(
        await until(() => document.getText().replaceAll('\r', '') === shifted),
        'the document did not reload',
      )
      assert.ok(await marksAt([6], 40), 'the mark did not move to the new line of the comment')
    } finally {
      const commits = git('rev-list', `${start}..HEAD`)
        .split('\n')
        .filter((line) => line !== '')
      git('reset', '-q', '--hard', start)
      git('notes', '--ref', 'refs/notes/y-review/local', 'remove', '--ignore-missing', ...commits)
      await (await reviewComments()).reload(notes())
    }
  })
})
