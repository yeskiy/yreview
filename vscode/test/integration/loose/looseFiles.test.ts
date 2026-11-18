import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import * as vscode from 'vscode'

import type { YreviewApi } from '../../../src/extension'
import type { Row } from '../../../src/tasks/viewRows'

import { removeRepository, until } from '../window'

const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()

const storeFile = (folder: string): string =>
  path.join(folder, '.y-review', 'notes', 'refs-notes-y-review-local', 'worktree.jsonl')
const sharedStore = (folder: string): string =>
  path.join(folder, '.y-review', 'notes', 'refs-notes-devtools-discuss')

/** The folders above the folder, nearest first. */
const ancestors = (folder: string): readonly string[] =>
  path.dirname(folder) === folder ? [] : [path.dirname(folder), ...ancestors(path.dirname(folder))]

const lines = (file: string): readonly string[] =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '')

const samePath = (a: string, b: string): boolean =>
  process.platform === 'win32'
    ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
    : path.resolve(a) === path.resolve(b)

interface TraceEvent {
  readonly event: string
  readonly sid: string
  readonly argv?: readonly string[]
  readonly worktree?: string
}

/** The arguments of each git process that ran in the work tree, from a trace2 event file. */
const gitCallsIn = (trace: string, worktree: string): readonly (readonly string[])[] => {
  const events = existsSync(trace) ? lines(trace).map((line) => JSON.parse(line) as TraceEvent) : []
  const sids = new Set(
    events
      .filter((each) => each.event === 'def_repo' && samePath(each.worktree ?? '', worktree))
      .map((each) => each.sid),
  )
  return events
    .filter((each) => each.event === 'start' && sids.has(each.sid))
    .map((each) => (each.argv ?? []).slice(1))
}

interface GitExtension {
  getAPI(version: 1): { readonly repositories: readonly { readonly rootUri: vscode.Uri }[] }
}

/** The API of the built-in git extension, with the repositories that it opened. */
const gitExtensionApi = async () =>
  (
    (await vscode.extensions.getExtension<GitExtension>('vscode.git')?.activate()) ??
    assert.fail('no git extension')
  ).getAPI(1)

describe('comments on loose files in an empty window', () => {
  const folder = path.join(realpathSync.native(tmpdir()), `yreview-loose-${randomUUID()}`)
  const fileIn = (dir: string, name: string): vscode.Uri => vscode.Uri.file(path.join(dir, name))
  const save = async (uri: vscode.Uri, text: string, command = 'yreview.saveLocal') => {
    const controller = vscode.comments.createCommentController('yreview-loose-test', 'Test')
    const draft = controller.createCommentThread(uri, new vscode.Range(0, 0, 0, 0), [])
    try {
      await vscode.commands.executeCommand(command, { thread: draft, text })
    } finally {
      controller.dispose()
    }
  }

  before(function noStoreAbove() {
    // A store above the scratch folder would take the comments, so the test does not write there.
    if (ancestors(folder).some((dir) => existsSync(path.join(dir, '.y-review', 'notes'))))
      this.skip()
    mkdirSync(folder, { recursive: true })
    writeFileSync(path.join(folder, 'one.md'), '# One\n')
    writeFileSync(path.join(folder, 'two.md'), '# Two\n')
  })

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    // Git writes its object files read-only, and the test host does not delete a read-only file on Windows.
    const repositories = [`${folder}-child`, `${folder}-tree-repo`]
    repositories
      .filter((dir) => existsSync(dir))
      .forEach((dir) =>
        readdirSync(dir, { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile())
          .forEach((entry) => chmodSync(path.join(entry.parentPath, entry.name), 0o666)),
      )
    // The git extension holds the files of a repository that it opened until it closes it.
    await repositories.reduce<Promise<void>>(
      (done, dir) => done.then(() => removeRepository(dir)),
      Promise.resolve(),
    )
    // On Windows the file watcher of the window can hold the folder for a short time.
    ;[
      folder,
      `${folder}-locked`,
      `${folder}-tree-a`,
      `${folder}-tree-b`,
      `${folder}-trace.json`,
    ].forEach((dir) =>
      rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }),
    )
  })

  it('runs with no workspace folder', () => {
    assert.equal(vscode.workspace.workspaceFolders, undefined)
  })

  it('saves a comment on a loose file into a store next to the file', async () => {
    await vscode.window.showTextDocument(fileIn(folder, 'one.md'))
    await save(fileIn(folder, 'one.md'), 'Loose note.')
    assert.equal(lines(storeFile(folder)).length, 1)
    assert.match(readFileSync(storeFile(folder), 'utf8'), /"commit":"worktree","path":"one.md"/)
  })

  it('shows the comment again after a reload', async () => {
    const { comments } = await api()
    assert.ok(comments)
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await vscode.window.showTextDocument(fileIn(folder, 'one.md'))
    await comments.reload(fileIn(folder, 'one.md'))
    assert.ok(
      await until(() =>
        comments
          .snapshot(fileIn(folder, 'one.md'))
          .some((shown) => shown.stored.record.description === 'Loose note.'),
      ),
      'the thread did not show again',
    )
    const [shown] = comments.snapshot(fileIn(folder, 'one.md'))
    assert.equal(shown?.anchor.store, 'folder')
  })

  it('a second loose file of the folder adds a line to the same store', async () => {
    await vscode.window.showTextDocument(fileIn(folder, 'two.md'))
    await save(fileIn(folder, 'two.md'), 'Second note.')
    assert.equal(lines(storeFile(folder)).length, 2)
    assert.equal(existsSync(path.join(path.dirname(folder), '.y-review')), false)
  })

  it('a shared save on a loose file writes the local ref when shared comments come first', async () => {
    const settings = vscode.workspace.getConfiguration('yreview')
    await settings.update('newComments', 'shared', vscode.ConfigurationTarget.Global)
    try {
      writeFileSync(path.join(folder, 'four.md'), '# Four\n')
      await vscode.window.showTextDocument(fileIn(folder, 'four.md'))
      await save(fileIn(folder, 'four.md'), 'Shared first.', 'yreview.saveShared')
      assert.match(readFileSync(storeFile(folder), 'utf8'), /"path":"four.md"/)
      assert.equal(existsSync(sharedStore(folder)), false)
    } finally {
      await settings.update('newComments', undefined, vscode.ConfigurationTarget.Global)
    }
  })

  it('a child store moves into the git notes after the first commit, with the path from the root', async () => {
    const { comments } = await api()
    assert.ok(comments)
    // A folder beside the other cases, so the store of the scratch folder does not take the comment.
    const root = `${folder}-child`
    const sub = path.join(root, 'sub')
    mkdirSync(sub, { recursive: true })
    writeFileSync(path.join(sub, 'f.txt'), 'one\n')
    writeFileSync(path.join(sub, 'g.txt'), 'two\n')
    try {
      await vscode.window.showTextDocument(fileIn(sub, 'f.txt'))
      await save(fileIn(sub, 'f.txt'), 'Child note.')
      assert.equal(lines(storeFile(sub)).length, 1)
      const run = (...args: string[]): string =>
        execFileSync(
          'git',
          ['-c', 'user.name=Yreview Test', '-c', 'user.email=reviewer@example.com', ...args],
          { cwd: root, encoding: 'utf8' },
        )
      run('init', '-q', '-b', 'main')
      run('add', 'sub/f.txt', 'sub/g.txt')
      run('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init')
      await vscode.window.showTextDocument(fileIn(sub, 'g.txt'))
      assert.ok(
        await until(() => !existsSync(path.join(sub, '.y-review')), 80),
        'the child store did not move',
      )
      await vscode.window.showTextDocument(fileIn(sub, 'f.txt'))
      await comments.reload(fileIn(sub, 'f.txt'))
      const shown = comments
        .snapshot(fileIn(sub, 'f.txt'))
        .find((entry) => entry.stored.record.description === 'Child note.')
      assert.equal(shown?.anchor.store, 'git')
      assert.equal(shown?.stored.record.location?.path, 'sub/f.txt')
      assert.match(
        run('notes', '--ref', 'refs/notes/y-review/local', 'show', 'HEAD'),
        /"path":"sub\/f.txt"/,
      )
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    }
  })

  it('a save into a read-only folder fails with a message that names the folder', async function readOnly() {
    if (process.platform === 'win32') this.skip()
    // A folder beside the other cases, so the store of the scratch folder does not take the comment.
    const locked = `${folder}-locked`
    mkdirSync(locked)
    writeFileSync(path.join(locked, 'three.md'), '# Three\n')
    chmodSync(locked, 0o555)
    try {
      // A root user writes into a read-only folder, so the case has nothing to check there.
      if (process.getuid?.() === 0) this.skip()
      await vscode.window.showTextDocument(fileIn(locked, 'three.md'))
      await assert.rejects(save(fileIn(locked, 'three.md'), 'Kept text.'), (error: unknown) =>
        String(error instanceof Error ? error.message : error).includes(locked),
      )
      assert.equal(existsSync(path.join(locked, '.y-review')), false)
    } finally {
      chmodSync(locked, 0o755)
    }
  })

  it('the task views show one branch for each root of an open tab', async () => {
    const { tasks } = await api()
    assert.ok(tasks)
    const project = tasks.view('project')
    const [first, second, repo] = ['a', 'b', 'repo'].map((name) => `${folder}-tree-${name}`)
    ;[first, second, repo].forEach((dir) => mkdirSync(dir ?? '', { recursive: true }))
    writeFileSync(path.join(first ?? '', 'x.md'), '# X\n')
    writeFileSync(path.join(second ?? '', 'y.md'), '# Y\n')
    writeFileSync(path.join(repo ?? '', 'z.md'), '# Z\n')
    // A full scan of the repository would show these TODO items, because no tab holds their files.
    writeFileSync(path.join(repo ?? '', 'w.md'), '<!-- TODO: tracked and closed -->\n')
    writeFileSync(path.join(repo ?? '', 'u.md'), '<!-- TODO: untracked and closed -->\n')
    const run = (...args: string[]): string =>
      execFileSync(
        'git',
        ['-c', 'user.name=Yreview Test', '-c', 'user.email=reviewer@example.com', ...args],
        { cwd: repo, encoding: 'utf8' },
      )
    run('init', '-q', '-b', 'main')
    run('add', 'z.md', 'w.md')
    run('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'init')
    const trace = `${folder}-trace.json`
    const branches = (): readonly Row[] =>
      project.topRows().filter((row) => row.kind === 'folder' && row.folder.kind === 'outside')
    const branchOf = (dir: string): Row | undefined =>
      branches().find(
        (row) => row.kind === 'folder' && row.folder.name.startsWith(`${path.basename(dir)} (`),
      )
    // With "always", the git extension opens the repository of an open file outside every workspace folder.
    const gitSettings = vscode.workspace.getConfiguration('git')
    await gitSettings.update(
      'openRepositoryInParentFolders',
      'always',
      vscode.ConfigurationTarget.Global,
    )
    const shown: string[] = []
    const original = vscode.window.showWarningMessage
    try {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
      await vscode.window.showTextDocument(fileIn(first ?? '', 'x.md'), { preview: false })
      await save(fileIn(first ?? '', 'x.md'), 'Tree note A.')
      await tasks.model.refresh()
      assert.ok(await until(() => branches().length === 1), 'no branch for the loose folder')
      const branch = branchOf(first ?? '') ?? assert.fail('no branch of the first folder')
      assert.deepEqual(
        branch.tasks.map((task) => [task.path, task.text]),
        [['x.md', 'Tree note A.']],
      )
      const task = branch.tasks[0] ?? assert.fail('no task')
      const row = project.rowOf(task) ?? assert.fail('no row')
      const item = project.getTreeItem(row)
      assert.equal(item.checkboxState, undefined)
      assert.equal(project.getTreeItem(branch).checkboxState, undefined)
      const tooltip = item.tooltip as vscode.MarkdownString
      // The tooltip text is escaped Markdown, so the check drops the escape marks.
      assert.ok(
        tooltip.value
          .replaceAll('\\', '')
          .replaceAll('&nbsp;', ' ')
          .endsWith('The agent works in the workspace folder, so it does not take this task.'),
        tooltip.value,
      )
      assert.equal(project.view.badge, undefined)
      assert.ok(
        tasks
          .view('currentFile')
          .rows()
          .tasks.some((entry) => entry.text === 'Tree note A.'),
        'the Current File view does not show the loose file',
      )

      await vscode.window.showTextDocument(fileIn(second ?? '', 'y.md'), { preview: false })
      await save(fileIn(second ?? '', 'y.md'), 'Tree note B.')
      process.env.GIT_TRACE2_EVENT = trace
      await vscode.window.showTextDocument(fileIn(repo ?? '', 'z.md'), { preview: false })
      await save(fileIn(repo ?? '', 'z.md'), 'Tree note repo.')
      const gitExtension = await gitExtensionApi()
      assert.ok(
        await until(() =>
          gitExtension.repositories.some((each) => samePath(each.rootUri.fsPath, repo ?? '')),
        ),
        'the git extension did not open the repository of the open file',
      )
      await tasks.model.refresh()
      assert.ok(await until(() => branches().length === 3), `${branches().length} branches`)
      assert.ok(!tasks.model.roots().some((root) => samePath(root, repo ?? '')))
      const repoTasks = branchOf(repo ?? '')?.tasks ?? []
      assert.deepEqual(
        repoTasks.map((entry) => [entry.path, entry.text]),
        [['z.md', 'Tree note repo.']],
      )
      assert.ok(repoTasks.every((entry) => entry.revision !== 'worktree'))
      delete process.env.GIT_TRACE2_EVENT
      const calls = gitCallsIn(trace, repo ?? '')
      assert.ok(calls.length > 0, 'the trace holds no git call of the repository')
      assert.deepEqual(
        calls.filter(
          (args) =>
            (args.includes('grep') && args.includes('--untracked')) ||
            (args.includes('ls-files') && args.includes('--others')),
        ),
        [],
      )

      Object.assign(vscode.window, {
        showWarningMessage: (text: string) => {
          shown.push(text)
          return Promise.resolve(undefined)
        },
      })
      await vscode.commands.executeCommand(
        'yreview.sendTasks',
        branches().flatMap((each) => each.tasks),
      )
      await vscode.commands.executeCommand(
        'yreview.copyTasks',
        branches().flatMap((each) => each.tasks),
      )
      assert.deepEqual(shown, [
        'The agent works in the workspace folder, so it does not take these tasks.',
        'The agent works in the workspace folder, so it does not take these tasks.',
      ])
      assert.deepEqual(tasks.chosenTasks(), [])

      const tab = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .find(
          (each) =>
            each.input instanceof vscode.TabInputText &&
            each.input.uri.fsPath === fileIn(second ?? '', 'y.md').fsPath,
        )
      await vscode.window.tabGroups.close(tab ?? assert.fail('no tab of the second file'))
      assert.ok(
        await until(() => branches().length === 2 && branchOf(second ?? '') === undefined),
        'the branch of the closed tab stays',
      )
    } finally {
      delete process.env.GIT_TRACE2_EVENT
      Object.assign(vscode.window, { showWarningMessage: original })
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
      await gitSettings.update(
        'openRepositoryInParentFolders',
        undefined,
        vscode.ConfigurationTarget.Global,
      )
    }
  })
})
