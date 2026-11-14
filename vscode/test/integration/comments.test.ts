import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import type { ReviewComments, Shown } from '../../src/comments/controller'
import type { YreviewApi } from '../../src/extension'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' })
const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()
const reviewComments = async (): Promise<ReviewComments> =>
  (await api()).comments ?? assert.fail('the comment features are off')
const localNotes = (): string => git('notes', '--ref', 'refs/notes/y-review/local', 'show', 'HEAD')
const textOf = (shown: Shown): string =>
  (shown.thread.comments[0]?.body as vscode.MarkdownString).value
const until = async (check: () => boolean, tries = 40): Promise<boolean> =>
  check() || (tries > 0 && wait(250).then(() => until(check, tries - 1)))

describe('comments in the editor', () => {
  const file = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', 'a.txt'))
  const tracked = (): string => git('ls-files', '-s')
  const controller = vscode.comments.createCommentController('yreview-test', 'Test')
  const saveDraft = async (range: vscode.Range, text: string): Promise<vscode.CommentThread> => {
    const draft = controller.createCommentThread(file(), range, [])
    await vscode.commands.executeCommand('yreview.saveLocal', { thread: draft, text })
    return draft
  }
  const shownWith = async (text: string): Promise<Shown> =>
    (await reviewComments()).snapshot(file()).find((shown) => textOf(shown) === text) ??
    assert.fail(`no thread with the text ${text}`)

  before(async () => {
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file()))
  })

  afterEach(async () => {
    const comments = await reviewComments()
    await comments.reload(file())
    await comments
      .snapshot(file())
      .reduce<Promise<unknown>>(
        (done, shown) =>
          done.then(() => vscode.commands.executeCommand('yreview.resolve', shown.thread)),
        Promise.resolve(),
      )
  })

  after(() => controller.dispose())

  it('saves a local comment, shows it again after a reload, and resolves it', async () => {
    const before = tracked()
    const comments = await reviewComments()
    const text = 'Check this line. [Run](command:workbench.action.quit) <b>bold</b>'
    await saveDraft(new vscode.Range(1, 0, 1, 0), text)
    assert.match(localNotes(), /Check this line\./)

    await comments.reload(file())
    const shown = await shownWith(text)
    const body = shown.thread.comments[0]?.body as vscode.MarkdownString
    assert.equal(body.isTrusted, false)
    assert.equal(body.supportHtml, false)
    assert.equal(shown.thread.range?.start.line, 1)
    assert.equal(shown.thread.label, 'Lines 2-2')

    await vscode.commands.executeCommand('yreview.resolve', shown.thread)
    assert.equal(shown.thread.state, vscode.CommentThreadState.Resolved)
    assert.match(localNotes(), /"resolved":true/)
    await comments.reload(file())
    assert.deepEqual(comments.snapshot(file()), [])

    assert.equal(git('status', '--porcelain'), '')
    assert.equal(tracked(), before)
  })

  it('saves into the same thread, collapses it, and keeps it over reloads', async () => {
    const comments = await reviewComments()
    const draft = await saveDraft(new vscode.Range(0, 0, 1, 0), 'Same thread.')
    const shown = await shownWith('Same thread.')
    assert.equal(shown.thread, draft)
    assert.equal(draft.collapsibleState, vscode.CommentThreadCollapsibleState.Collapsed)
    assert.equal(draft.canReply, false)
    assert.equal(draft.contextValue, 'yreview.open')
    await comments.reload(file())
    await comments.reload(file())
    assert.equal((await shownWith('Same thread.')).thread, draft)
  })

  it('puts the thread on the first line and keeps the full range for the marks', async () => {
    await saveDraft(new vscode.Range(0, 1, 1, 2), 'Part of two lines.')
    await saveDraft(new vscode.Range(1, 0, 2, 0), 'Whole lines.')
    const part = await shownWith('Part of two lines.')
    assert.deepEqual(part.thread.range, new vscode.Range(0, 0, 0, 0))
    assert.deepEqual(part.range, new vscode.Range(0, 1, 1, 2))
    assert.equal(part.thread.label, 'Lines 1:1-2:2')
    const whole = await shownWith('Whole lines.')
    assert.deepEqual(whole.thread.range, new vscode.Range(1, 0, 1, 0))
    assert.deepEqual(whole.range, new vscode.Range(1, 0, 2, 5))
  })

  it('marks the text of two overlapping comments with depth 2', async () => {
    await saveDraft(new vscode.Range(0, 0, 1, 3), 'Outer.')
    await saveDraft(new vscode.Range(1, 1, 1, 2), 'Inner.')
    const deep = (await reviewComments()).segmentsOf(file()).find((segment) => segment.depth === 2)
    assert.deepEqual(
      { start: deep?.start, end: deep?.end, count: deep?.count },
      { start: { line: 1, character: 1 }, end: { line: 1, character: 2 }, count: 2 },
    )
  })

  it('opens the comment box with focus, and the submit key saves it', async () => {
    const editor = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(file()),
    )
    const diag = (step: string): void =>
      console.log(
        `DIAG ${step} focused=${vscode.window.state.focused} active=${vscode.window.state.active} dirty=${editor.document.isDirty} editor=${vscode.window.activeTextEditor?.document.uri.toString()}`,
      )
    diag('start')
    await vscode.commands.executeCommand('workbench.action.focusWindow')
    await until(() => vscode.window.state.focused, 20)
    diag('after-focus')
    editor.selection = new vscode.Selection(2, 1, 2, 4)
    await vscode.commands.executeCommand('yreview.addComment')
    diag('after-add')
    await wait(1500)
    diag('after-wait')
    await vscode.commands.executeCommand('type', { text: 'Typed in the box.' })
    diag('after-type')
    await vscode.commands.executeCommand('editor.action.submitComment')
    const comments = await reviewComments()
    const saved = await until(() =>
      comments.snapshot(file()).some((shown) => textOf(shown) === 'Typed in the box.'),
    )
    const dirty = editor.document.isDirty
    if (dirty) await vscode.commands.executeCommand('workbench.action.files.revert')
    assert.equal(dirty, false, 'the text went into the file, not into the comment box')
    assert.ok(saved, 'the comment box did not save the text')
    assert.ok(await until(() => editor.selection.isEqual(new vscode.Selection(2, 1, 2, 4))))
    const shown = await shownWith('Typed in the box.')
    assert.deepEqual(shown.range, new vscode.Range(2, 1, 2, 4))
    assert.equal(shown.thread.range?.start.line, 2)
    assert.equal(shown.thread.range?.end.line, 2)
    assert.equal(shown.thread.collapsibleState, vscode.CommentThreadCollapsibleState.Collapsed)
  })

  it('registers the comment commands', async () => {
    await api()
    const all = await vscode.commands.getCommands(true)
    ;[
      'yreview.addComment',
      'yreview.saveLocal',
      'yreview.saveShared',
      'yreview.resolve',
      'yreview.delete',
    ].forEach((command) => assert.ok(all.includes(command), command))
  })
})
