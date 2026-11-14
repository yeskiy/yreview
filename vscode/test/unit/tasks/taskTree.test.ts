import assert from 'node:assert/strict'

import { flattenGroups, groupTasks } from '../../../src/tasks/taskTree'
import { todo } from './fixtures'

const task = (
  id: string,
  path: string,
  line: number,
  filePath = `/repo/${path}`,
  rootPath = '/repo',
) => todo({ id, path, startLine: line, endLine: line, text: `work on ${id}`, filePath, rootPath })

describe('task tree', () => {
  it('puts the tasks of one file under one group', () => {
    const groups = groupTasks([task('a', 'src/A.kt', 4), task('b', 'src/A.kt', 9)])
    assert.equal(groups.length, 1)
    assert.equal(groups[0]?.path, 'src/A.kt')
    assert.deepEqual(
      groups[0]?.tasks.map((it) => it.id),
      ['a', 'b'],
    )
  })

  it('sorts the files by path', () => {
    const groups = groupTasks([task('a', 'src/Z.kt', 1), task('b', 'src/A.kt', 1)])
    assert.deepEqual(
      groups.map((it) => it.path),
      ['src/A.kt', 'src/Z.kt'],
    )
  })

  it('sorts the tasks of a file by line', () => {
    const groups = groupTasks([task('a', 'src/A.kt', 90), task('b', 'src/A.kt', 12)])
    assert.deepEqual(
      groups[0]?.tasks.map((it) => it.id),
      ['b', 'a'],
    )
  })

  it('keeps one row for a task that arrives twice', () => {
    const groups = groupTasks([task('a', 'src/A.kt', 4), task('a', 'src/A.kt', 4)])
    assert.equal(groups[0]?.tasks.length, 1)
  })

  it('keeps two files that share a relative path', () => {
    const groups = groupTasks([
      task('a', 'src/A.kt', 4, '/one/src/A.kt', '/one'),
      task('a', 'src/A.kt', 4, '/two/src/A.kt', '/two'),
    ])
    assert.equal(groups.length, 1)
    assert.equal(groups[0]?.tasks.length, 2)
  })

  it('groups by the label the caller gives', () => {
    const groups = groupTasks(
      [task('a', 'src/A.kt', 4, undefined, '/one'), task('b', 'src/A.kt', 4, undefined, '/two')],
      (it) => `${it.rootPath}/${it.path}`,
    )
    assert.deepEqual(
      groups.map((it) => it.path),
      ['/one/src/A.kt', '/two/src/A.kt'],
    )
  })

  it('flattens the groups back into the tasks', () => {
    const groups = groupTasks([task('a', 'src/Z.kt', 1), task('b', 'src/A.kt', 1)])
    assert.deepEqual(
      flattenGroups(groups).map((it) => it.id),
      ['b', 'a'],
    )
  })

  it('makes no group from no task', () => {
    assert.deepEqual(groupTasks([]), [])
  })
})
