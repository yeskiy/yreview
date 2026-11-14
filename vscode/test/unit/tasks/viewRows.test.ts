import assert from 'node:assert/strict'

import { type ChangeFacts, changesEmptyText } from '../../../src/tasks/changeTab'
import type { ReviewTask } from '../../../src/tasks/reviewTask'
import { DEFAULT_TAB, type TabState } from '../../../src/tasks/tabState'
import type { TodoFilter } from '../../../src/tasks/taskFilter'
import { checkKey } from '../../../src/tasks/taskChecks'
import type { RepositoryTasks } from '../../../src/tasks/taskScan'
import {
  NO_FILE,
  NO_TASK,
  type ViewInput,
  childRows,
  deriveView,
  finishedText,
  pathKey,
  rowsOfLayout,
  viewDescription,
} from '../../../src/tasks/viewRows'
import { task, todo } from './fixtures'

const repo = (tasks: readonly ReviewTask[], root = 'E:/repo'): RepositoryTasks => ({
  root,
  commit: 'c1',
  tasks,
})

const derive = (
  tasks: readonly ReviewTask[],
  tab: Partial<TabState> = {},
  input: Partial<ViewInput> = {},
) =>
  deriveView({
    repositories: [repo(tasks)],
    tab: { ...DEFAULT_TAB, ...tab },
    filters: [],
    folderOf: () => '',
    keep: () => true,
    ...input,
  })

const other = task({ id: 'c'.repeat(40), path: 'src/Other.kt', filePath: 'E:/repo/src/Other.kt' })

describe('view rows', () => {
  it('one repository shows the path', () => {
    assert.equal(derive([task()]).layout.files[0]?.name, 'src/Main.kt')
  })

  it('several repositories show the root name first', () => {
    const at = (root: string): ReviewTask =>
      task({ rootPath: root, filePath: `${root}/src/Main.kt` })
    const { layout } = derive(
      [],
      {},
      {
        repositories: [repo([at('E:/r/app')], 'E:/r/app'), repo([at('E:/r/lib')], 'E:/r/lib')],
      },
    )
    assert.deepEqual(
      layout.files.map((group) => group.name),
      ['app/src/Main.kt', 'lib/src/Main.kt'],
    )
  })

  it('the resolved switch drops a resolved comment', () => {
    assert.deepEqual(derive([task({ resolved: true })]).tasks, [])
  })

  it('the resolved switch keeps it while it is on', () => {
    assert.equal(derive([task({ resolved: true })], { showResolved: true }).tasks.length, 1)
  })

  it('a TODO filter keeps the TODO items of its patterns', () => {
    const filters: readonly TodoFilter[] = [{ name: 'Mine', patterns: ['\\bfixme\\b.*'] }]
    const { tasks } = derive([todo(), task()], { todoFilterName: 'Mine' }, { filters })
    assert.deepEqual(
      tasks.map((entry) => entry.kind),
      ['comment'],
    )
  })

  it('a TODO filter that the settings lost keeps every row', () => {
    assert.equal(derive([todo(), task()], { todoFilterName: 'Gone' }).tasks.length, 2)
  })

  it('the changed files keep their tasks only', () => {
    const { tasks } = derive([task(), other], {}, { changed: new Set(['E:/repo/src/Main.kt']) })
    assert.deepEqual(
      tasks.map((entry) => entry.path),
      ['src/Main.kt'],
    )
  })

  it('keep drops a task', () => {
    assert.deepEqual(derive([task()], {}, { keep: () => false }).tasks, [])
  })

  it('the folder grouping reads folderOf', () => {
    const { layout } = derive([task()], { byFolder: true }, { folderOf: () => 'app' })
    const rows = rowsOfLayout('project', layout)
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.kind, 'folder')
    assert.equal(rows[0]?.kind === 'folder' ? rows[0].folder.name : '', 'app')
    assert.equal(rows[0]?.kind === 'folder' ? rows[0].folder.kind : '', 'folder')
  })

  it('the rows carry ids that stay apart', () => {
    const root = task({ id: 'd'.repeat(40), path: 'Root.kt', filePath: 'E:/repo/Root.kt' })
    const { layout } = derive([task(), root], { byDirectory: true })
    const rows = rowsOfLayout('project', layout)
    assert.deepEqual(
      rows.map((row) => row.id),
      ['project/d:src', 'project/f:Root.kt'],
    )
    const file = rows[1] ?? assert.fail('no file row')
    assert.deepEqual(
      childRows(file).map((row) => row.id),
      [`project/f:Root.kt/t:${checkKey(root)}`],
    )
  })

  it('the empty words of each view', () => {
    const facts: ChangeFacts = { gitFound: true, files: new Set() }
    assert.deepEqual(
      [
        finishedText('project', facts, false),
        finishedText('currentFile', facts, true),
        finishedText('currentFile', facts, false),
        finishedText('changes', facts, false),
      ],
      [NO_TASK, NO_TASK, NO_FILE, changesEmptyText(facts)],
    )
  })

  it('the description names the changed state only', () => {
    assert.equal(viewDescription(DEFAULT_TAB), undefined)
    assert.equal(
      viewDescription({
        ...DEFAULT_TAB,
        kindFilter: 'todos',
        todoFilterName: 'Mine',
        scopeGlob: 'src/**',
        showResolved: true,
      }),
      'TODO Items Only, Mine, src/**, resolved shown',
    )
  })

  it('a path key on Windows ignores the case and the slash', () => {
    assert.equal(pathKey('C:\\A\\b.ts', 'win32'), 'c:/a/b.ts')
    assert.equal(pathKey('/A/b.ts', 'linux'), '/A/b.ts')
  })
})
