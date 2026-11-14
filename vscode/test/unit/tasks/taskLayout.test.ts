import assert from 'node:assert/strict'
import type { ReviewTask } from '../../../src/tasks/reviewTask'
import { folderCount, folderTitle } from '../../../src/tasks/taskLabels'
import {
  MAX_DEPTH,
  type TaskFolder,
  type TaskGrouping,
  type TaskLayout,
  groupTasks,
  layoutTasks,
  rowsOf,
  tasksOfFolder,
  tasksOfLayout,
} from '../../../src/tasks/taskTree'
import { todo } from './fixtures'

const item = (id: string, path: string, line = 1, folder = ''): ReviewTask =>
  todo({
    id,
    path,
    startLine: line,
    endLine: line,
    text: `work on ${id}`,
    filePath: `/repo/${path}`,
    rootPath: '/repo',
    folder,
  })

const groups = (...tasks: ReviewTask[]) => groupTasks(tasks)

const grouping = (change: Partial<TaskGrouping> = {}): TaskGrouping => ({
  byFolder: false,
  byDirectory: false,
  flatten: false,
  ...change,
})

const flat = grouping()
const byDirectory = grouping({ byDirectory: true })

const deepPath = (folders: number): string => `${Array<string>(folders).fill('d').join('/')}/A.kt`

const depthOfFolder = (folder: TaskFolder): number =>
  1 + Math.max(0, ...folder.folders.map(depthOfFolder))

const depthOf = (layout: TaskLayout): number => Math.max(0, ...layout.folders.map(depthOfFolder))

const deepestFolder = (folder: TaskFolder): TaskFolder => {
  const [inner, ...others] = folder.folders
  return inner === undefined || others.length > 0 ? folder : deepestFolder(inner)
}

const single = <T>(items: readonly T[]): T => {
  const [only] = items
  assert.equal(items.length, 1)
  assert.ok(only !== undefined)
  return only
}

describe('task layout', () => {
  it('keeps the files at the top when no toggle is on', () => {
    const layout = layoutTasks(groups(item('a', 'src/A.kt'), item('b', 'web/B.kt')), flat)

    assert.deepEqual(layout.folders, [])
    assert.deepEqual(
      layout.files.map((file) => file.path),
      ['src/A.kt', 'web/B.kt'],
    )
    assert.deepEqual(
      layout.files.map((file) => file.name),
      ['src/A.kt', 'web/B.kt'],
    )
  })

  it('a layout of no task holds no row', () => {
    assert.equal(rowsOf(layoutTasks([], flat)), 0)
  })

  it('a flat layout counts one row for each file', () => {
    assert.equal(rowsOf(layoutTasks(groups(item('a', 'src/A.kt'), item('b', 'web/B.kt')), flat)), 2)
  })

  it('a layout counts a folder row and a file row of the root together', () => {
    assert.equal(
      rowsOf(layoutTasks(groups(item('a', 'src/A.kt'), item('b', 'README.md')), byDirectory)),
      2,
    )
  })

  it('puts the files under their workspace folder', () => {
    const layout = layoutTasks(
      groups(item('a', 'src/A.kt', 1, 'core'), item('b', 'web/B.kt', 1, 'app')),
      grouping({ byFolder: true }),
    )

    assert.deepEqual(
      layout.folders.map((folder) => folder.name),
      ['app', 'core'],
    )
    assert.deepEqual(
      layout.folders.map((folder) => folder.kind),
      ['folder', 'folder'],
    )
    assert.deepEqual(
      layout.folders[0]?.files.map((file) => file.path),
      ['web/B.kt'],
    )
    assert.deepEqual(layout.files, [])
  })

  it('leaves a file with no workspace folder at the top', () => {
    const layout = layoutTasks(
      groups(item('a', 'src/A.kt', 1, 'core'), item('b', 'notes.md')),
      grouping({ byFolder: true }),
    )

    assert.deepEqual(
      layout.folders.map((folder) => folder.name),
      ['core'],
    )
    assert.deepEqual(
      layout.files.map((file) => file.path),
      ['notes.md'],
    )
  })

  it('builds one folder row for each directory segment', () => {
    const layout = layoutTasks(groups(item('a', 'src/main/A.kt')), byDirectory)

    const src = single(layout.folders)
    assert.equal(src.name, 'src')
    assert.equal(src.kind, 'directory')
    const main = single(src.folders)
    assert.equal(main.name, 'main')
    assert.deepEqual(
      main.files.map((file) => file.path),
      ['src/main/A.kt'],
    )
  })

  it('shows the file name only under a directory row', () => {
    const layout = layoutTasks(groups(item('a', 'src/main/A.kt')), byDirectory)

    assert.deepEqual(
      single(single(layout.folders).folders).files.map((file) => file.name),
      ['A.kt'],
    )
  })

  it('keeps a file of the root beside the directory rows', () => {
    const layout = layoutTasks(groups(item('a', 'src/A.kt'), item('b', 'README.md')), byDirectory)

    assert.deepEqual(
      layout.folders.map((folder) => folder.name),
      ['src'],
    )
    assert.deepEqual(
      layout.files.map((file) => file.path),
      ['README.md'],
    )
  })

  it('puts the whole directory path on one row when the tree is flat', () => {
    const layout = layoutTasks(
      groups(item('a', 'src/main/A.kt'), item('b', 'src/main/B.kt'), item('c', 'src/test/C.kt')),
      grouping({ byDirectory: true, flatten: true }),
    )

    assert.deepEqual(
      layout.folders.map((folder) => folder.name),
      ['src/main', 'src/test'],
    )
    assert.equal(
      layout.folders.every((folder) => folder.folders.length === 0),
      true,
    )
    assert.deepEqual(
      layout.folders[0]?.files.map((file) => file.name),
      ['A.kt', 'B.kt'],
    )
  })

  it('ignores the flatten toggle while the directory toggle is off', () => {
    const layout = layoutTasks(groups(item('a', 'src/main/A.kt')), grouping({ flatten: true }))

    assert.deepEqual(layout.folders, [])
    assert.deepEqual(
      layout.files.map((file) => file.path),
      ['src/main/A.kt'],
    )
  })

  it('puts the directory rows under the workspace folder row', () => {
    const layout = layoutTasks(
      groups(item('a', 'src/main/A.kt', 1, 'core')),
      grouping({ byFolder: true, byDirectory: true }),
    )

    const folder = single(layout.folders)
    assert.equal(folder.name, 'core')
    assert.equal(single(folder.folders).name, 'src')
    assert.deepEqual(
      single(single(folder.folders).folders).files.map((file) => file.name),
      ['A.kt'],
    )
  })

  it('counts every task under a folder row', () => {
    const layout = layoutTasks(
      groups(item('a', 'src/main/A.kt'), item('b', 'src/main/A.kt', 9), item('c', 'src/test/C.kt')),
      byDirectory,
    )

    assert.equal(tasksOfFolder(single(layout.folders)).length, 3)
    assert.equal(folderCount(single(layout.folders)), '3 tasks')
    assert.equal(folderTitle(single(layout.folders)), 'src')
  })

  it('reads every task of the layout back in row order', () => {
    const layout = layoutTasks(groups(item('a', 'src/A.kt'), item('b', 'README.md')), byDirectory)

    assert.deepEqual(
      tasksOfLayout(layout).map((task) => task.id),
      ['a', 'b'],
    )
  })

  it('makes an empty layout from no task', () => {
    const layout = layoutTasks([], grouping({ byFolder: true, byDirectory: true }))

    assert.deepEqual(layout.folders, [])
    assert.deepEqual(layout.files, [])
    assert.deepEqual(tasksOfLayout(layout), [])
  })

  // --- A path that another person wrote ---

  it('a path of many folders stops at the depth cap', () => {
    const layout = layoutTasks(groups(item('a', deepPath(20_000))), byDirectory)

    assert.equal(depthOf(layout), MAX_DEPTH)
    assert.deepEqual(
      tasksOfLayout(layout).map((task) => task.id),
      ['a'],
      'the task keeps its row',
    )
  })

  it('the row at the depth cap shows the rest of the path', () => {
    const layout = layoutTasks(groups(item('a', deepPath(MAX_DEPTH + 2))), byDirectory)

    assert.deepEqual(
      deepestFolder(single(layout.folders)).files.map((file) => file.name),
      ['d/d/A.kt'],
    )
  })
})
