import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import type { YreviewApi } from '../../../src/extension'

import { evaluate, pressSaveKey, workbench } from '../keymap/devtools'
import {
  REVIEW_PAGE,
  chooseMenuItem,
  inWebview,
  pressAddKey,
  requireOsFocus,
  focusWorkbench,
  rightClickAt,
  untilInWebview,
  untilKeyboardIn,
} from '../webviewFrames'
import { until } from '../window'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' })
const review = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', 'review.md'))
const yreview = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()

/** The open comments of review.md, read from the notes, with 0-based lines. */
const saved = async (): Promise<readonly { text: string; lines: number[]; id: string }[]> => {
  const service = (await yreview()).service ?? assert.fail('no service')
  const found = await service.anchorOf(review().fsPath)
  if (found.kind !== 'found') return []
  return (await service.placedAt(found.anchor)).flatMap(({ stored, carry }) =>
    (carry.kind === 'same' || carry.kind === 'outdated') && carry.range !== undefined
      ? [
          {
            text: stored.record.description ?? '',
            lines: [carry.range.startLine - 1, carry.range.endLine - 1],
            id: stored.id,
          },
        ]
      : [],
  )
}
const linesOf = async (text: string): Promise<readonly number[][]> =>
  (await saved()).filter((one) => one.text === text).map((one) => one.lines)

/** Polls an async check, four times a second, for ten seconds. */
const eventually = async (check: () => Promise<boolean>, tries = 40): Promise<boolean> =>
  (await check()) || (tries > 0 && wait(250).then(() => eventually(check, tries - 1)))

const savedAt = (text: string, lines: readonly number[]): Promise<boolean> =>
  eventually(async () => JSON.stringify(await linesOf(text)) === JSON.stringify([lines]))

const previewActive = (): boolean => {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input
  return input instanceof vscode.TabInputWebview && input.viewType.endsWith('yreview.preview')
}
const untilInWorkbench = async (check: string, tries = 40): Promise<boolean> =>
  (await evaluate(await workbench(), check)) === true ||
  (tries > 0 && wait(250).then(() => untilInWorkbench(check, tries - 1)))

const openReview = async (): Promise<void> => {
  const editor = await vscode.window.showTextDocument(review(), {
    viewColumn: vscode.ViewColumn.One,
    preview: false,
  })
  // The editor keeps the scroll of an earlier test, and the page follows it.
  editor.revealRange(new vscode.Range(0, 0, 0, 0), vscode.TextEditorRevealType.AtTop)
  await vscode.commands.executeCommand('yreview.openReviewPreview')
  const previews = (await yreview()).reviewPreviews ?? assert.fail('no review previews')
  await (
    previews.all().find((one) => one.uri.fsPath === review().fsPath) ?? assert.fail('no preview')
  ).whenReady()
  assert.ok(
    await untilInWebview(REVIEW_PAGE, `return doc.querySelector('[data-line-end]') !== null`),
    'no content',
  )
  // The add key reaches the preview when its tab is active and no text editor takes the keys.
  assert.ok(
    (await until(previewActive)) &&
      (await untilInWorkbench(`!document.activeElement?.closest('.monaco-editor')`)),
    'the add key does not reach the review preview',
  )
}

/** Selects from `startOffset` to `endOffset` of the text of the block with `data-line="line"`. */
const select = (line: number, startOffset: number, endOffset: number): Promise<unknown> =>
  inWebview(
    REVIEW_PAGE,
    `
    const block = doc.querySelector('[data-line="${line}"]')
    const point = (offset) => {
      const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => node.parentElement.closest('.yreview-badge') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      })
      const step = (node, left) =>
        node === null ? null : node.data.length >= left ? [node, left] : step(walker.nextNode(), left - node.data.length)
      return step(walker.nextNode(), offset)
    }
    const range = doc.createRange()
    range.setStart(...point(${startOffset}))
    range.setEnd(...point(${endOffset}))
    doc.getSelection().removeAllRanges()
    doc.getSelection().addRange(range)
    return doc.getSelection().toString()`,
  )

const boxLines = async (): Promise<unknown> => {
  assert.ok(
    await untilInWebview(REVIEW_PAGE, `return doc.querySelector('.yreview-box') !== null`),
    'no box',
  )
  return inWebview(REVIEW_PAGE, `return doc.querySelector('.yreview-box').dataset.lines`)
}
/** The review preview is the active tab, and its box takes the keys. The OS focus can be elsewhere. */
const boxHasFocus = async (): Promise<boolean> =>
  (await until(previewActive)) && untilKeyboardIn(REVIEW_PAGE, '.yreview-box textarea')
const typeInBox = (text: string): Promise<unknown> =>
  inWebview(
    REVIEW_PAGE,
    `
    const area = doc.querySelector('.yreview-box textarea')
    area.value = ${JSON.stringify(text)}
    area.dispatchEvent(new Event('input', { bubbles: true }))
    return true`,
  )
const click = (selector: string): Promise<unknown> =>
  inWebview(REVIEW_PAGE, `doc.querySelector(${JSON.stringify(selector)}).click(); return true`)
const boxClosed = (): Promise<boolean> =>
  untilInWebview(REVIEW_PAGE, `return doc.querySelector('.yreview-box') === null`)

// These tests read the webview page through the DevTools port, so they run in a profile of their own.
describe('comments in the review preview', () => {
  beforeEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await focusWorkbench()
  })

  afterEach(async () => {
    const comments = (await yreview()).comments ?? assert.fail('no comments')
    const original = vscode.window.showWarningMessage
    Object.defineProperty(vscode.window, 'showWarningMessage', {
      configurable: true,
      value: async () => 'Delete',
    })
    try {
      await (
        await saved()
      ).reduce<Promise<unknown>>(
        (done, one) => done.then(() => comments.deleteId(review(), one.id)),
        Promise.resolve(),
      )
    } finally {
      Object.defineProperty(vscode.window, 'showWarningMessage', { value: original })
    }
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  })

  it('opens a focused box on the selected lines with the real key, and saves with the real save key', async function run() {
    requireOsFocus(this)
    await openReview()
    await select(2, 0, 40)
    await pressAddKey()
    assert.ok(await boxHasFocus(), 'the box has no focus')
    assert.equal(await boxLines(), '3-4')
    await typeInBox('Two lines.')
    await pressSaveKey()
    assert.ok(await boxClosed(), 'the box stays open')
    assert.ok(await savedAt('Two lines.', [2, 3]))
  })

  it('takes one line of a paragraph and one line of a fence', async () => {
    await openReview()
    await select(2, 30, 40)
    await vscode.commands.executeCommand('yreview.addCommentFromReviewPreview')
    assert.equal(await boxLines(), '4-4')
    await click('.yreview-cancel')
    assert.ok(await boxClosed())
    await select(9, 12, 20)
    await vscode.commands.executeCommand('yreview.addCommentFromReviewPreview')
    assert.equal(await boxLines(), '12-12')
  })

  it('keeps the selection for the title button after the page loses the focus', async () => {
    await openReview()
    await select(6, 0, 4)
    await vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup')
    await vscode.commands.executeCommand('yreview.addCommentFromReviewPreview')
    assert.ok(await boxHasFocus(), 'the box has no focus')
    assert.equal(await boxLines(), '7-7')
    await typeInBox('Item.')
    await click('.yreview-save-local')
    assert.ok(await savedAt('Item.', [6, 6]))
  })

  it('opens the box on the block of a real right-click', async () => {
    await openReview()
    await rightClickAt(REVIEW_PAGE, '[data-line="7"]')
    assert.ok(
      await untilInWebview(
        REVIEW_PAGE,
        `return doc.documentElement.dataset.vscodeContext !== undefined`,
      ),
      'the right-click did not reach the page',
    )
    await chooseMenuItem('Add Review Comment')
    assert.ok(await boxHasFocus(), 'the box has no focus')
    assert.equal(await boxLines(), '8-8')
  })

  it('opens a focused box on a line that has a saved comment, and saves a second one', async function run() {
    requireOsFocus(this)
    const comments = (await yreview()).comments ?? assert.fail('no comments')
    await comments.addAt(review(), { start: 2, end: 2 }, 'First.', false)
    await openReview()
    await select(2, 0, 5)
    await pressAddKey()
    assert.ok(await boxHasFocus(), 'the box has no focus')
    assert.equal(await boxLines(), '3-3')
    await typeInBox('Second.')
    await pressSaveKey()
    assert.ok(await boxClosed(), 'the box stays open')
    assert.ok(await savedAt('Second.', [2, 2]))
    assert.ok(await savedAt('First.', [2, 2]))
  })

  it('keeps the focus in the box when the workbench focuses the panel again', async function run() {
    requireOsFocus(this)
    const comments = (await yreview()).comments ?? assert.fail('no comments')
    await comments.addAt(review(), { start: 2, end: 2 }, 'First.', false)
    await openReview()
    await select(2, 0, 5)
    await pressAddKey()
    assert.ok(await boxHasFocus(), 'the box has no focus')
    await inWebview(
      REVIEW_PAGE,
      `doc.defaultView.addEventListener('focus', () => { doc.body.dataset.refocused = 'yes' }, { once: true })
       return true`,
    )
    // The workbench focuses the outer frame first, and the page after it.
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup')
    assert.ok(
      await untilInWebview(REVIEW_PAGE, `return doc.body.dataset.refocused === 'yes'`),
      'the page did not get the focus again',
    )
    assert.ok(await boxHasFocus(), 'the box lost the focus')
  })

  it('asks for the text before a save, and keeps the box open', async () => {
    await openReview()
    await select(2, 0, 5)
    await vscode.commands.executeCommand('yreview.addCommentFromReviewPreview')
    assert.equal(await boxLines(), '3-3')
    await click('.yreview-save-local')
    assert.ok(
      await untilInWebview(
        REVIEW_PAGE,
        `return doc.querySelector('.yreview-box-error').textContent === 'Write the comment text first.'`,
      ),
    )
  })

  it('marks the blocks of open comments, and dims the mark after a commit changes the lines', async () => {
    const comments = (await yreview()).comments ?? assert.fail('no comments')
    const start = git('rev-parse', 'HEAD').trim()
    await comments.addAt(review(), { start: 6, end: 6 }, 'Mark me.', false)
    await openReview()
    assert.ok(
      await untilInWebview(
        REVIEW_PAGE,
        `return doc.querySelector('[data-line="6"].yreview-mark') !== null`,
      ),
    )
    assert.ok(
      await untilInWebview(
        REVIEW_PAGE,
        `return doc.querySelector('button.yreview-badge[data-lines="7-7"]')?.textContent === '1'`,
      ),
    )
    assert.equal(
      (await inWebview(
        REVIEW_PAGE,
        `return getComputedStyle(doc.querySelector('.yreview-mark')).backgroundColor`,
      )) === 'rgba(0, 0, 0, 0)',
      false,
      'the page has no contributed comment color',
    )
    try {
      const edit = new vscode.WorkspaceEdit()
      edit.replace(review(), new vscode.Range(6, 0, 6, 10), '- item changed')
      await vscode.workspace.applyEdit(edit)
      await (await vscode.workspace.openTextDocument(review())).save()
      git('commit', '-q', '-am', 'change the commented line')
      assert.ok(
        await untilInWebview(
          REVIEW_PAGE,
          `return doc.querySelector('[data-line="6"].yreview-mark-outdated') !== null`,
        ),
        'no outdated mark',
      )
    } finally {
      const commits = git('rev-list', `${start}..HEAD`)
        .split('\n')
        .filter((line) => line !== '')
      git('reset', '-q', '--hard', start)
      if (commits.length > 0)
        git('notes', '--ref', 'refs/notes/y-review/local', 'remove', '--ignore-missing', ...commits)
    }
  })

  it('selects the whole heading line in the source from the preview', async () => {
    await openReview()
    assert.equal(await select(0, 0, 6), 'Review')
    await vscode.commands.executeCommand('yreview.addCommentFromReviewPreview')
    assert.equal(await boxLines(), '1-1')
    await typeInBox('On the heading.')
    await click('.yreview-save-local')
    assert.ok(await savedAt('On the heading.', [0, 0]))
    const heading = new vscode.Selection(0, 0, 0, 8)
    const sourceSelects = (): Promise<boolean> =>
      eventually(async () =>
        vscode.window.visibleTextEditors.some(
          (editor) =>
            editor.document.uri.fsPath === review().fsPath && editor.selection.isEqual(heading),
        ),
      )
    const caret = async (): Promise<void> => {
      const source = vscode.window.visibleTextEditors.find(
        (editor) => editor.document.uri.fsPath === review().fsPath,
      )
      if (source !== undefined) source.selection = new vscode.Selection(2, 3, 2, 3)
    }
    await caret()
    assert.ok(
      await untilInWebview(
        REVIEW_PAGE,
        `return doc.querySelector('button.yreview-badge') !== null`,
      ),
    )
    await click('button.yreview-badge')
    await click('.yreview-reveal')
    assert.ok(await sourceSelects(), 'Show in Source does not select all of "# Review"')
    await caret()
    await inWebview(
      REVIEW_PAGE,
      `doc.querySelector('[data-line="0"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
       return true`,
    )
    assert.ok(await sourceSelects(), 'a double-click does not select all of "# Review"')
  })

  it('shows the comment text as text in its card, shows the source, and resolves', async () => {
    const comments = (await yreview()).comments ?? assert.fail('no comments')
    await comments.addAt(review(), { start: 2, end: 4 }, 'Card text <b>raw</b>.', false)
    await openReview()
    assert.ok(
      await untilInWebview(
        REVIEW_PAGE,
        `return doc.querySelector('button.yreview-badge') !== null`,
      ),
    )
    await click('button.yreview-badge')
    assert.equal(
      await inWebview(
        REVIEW_PAGE,
        `const card = doc.querySelector('.yreview-card')
         return card.textContent.includes('Card text <b>raw</b>.') && card.querySelector('b') === null`,
      ),
      true,
    )
    await click('.yreview-reveal')
    assert.ok(
      await eventually(
        async () => vscode.window.activeTextEditor?.document.uri.fsPath === review().fsPath,
      ),
      'the source did not show',
    )
    await click('.yreview-resolve')
    assert.ok(await eventually(async () => (await linesOf('Card text <b>raw</b>.')).length === 0))
    assert.ok(
      await untilInWebview(
        REVIEW_PAGE,
        `return doc.querySelector('button.yreview-badge') === null`,
      ),
    )
  })
})
