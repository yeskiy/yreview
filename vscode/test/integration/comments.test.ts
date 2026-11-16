import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import type { ReviewComments, Shown } from '../../src/comments/controller'
import type { YreviewApi } from '../../src/extension'

import { focusWindow, removeRepository, until } from './window'

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

/** Counts the reloads of one file until `stop`. */
const spyReloads = (comments: ReviewComments, uri: vscode.Uri) => {
  const calls: string[] = []
  const original = comments.reload.bind(comments)
  Object.assign(comments, {
    reload: (target: vscode.Uri) => {
      calls.push(target.toString())
      return original(target)
    },
  })
  return {
    count: (): number => calls.filter((call) => call === uri.toString()).length,
    stop: (): boolean => Reflect.deleteProperty(comments, 'reload'),
  }
}

/** A thread that counts each value set on it. */
const counted = (thread: vscode.CommentThread) => {
  const sets: PropertyKey[] = []
  return {
    sets,
    thread: new Proxy(thread, {
      set: (target, key, value: unknown) => {
        sets.push(key)
        return Reflect.set(target, key, value)
      },
    }),
  }
}

describe('comments in the editor', () => {
  const file = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', 'a.txt'))
  const tracked = (): string => git('ls-files', '-s')
  const controller = vscode.comments.createCommentController('yreview-test', 'Test')
  const saveDraft = async (range: vscode.Range, text: string): Promise<vscode.CommentThread> => {
    const draft = controller.createCommentThread(file(), range, [])
    await vscode.commands.executeCommand('yreview.saveLocal', { thread: draft, text })
    return draft
  }
  const head = (): string => git('rev-parse', 'HEAD').trim()
  /** Resets to the commit and waits until the open document shows the text of the file. */
  const restore = async (commit: string): Promise<void> => {
    git('reset', '-q', '--hard', commit)
    const document = await vscode.workspace.openTextDocument(file())
    const text = readFileSync(file().fsPath, 'utf8')
    assert.ok(await until(() => document.getText() === text), 'the document did not reload')
  }
  const described = (comments: ReviewComments, text: string): Shown | undefined =>
    comments.snapshot(file()).find((shown) => shown.stored.record.description === text)
  /** Writes the file and waits until the open document shows the new text. */
  const writeText = async (text: string): Promise<void> => {
    writeFileSync(file().fsPath, text)
    const document = await vscode.workspace.openTextDocument(file())
    assert.ok(await until(() => document.getText() === text), 'the document did not reload')
  }
  const commitText = async (text: string): Promise<void> => {
    await writeText(text)
    git('commit', '-q', '-am', 'change')
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

  it('keeps a resolved comment resolved when a reload runs during the resolve', async () => {
    const comments = await reviewComments()
    const thread = await saveDraft(new vscode.Range(1, 0, 2, 0), 'Resolved during a reload.')
    await Promise.all([
      vscode.commands.executeCommand('yreview.resolve', thread),
      comments.reload(file()),
    ])
    assert.deepEqual(
      comments
        .snapshot(file())
        .filter((shown) => textOf(shown) === 'Resolved during a reload.')
        .map((shown) => shown.thread.state),
      [],
      'the reload drew the resolved comment as open again',
    )
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
    await focusWindow()
    editor.selection = new vscode.Selection(2, 1, 2, 4)
    await vscode.commands.executeCommand('yreview.addComment')
    await wait(1500)
    await vscode.commands.executeCommand('type', { text: 'Typed in the box.' })
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

  it('opens the comment box with focus on line 1 of a file with no thread', async () => {
    const todo = vscode.Uri.file(path.join(workspace(), 'src', 'todo.ts'))
    const comments = await reviewComments()
    await comments.reload(todo)
    assert.deepEqual(comments.snapshot(todo), [])
    const editor = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(todo),
    )
    await focusWindow()
    editor.selection = new vscode.Selection(0, 3, 0, 7)
    await vscode.commands.executeCommand('yreview.addComment')
    await wait(1500)
    // The text goes into the box only while the box has the focus. Undo empties the box again.
    await vscode.commands.executeCommand('type', { text: 'y' })
    const dirty = editor.document.isDirty
    if (dirty) await vscode.commands.executeCommand('workbench.action.files.revert')
    else await vscode.commands.executeCommand('undo')
    await vscode.commands.executeCommand('yreview.closeBox')
    assert.equal(dirty, false, 'the comment box on line 1 did not get the focus')
  })

  it('reloads once after a burst of store changes, and not after a save of this window', async () => {
    const comments = await reviewComments()
    const service = (await api()).service ?? assert.fail('no service')
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file()))
    await wait(1000)
    const reloads = spyReloads(comments, file())
    try {
      await [1, 2, 3, 4, 5].reduce(
        (done) =>
          done.then(async () => {
            service.notifyChanged()
            await wait(50)
          }),
        Promise.resolve(),
      )
      await wait(1000)
      assert.equal(reloads.count(), 1, 'a burst of 5 changes did not give one reload')
      const draft = counted(
        controller.createCommentThread(file(), new vscode.Range(2, 0, 2, 0), []),
      )
      await vscode.commands.executeCommand('yreview.saveLocal', {
        thread: draft.thread,
        text: 'Saved in place.',
      })
      const sets = draft.sets.length
      await wait(1500)
      assert.equal(reloads.count(), 1, 'the save of this window reloaded the file')
      assert.deepEqual(draft.sets.slice(sets), [], 'the save of this window drew the thread again')
    } finally {
      reloads.stop()
    }
  })

  it('shows and hides a comment that a write outside the editor makes in a repository outside the folder', async () => {
    const comments = await reviewComments()
    const service = (await api()).service ?? assert.fail('no service')
    const nested = realpathSync(mkdtempSync(path.join(tmpdir(), 'yreview-nested-')))
    const inNested = (...args: string[]): string =>
      execFileSync('git', args, { cwd: nested, encoding: 'utf8' })
    writeFileSync(path.join(nested, 'n.txt'), 'one\ntwo\n')
    inNested('init', '-q', '-b', 'main')
    inNested('config', 'commit.gpgsign', 'false')
    inNested('add', '.')
    inNested('commit', '-q', '-m', 'init')
    const uri = vscode.Uri.file(path.join(nested, 'n.txt'))
    try {
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri))
      await comments.reload(uri)
      const found = await service.anchorOf(uri.fsPath)
      if (found.kind !== 'found') assert.fail(`no anchor: ${found.kind}`)
      const { stored } = await service.addComment(
        found.anchor,
        { startLine: 1, endLine: 1 },
        'Nested.',
        false,
      )
      assert.ok(await until(() => comments.snapshot(uri).length === 1), 'the comment did not show')
      await service.resolve(found.anchor, stored.id)
      assert.ok(await until(() => comments.snapshot(uri).length === 0), 'the comment still shows')
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
      await removeRepository(nested)
    }
  })

  it('keeps the comments of the old HEAD after a commit that does not change the file', async () => {
    const comments = await reviewComments()
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file()))
    await saveDraft(new vscode.Range(2, 0, 2, 0), 'On the first commit.')
    const entry = (): Shown | undefined =>
      comments.snapshot(file()).find((shown) => textOf(shown) === 'On the first commit.')
    git('commit', '-q', '--allow-empty', '-m', 'move')
    try {
      await wait(1500)
      assert.equal(entry()?.carry.kind, 'same')
      assert.equal(entry()?.range.start.line, 2)
    } finally {
      git('reset', '-q', '--soft', 'HEAD~1')
    }
  })

  it('moves a comment of the old HEAD after lines added above', async () => {
    const comments = await reviewComments()
    const start = head()
    await saveDraft(new vscode.Range(1, 0, 1, 0), 'Moves down.')
    try {
      await commitText('zero\nhalf\none\ntwo\nthree\n')
      assert.ok(await until(() => described(comments, 'Moves down.')?.range.start.line === 3))
      assert.equal(described(comments, 'Moves down.')?.carry.kind, 'same')
    } finally {
      await restore(start)
    }
  })

  it('marks a comment outdated when its lines change, with the original text', async () => {
    const comments = await reviewComments()
    const start = head()
    await saveDraft(new vscode.Range(1, 0, 1, 0), 'Changes.')
    try {
      await commitText('one\nTWO\nthree\n')
      assert.ok(await until(() => described(comments, 'Changes.')?.carry.kind === 'outdated'))
      const shown = described(comments, 'Changes.') ?? assert.fail('no outdated thread')
      assert.match(shown.thread.label ?? '', /^Outdated/u)
      assert.match(textOf(shown), /\ntwo\n/u)
      assert.equal(shown.range.start.line, 1)
    } finally {
      await restore(start)
    }
  })

  it('counts a moved comment and a HEAD comment on the same lines as an overlap', async () => {
    const comments = await reviewComments()
    const start = head()
    await saveDraft(new vscode.Range(1, 0, 1, 0), 'Moved.')
    try {
      await commitText('zero\none\ntwo\nthree\n')
      assert.ok(await until(() => described(comments, 'Moved.')?.range.start.line === 2))
      await saveDraft(new vscode.Range(2, 0, 2, 0), 'On the new HEAD.')
      assert.ok(comments.segmentsOf(file()).some((segment) => segment.count === 2))
    } finally {
      await restore(start)
    }
  })

  it('keeps a comment on uncommitted lines on its text after the commit', async () => {
    const comments = await reviewComments()
    const start = head()
    try {
      await writeText('one\ninserted\ntwo\nthree\n')
      await saveDraft(new vscode.Range(1, 0, 1, 0), 'On new text.')
      assert.match(localNotes(), /"text":"inserted"/u)
      await commitText('top\none\ninserted\ntwo\nthree\n')
      assert.ok(await until(() => described(comments, 'On new text.')?.range.start.line === 2))
      assert.equal(described(comments, 'On new text.')?.carry.kind, 'same')
    } finally {
      await restore(start)
    }
  })

  it('resolves and deletes a carried comment in the note of its commit', async () => {
    const comments = await reviewComments()
    const start = head()
    await saveDraft(new vscode.Range(0, 0, 0, 0), 'Resolve me.')
    await saveDraft(new vscode.Range(2, 0, 2, 0), 'Delete me.')
    try {
      await commitText('zero\none\ntwo\nthree\n')
      assert.ok(await until(() => described(comments, 'Delete me.')?.range.start.line === 3))
      const resolve = described(comments, 'Resolve me.') ?? assert.fail('no thread to resolve')
      const remove = described(comments, 'Delete me.') ?? assert.fail('no thread to delete')
      await vscode.commands.executeCommand('yreview.resolve', resolve.thread)
      await comments.deleteComment(remove.thread.comments[0] ?? assert.fail('no comment'))
      const note = git('notes', '--ref', 'refs/notes/y-review/local', 'show', start)
      assert.match(note, /"resolved":true/u)
      assert.doesNotMatch(note, /Delete me\./u)
      assert.throws(() => localNotes())
    } finally {
      await restore(start)
    }
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
