import assert from 'node:assert/strict'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import { clickAt, evaluate, pressKey, targets, workbench } from '../keymap/devtools'
import {
  deleteNotesComments,
  focused,
  notes,
  saveBox,
  showNotes,
  sourceBeside,
  stillShown,
} from '../previewKit'
import { focusWorkbench, untilKeyboardIn, webviewOrigin } from '../webviewFrames'
import { until } from '../window'

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

/** The point of the preview heading, once the page shows the rendered text. */
const headingPoint = async (tries = 40): Promise<{ x: number; y: number }> =>
  ((await inPreview(`
    const rect = doc.querySelector('[data-line="0"]').getBoundingClientRect()
    return { x: rect.left + 5, y: rect.top + rect.height / 2 }`)) as
    { x: number; y: number } | undefined) ??
  (tries > 0
    ? wait(250).then(() => headingPoint(tries - 1))
    : assert.fail('the preview shows no text'))

/** Gives the preview page the focus with a real click, as a user does, so no late focus comes after. */
const focusPreview = async (): Promise<void> => {
  const point = await headingPoint()
  const { x, y } = await webviewOrigin()
  await clickAt(x + point.x, y + point.y)
  assert.ok(await untilKeyboardIn('[data-line]'), 'the preview page did not get the focus')
}

/** Selects the preview text from `from` in the paragraph of `first` to `offset` in `last`. */
const selectInPreview = (first: number, last: number, offset: number, from = 0): Promise<unknown> =>
  inPreview(`
    const block = (line) => doc.querySelector('[data-line="' + line + '"]').firstChild
    const range = doc.createRange()
    range.setStart(block(${first}), ${from})
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

/** Right-clicks the preview block of a source line, or the selection, with a real mouse. */
const rightClickInPreview = async (line: number | 'selection'): Promise<void> => {
  const inner = (await inPreview(`
    const rect = ${
      line === 'selection'
        ? 'doc.getSelection().getRangeAt(0).getBoundingClientRect()'
        : `doc.querySelector('[data-line="${line}"]').getBoundingClientRect()`
    }
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

// These tests drive the webview through the DevTools port, so they run in a profile of their own.
describe('real input in the Markdown preview', () => {
  beforeEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await focusWorkbench()
  })

  afterEach(deleteNotesComments)

  // TODO: remove the skip once the add key in the preview gets the lines of the preview selection.
  it.skip('comments on the preview selection with the add key', async () => {
    await showNotes(new vscode.Selection(0, 0, 0, 0))
    await vscode.commands.executeCommand('markdown.showPreviewToSide', notes())
    await focused('panel')
    await focusPreview()
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
    await focusPreview()
    assert.equal(await selectInPreview(2, 4, 6), 'First paragraph.\n\nSecond')
    await rightClickInPreview(2)
    const menu = await inPreview(`return {
      context: doc.documentElement.getAttribute('data-vscode-context'),
      selected: doc.getSelection().toString() }`)
    await chooseMenuItem('Add Review Comment')
    assert.ok(
      await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment'),
      'the comment box did not get the focus',
    )
    const selection = sourceBeside('panel')?.selection
    assert.ok(
      selection?.isEqual(new vscode.Selection(2, 0, 4, 17)),
      `the source is not on the selected lines: ${JSON.stringify({ selection, menu })}`,
    )
    assert.ok(stillShown('panel'), 'the preview left the view')
    assert.deepEqual(await saveBox('On the preview selection.'), [2, 4])
  })

  it('selects the whole heading line in the source for words of a heading', async () => {
    await showNotes(new vscode.Selection(2, 0, 2, 0))
    await vscode.commands.executeCommand('markdown.showPreviewToSide', notes())
    await focused('panel')
    await focusPreview()
    assert.equal(await selectInPreview(0, 0, 5), 'Notes')
    await rightClickInPreview('selection')
    await chooseMenuItem('Add Review Comment')
    assert.ok(
      await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment'),
      'the comment box did not get the focus',
    )
    const selection = sourceBeside('panel')?.selection
    assert.ok(
      selection?.isEqual(new vscode.Selection(0, 0, 0, 7)),
      `the source does not select all of "# Notes": ${JSON.stringify(selection)}`,
    )
    assert.deepEqual(await saveBox('On the heading.'), [0, 0])
  })

  it('comments on one line of a paragraph of two lines from a real right-click', async () => {
    const original = (await vscode.workspace.openTextDocument(notes())).getText()
    // The document can close between two writes, so each write opens it again.
    const write = async (text: string): Promise<void> => {
      const document = await vscode.workspace.openTextDocument(notes())
      const edit = new vscode.WorkspaceEdit()
      edit.replace(notes(), new vscode.Range(0, 0, document.lineCount, 0), text)
      assert.ok(await vscode.workspace.applyEdit(edit), 'the edit of the notes failed')
      assert.ok(await document.save(), 'the notes did not save')
    }
    await write(original.replace('Second paragraph.', 'Second paragraph.\nThird line.'))
    try {
      await showNotes(new vscode.Selection(0, 0, 0, 0))
      await vscode.commands.executeCommand('markdown.showPreviewToSide', notes())
      await focused('panel')
      await focusPreview()
      // The paragraph text is "Second paragraph." and a newline, so "Third" starts at offset 18.
      assert.equal(await selectInPreview(4, 4, 23, 18), 'Third')
      // A right-click outside the selection moves the caret, so the click is on the selected text.
      await rightClickInPreview('selection')
      await chooseMenuItem('Add Review Comment')
      assert.ok(
        await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'comment'),
        'the comment box did not get the focus',
      )
      assert.ok(
        sourceBeside('panel')?.selection.isEqual(new vscode.Selection(5, 0, 5, 11)),
        `the source is not on the selected line: ${JSON.stringify(sourceBeside('panel')?.selection)}`,
      )
      assert.deepEqual(await saveBox('On one line of the paragraph.'), [5, 5])
    } finally {
      await deleteNotesComments()
      await write(original)
    }
  })

  // TODO: remove the skip once a second box on a line with a comment gets the focus.
  it.skip('opens a second box on the same preview selection', async () => {
    await showNotes(new vscode.Selection(0, 0, 0, 0))
    await vscode.commands.executeCommand('markdown.showPreviewToSide', notes())
    const addOnSelection = async (text: string): Promise<readonly number[]> => {
      await focused('panel')
      await focusPreview()
      await selectInPreview(2, 4, 6)
      await rightClickInPreview(2)
      await chooseMenuItem('Add Review Comment')
      return saveBox(text)
    }
    assert.deepEqual(await addOnSelection('The first comment.'), [2, 4])
    assert.deepEqual(await addOnSelection('The second comment.'), [2, 4])
  })
})
