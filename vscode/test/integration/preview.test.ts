import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import type { ReviewComments, Shown } from '../../src/comments/controller'
import type { YreviewApi } from '../../src/extension'
import type { PreviewHost } from '../../src/preview/previewHost'

import { clickAt, evaluate, pressKey, targets, workbench } from './keymap/devtools'
import { focusWindow, until } from './window'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' })
const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()
const preview = async (): Promise<PreviewHost> =>
  (await api()).preview ?? assert.fail('the preview is off')
const reviewComments = async (): Promise<ReviewComments> =>
  (await api()).comments ?? assert.fail('the comment features are off')
// Lines: 0 heading, 2 first paragraph, 4 second paragraph.
const notes = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', 'notes.md'))
const render = async (): Promise<string> =>
  vscode.commands.executeCommand<string>(
    'markdown.api.render',
    await vscode.workspace.openTextDocument(notes()),
  )
const textOf = (shown: Shown): string =>
  (shown.thread.comments[0]?.body as vscode.MarkdownString).value
const isNotes = (editor: vscode.TextEditor | undefined): boolean =>
  editor?.document.uri.toString() === notes().toString()

/** The tab of a Markdown view of the notes, and its group. */
const viewTab = (kind: 'panel' | string) =>
  vscode.window.tabGroups.all
    .flatMap((group) => group.tabs.map((tab) => ({ group, tab })))
    .find(({ tab }) =>
      kind === 'panel'
        ? tab.input instanceof vscode.TabInputWebview &&
          tab.input.viewType.endsWith('markdown.preview')
        : tab.input instanceof vscode.TabInputCustom && tab.input.viewType === kind,
    )

/** The text editor of the notes in a group other than the view. The focused box hides it. */
const sourceBeside = (kind: string): vscode.TextEditor | undefined =>
  vscode.window.visibleTextEditors.find(
    (editor) => isNotes(editor) && editor.viewColumn !== viewTab(kind)?.group.viewColumn,
  )

/** Waits until the view is the active tab of the active group, so that it has the focus. */
const focused = async (kind: string): Promise<void> => {
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
const stillShown = (kind: string): boolean =>
  ((found) => found !== undefined && found.group.activeTab === found.tab)(viewTab(kind))

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

/** Runs a script in the content document `doc` of the preview webview, and gives its value. */
const inPreview = async (body: string): Promise<unknown> => {
  const script = `(async () => {
    const doc = document.getElementById('active-frame')?.contentDocument
    if (!doc?.querySelector('[data-line]')) return { missing: true }
    ${body}
  })()`
  const frames = (await targets()).filter((target) => target.type === 'iframe')
  const values = await Promise.all(frames.map((frame) => evaluate(frame, script)))
  return values.find((value) => (value as { missing?: boolean } | null)?.missing !== true)
}

/** Selects the preview text from the start of the paragraph of `first` to `offset` in `last`. */
const selectInPreview = (first: number, last: number, offset: number): Promise<unknown> =>
  inPreview(`
    const block = (line) => doc.querySelector('[data-line="' + line + '"]').firstChild
    const range = doc.createRange()
    range.setStart(block(${first}), 0)
    range.setEnd(block(${last}), ${offset})
    doc.getSelection().removeAllRanges()
    doc.getSelection().addRange(range)
    return doc.getSelection().toString()`)

/** Presses the real add key: Ctrl+Alt+G, or Cmd+Alt+G on macOS. */
const pressAddKey = (): Promise<void> =>
  pressKey({
    key: 'g',
    code: 'KeyG',
    windowsVirtualKeyCode: 71,
    nativeVirtualKeyCode: 71,
    // The DevTools modifier bits are 1 for Alt, 2 for Ctrl, and 4 for Meta.
    modifiers: process.platform === 'darwin' ? 5 : 3,
  })

/** Right-clicks the preview block of a source line with a real mouse. */
const rightClickInPreview = async (line: number): Promise<void> => {
  const inner = (await inPreview(`
    const rect = doc.querySelector('[data-line="${line}"]').getBoundingClientRect()
    return { x: rect.left + 5, y: rect.top + rect.height / 2 }`)) as { x: number; y: number }
  const frame = (await evaluate(
    await workbench(),
    `(() => {
      const rect = [...document.querySelectorAll('iframe.webview')]
        .map((node) => node.getBoundingClientRect())
        .find((box) => box.width > 0)
      return rect === undefined ? null : { x: rect.left, y: rect.top }
    })()`,
  )) as { x: number; y: number } | null
  const { x, y } = frame ?? assert.fail('no visible webview')
  await clickAt(x + inner.x, y + inner.y, 'right')
}

const keyOf = (key: string, code: number) => ({
  key,
  code: key,
  windowsVirtualKeyCode: code,
  nativeVirtualKeyCode: code,
})

/** Selects the item of the open context menu that has this label, with the arrow keys and Enter. */
const chooseMenuItem = async (label: string): Promise<void> => {
  // A mouse click on a menu item leaves a press in the page that takes the focus of later tests.
  const labels = `[...document.querySelectorAll('.monaco-menu .action-label')].map((n) => n.textContent)`
  const focusedLabel = `document.querySelector('.monaco-menu .action-item.focused .action-label')?.textContent ?? null`
  const page = await workbench()
  const shown = async (tries: number): Promise<boolean> =>
    ((await evaluate(page, labels)) as string[]).includes(label) ||
    (tries > 0 && wait(250).then(() => shown(tries - 1)))
  assert.ok(await shown(20), `no menu item "${label}"`)
  const focus = async (tries: number): Promise<boolean> => {
    await pressKey(keyOf('ArrowUp', 38))
    return (await evaluate(page, focusedLabel)) === label || (tries > 0 && focus(tries - 1))
  }
  assert.ok(await focus(12), `the keys did not reach the menu item "${label}"`)
  await pressKey(keyOf('Enter', 13))
}

/** The rich Markdown editor ships with VS Code 1.146 and later. */
const hasRichEditor = (): boolean =>
  (
    (
      vscode.extensions.getExtension('vscode.markdown-language-features')?.packageJSON as
        { contributes?: { customEditors?: { viewType: string }[] } } | undefined
    )?.contributes?.customEditors ?? []
  ).some((editor) => editor.viewType === 'vscode.markdown.editor')

/** Types into the focused box, saves it, and gives the first and last line of the saved comment. */
const saveBox = async (text: string): Promise<readonly number[]> => {
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

const showNotes = async (selection: vscode.Selection): Promise<void> => {
  const editor = await vscode.window.showTextDocument(notes(), {
    viewColumn: vscode.ViewColumn.One,
    preview: false,
  })
  editor.selection = selection
}

describe('comments from the Markdown preview', () => {
  beforeEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await focusWindow()
  })

  // A resolved thread stays on its line, and a box on that line then gets no focus, so this deletes.
  afterEach(async () => {
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
  })

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
      assert.ok(
        await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment'),
        'the comment box did not get the focus',
      )
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

  // TODO: remove the skip once the add key in the preview gets the lines of the preview selection.
  it.skip('comments on the preview selection with the add key', async () => {
    await showNotes(new vscode.Selection(0, 0, 0, 0))
    await vscode.commands.executeCommand('markdown.showPreviewToSide', notes())
    await focused('panel')
    await wait(1000)
    assert.equal(await selectInPreview(2, 4, 6), 'First paragraph.\n\nSecond')
    await pressAddKey()
    assert.ok(
      await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment'),
      'the comment box did not get the focus',
    )
    assert.ok(
      sourceBeside('panel')?.selection.isEqual(new vscode.Selection(2, 0, 4, 17)),
      'the source is not on the selected lines',
    )
  })

  it('comments on the preview selection from a real right-click', async () => {
    await showNotes(new vscode.Selection(0, 0, 0, 0))
    await vscode.commands.executeCommand('markdown.showPreviewToSide', notes())
    await focused('panel')
    await wait(1000)
    assert.equal(await selectInPreview(2, 4, 6), 'First paragraph.\n\nSecond')
    await rightClickInPreview(2)
    await chooseMenuItem('Add Review Comment')
    assert.ok(
      await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment'),
      'the comment box did not get the focus',
    )
    assert.ok(
      sourceBeside('panel')?.selection.isEqual(new vscode.Selection(2, 0, 4, 17)),
      'the source is not on the selected lines',
    )
    assert.ok(stillShown('panel'), 'the preview left the view')
    assert.deepEqual(await saveBox('On the preview selection.'), [2, 4])
  })

  // TODO: remove the skip once a second box on a line with a comment gets the focus.
  it.skip('opens a second box on the same preview selection', async () => {
    await showNotes(new vscode.Selection(0, 0, 0, 0))
    await vscode.commands.executeCommand('markdown.showPreviewToSide', notes())
    const addOnSelection = async (text: string): Promise<readonly number[]> => {
      await focused('panel')
      await wait(1000)
      await selectInPreview(2, 4, 6)
      await rightClickInPreview(2)
      await chooseMenuItem('Add Review Comment')
      return saveBox(text)
    }
    assert.deepEqual(await addOnSelection('The first comment.'), [2, 4])
    assert.deepEqual(await addOnSelection('The second comment.'), [2, 4])
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
    await vscode.commands.executeCommand('yreview.addCommentFromPreview')
    assert.ok(
      await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment'),
      'the comment box did not get the focus',
    )
    assert.ok(
      sourceBeside('vscode.markdown.editor')?.selection.isEqual(new vscode.Selection(2, 0, 4, 17)),
      'no source beside the rich editor, or not on its selection',
    )
    assert.ok(stillShown('vscode.markdown.editor'), 'the rich editor left the view')
    assert.deepEqual(await saveBox('From the rich editor.'), [2, 4])
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
