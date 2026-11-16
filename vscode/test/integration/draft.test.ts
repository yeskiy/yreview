import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import * as vscode from 'vscode'

import type { ReviewComments, Shown } from '../../src/comments/controller'
import type { YreviewApi } from '../../src/extension'

import { until } from './window'

const NAME = 'src/drafted.ts'
const SOURCE = [
  'export function add(a: number, b: number): number {',
  '  return a + b',
  '}',
  '',
].join('\n')
const REF = 'refs/notes/y-review/local'
const DRAFT = 'yreview-draft'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' })
const file = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), NAME))
const reviewComments = async (): Promise<ReviewComments> =>
  (
    await (
      vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
    ).activate()
  ).comments ?? assert.fail('the comment features are off')
const head = (): string => git('rev-parse', 'HEAD').trim()
const isDraft = (): boolean => vscode.window.activeTextEditor?.document.uri.scheme === DRAFT
const textOf = (shown: Shown): string =>
  (shown.thread.comments[0]?.body as vscode.MarkdownString).value
const draftTabs = () =>
  vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputText &&
        tab.input.uri.scheme === DRAFT &&
        tab.input.uri.path.includes('drafted.ts'),
    )

/** Answers each modal question with `answer`, keeps the questions, and gives the restore function. */
const answerWarning = (answer: string | undefined, asked: string[]) => {
  const original = vscode.window.showWarningMessage
  Object.defineProperty(vscode.window, 'showWarningMessage', {
    configurable: true,
    value: async (question: string) => {
      asked.push(question)
      return answer
    },
  })
  return () => Object.defineProperty(vscode.window, 'showWarningMessage', { value: original })
}

/** Selects `selection` in the source and runs Add Review Comment, which opens a draft there. */
const addOn = async (selection: vscode.Selection): Promise<vscode.TextEditor> => {
  const editor = await vscode.window.showTextDocument(file(), {
    viewColumn: vscode.ViewColumn.One,
    preview: false,
  })
  editor.selection = selection
  await vscode.commands.executeCommand('yreview.addComment')
  assert.ok(await until(isDraft), 'no draft editor opened')
  return editor
}

const backInSource = async (selection: vscode.Selection): Promise<void> => {
  assert.ok(await until(() => !isDraft()), 'the draft stayed active')
  assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), file().toString())
  assert.deepEqual(vscode.window.activeTextEditor?.selection, selection)
  assert.equal(draftTabs().length, 0, 'the draft tab stayed open')
}

describe('the draft editor of a line that has a comment', function drafts() {
  this.timeout(120_000)

  const start = head()

  before(async () => {
    writeFileSync(file().fsPath, SOURCE)
    git('add', NAME)
    git('commit', '-q', '-m', 'add drafted')
    git(
      'notes',
      '--ref',
      REF,
      'add',
      '-f',
      '-m',
      JSON.stringify({
        timestamp: '1794705320',
        author: 'reviewer@example.com',
        description: 'On the first line.',
        location: { commit: head(), path: NAME, range: { startLine: 1, endLine: 3 } },
      }),
      head(),
    )
    await vscode.window.showTextDocument(file(), { preview: false })
    const comments = await reviewComments()
    await comments.reload(file())
    assert.ok(await until(() => comments.snapshot(file()).length === 1), 'the saved comment')
  })

  afterEach(async () => {
    const restore = answerWarning('Discard', [])
    try {
      await Promise.all(
        draftTabs().map(async (tab) =>
          vscode.commands.executeCommand(
            'yreview.draft.discard',
            (tab.input as vscode.TabInputText).uri,
          ),
        ),
      )
    } finally {
      restore()
    }
  })

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    const commits = git('rev-list', `${start}..HEAD`)
      .split('\n')
      .filter((line) => line !== '')
    git('reset', '-q', '--hard', start)
    git('notes', '--ref', REF, 'remove', '--ignore-missing', ...commits)
    await (await reviewComments()).reload(file())
  })

  it('opens one draft beside the source, with the focus in it and the file and lines in its name', async () => {
    await addOn(new vscode.Selection(0, 0, 1, 4))
    const draft = vscode.window.activeTextEditor
    assert.equal(draft?.viewColumn, vscode.ViewColumn.Two)
    assert.equal(
      path.posix.basename(draft?.document.uri.path ?? ''),
      'Comment on drafted.ts lines 1-2.md',
    )
    assert.equal(draft?.document.getText(), '')
    await addOn(new vscode.Selection(0, 0, 1, 4))
    assert.equal(
      vscode.window.activeTextEditor?.document.uri.toString(),
      draft?.document.uri.toString(),
    )
    assert.equal(draftTabs().length, 1, 'a second add opened a second draft')
  })

  it('saves the typed text to the selected lines with their text, then closes the draft', async () => {
    const selection = new vscode.Selection(0, 0, 1, 14)
    await addOn(selection)
    const text = 'Written in the draft editor.'
    await vscode.commands.executeCommand('type', { text })
    await vscode.commands.executeCommand('yreview.draft.saveLocal')
    const comments = await reviewComments()
    assert.ok(
      await until(() => comments.snapshot(file()).some((shown) => textOf(shown) === text)),
      'the draft did not save',
    )
    const saved = comments.snapshot(file()).find((shown) => textOf(shown) === text)
    assert.deepEqual(saved?.stored.record.location?.range, { startLine: 1, endLine: 2 })
    assert.equal(
      saved?.stored.record.location?.text,
      'export function add(a: number, b: number): number {\n  return a + b',
    )
    assert.equal(saved?.stored.ref, REF)
    assert.equal(saved?.thread.collapsibleState, vscode.CommentThreadCollapsibleState.Expanded)
    await backInSource(selection)
  })

  it('writes a local comment when the draft document saves, as Save of the close question does', async () => {
    const selection = new vscode.Selection(0, 0, 2, 1)
    await addOn(selection)
    const text = 'Saved from the close question.'
    await vscode.commands.executeCommand('type', { text })
    const document = vscode.window.activeTextEditor?.document ?? assert.fail('no draft')
    assert.equal(await document.save(), true, 'the draft document did not save')
    const comments = await reviewComments()
    assert.ok(
      await until(() => comments.snapshot(file()).some((shown) => textOf(shown) === text)),
      'the save of the draft document wrote no comment',
    )
    const saved = comments.snapshot(file()).find((shown) => textOf(shown) === text)
    assert.deepEqual(saved?.stored.record.location?.range, { startLine: 1, endLine: 3 })
    assert.equal(saved?.stored.ref, REF)
    await backInSource(selection)
    assert.equal(
      comments.snapshot(file()).filter((shown) => textOf(shown) === text).length,
      1,
      'the comment was written twice',
    )
  })

  it('writes nothing when a blank draft document saves', async () => {
    await addOn(new vscode.Selection(0, 0, 1, 1))
    const comments = await reviewComments()
    const before = comments.snapshot(file()).length
    await vscode.commands.executeCommand('type', { text: '  \n ' })
    const document = vscode.window.activeTextEditor?.document ?? assert.fail('no draft')
    await document.save()
    await comments.reload(file())
    assert.equal(comments.snapshot(file()).length, before, 'a blank draft wrote a comment')
  })

  it('keeps the draft and its text, and shows the error, when the write of a saved draft fails', async () => {
    await addOn(new vscode.Selection(0, 0, 0, 5))
    const text = 'Not written behind a lock.'
    await vscode.commands.executeCommand('type', { text })
    const document = vscode.window.activeTextEditor?.document ?? assert.fail('no draft')
    // A lock file of the notes ref makes git refuse the write of the note.
    const lock = path.resolve(workspace(), git('rev-parse', '--git-path', `${REF}.lock`).trim())
    mkdirSync(path.dirname(lock), { recursive: true })
    writeFileSync(lock, '')
    const errors: string[] = []
    const original = vscode.window.showErrorMessage
    Object.defineProperty(vscode.window, 'showErrorMessage', {
      configurable: true,
      value: async (message: string) => {
        errors.push(message)
        return undefined
      },
    })
    try {
      assert.equal(await document.save(), false, 'a failed write saved the draft')
    } finally {
      Object.defineProperty(vscode.window, 'showErrorMessage', { value: original })
      rmSync(lock, { force: true })
    }
    assert.ok(
      errors.some((message) => message.startsWith('Save failed.')),
      `no error: ${JSON.stringify(errors)}`,
    )
    assert.equal(draftTabs().length, 1, 'a failed write closed the draft')
    assert.equal(document.isDirty, true)
    assert.equal(document.getText(), text)
  })

  it('closes an empty draft with no question and gives the focus back to the source', async () => {
    const selection = new vscode.Selection(0, 2, 0, 6)
    await addOn(selection)
    const asked: string[] = []
    const restore = answerWarning(undefined, asked)
    try {
      await vscode.commands.executeCommand('yreview.draft.discard')
    } finally {
      restore()
    }
    assert.deepEqual(asked, [])
    await backInSource(selection)
  })

  it('asks before it closes a draft with text, and keeps the draft when the answer is no', async () => {
    const selection = new vscode.Selection(0, 0, 0, 3)
    await addOn(selection)
    await vscode.commands.executeCommand('type', { text: 'Not saved yet.' })
    const asked: string[] = []
    const keep = answerWarning(undefined, asked)
    try {
      await vscode.commands.executeCommand('yreview.draft.discard')
    } finally {
      keep()
    }
    assert.deepEqual(asked, ['Discard this review comment?'])
    assert.ok(isDraft(), 'the draft closed with no answer')
    assert.equal(vscode.window.activeTextEditor?.document.getText(), 'Not saved yet.')
    const discard = answerWarning('Discard', asked)
    try {
      await vscode.commands.executeCommand('yreview.draft.discard')
    } finally {
      discard()
    }
    await backInSource(selection)
    assert.equal(
      (await reviewComments()).snapshot(file()).some((shown) => textOf(shown) === 'Not saved yet.'),
      false,
    )
  })
})
