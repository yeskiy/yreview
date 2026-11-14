import assert from 'node:assert/strict'

import {
  KIND_FILTERS,
  accepts,
  acceptsKind,
  acceptsResolved,
  acceptsRules,
  applyFilter,
  readFilters,
} from '../../../src/tasks/taskFilter'
import { task, todo as todoTask } from './fixtures'

const TODO_RULE = '\\btodo\\b.*'
const FIXME_RULE = '\\bfixme\\b.*'

const todo = (id: string, rule: string) =>
  todoTask({
    id,
    path: 'src/A.kt',
    text: `TODO: work on ${id}`,
    filePath: '/repo/src/A.kt',
    rootPath: '/repo',
    patternRule: rule,
  })

const comment = task({
  id: 'c',
  path: 'src/A.kt',
  text: 'please rename this',
  filePath: '/repo/src/A.kt',
  rootPath: '/repo',
})

const todos = [todo('a', TODO_RULE), todo('b', FIXME_RULE)]

const ids = (tasks: readonly { readonly id: string }[]): readonly string[] =>
  tasks.map((it) => it.id)

describe('task filter', () => {
  it('keeps every row when the user chose no filter', () => {
    assert.equal(applyFilter([...todos, comment], undefined).length, 3)
  })

  it('keeps the rows of the chosen filter only', () => {
    assert.deepEqual(ids(applyFilter(todos, new Set([FIXME_RULE]))), ['b'])
  })

  it('keeps a review comment whatever the filter holds', () => {
    assert.deepEqual(ids(applyFilter([...todos, comment], new Set([FIXME_RULE]))), ['b', 'c'])
  })

  it('drops a todo whose pattern left the settings', () => {
    assert.equal(accepts(todo('a', TODO_RULE), new Set([FIXME_RULE])), false)
    assert.equal(accepts(todo('a', ''), new Set([FIXME_RULE])), false)
  })

  it('accepts a todo of the filter', () => {
    assert.equal(accepts(todo('a', TODO_RULE), new Set([TODO_RULE, FIXME_RULE])), true)
  })

  it('keeps no row when the filter holds no pattern', () => {
    assert.deepEqual(applyFilter(todos, new Set()), [])
  })

  it('keeps both kinds by default', () => {
    assert.deepEqual(ids(applyFilter([...todos, comment], undefined, 'both')), ['a', 'b', 'c'])
  })

  it('keeps the review comments only', () => {
    assert.deepEqual(ids(applyFilter([...todos, comment], undefined, 'comments')), ['c'])
  })

  it('keeps the todo items only', () => {
    assert.deepEqual(ids(applyFilter([...todos, comment], undefined, 'todos')), ['a', 'b'])
  })

  it('a todo filter does not bring back a hidden review comment', () => {
    assert.deepEqual(ids(applyFilter([...todos, comment], new Set([FIXME_RULE]), 'todos')), ['b'])
  })

  it('a todo filter does not remove the comments of the comments only view', () => {
    assert.deepEqual(ids(applyFilter([...todos, comment], new Set([FIXME_RULE]), 'comments')), [
      'c',
    ])
  })

  it('a comments only view keeps the comment when the todo filter holds no pattern', () => {
    assert.deepEqual(ids(applyFilter([...todos, comment], new Set(), 'comments')), ['c'])
  })

  it('the two filters answer on their own', () => {
    assert.equal(acceptsKind(comment, 'comments'), true)
    assert.equal(acceptsKind(comment, 'todos'), false)
    assert.equal(acceptsRules(comment, new Set([FIXME_RULE])), true)
    assert.equal(accepts(comment, new Set([FIXME_RULE]), 'todos'), false)
  })

  it('names every kind of the filter menu', () => {
    assert.deepEqual(
      KIND_FILTERS.map((it) => it.label),
      ['Comments and TODO Items', 'Review Comments Only', 'TODO Items Only'],
    )
  })

  it('the resolved switch keeps a resolved row only while it is on', () => {
    assert.equal(acceptsResolved(task({ resolved: true }), false), false)
    assert.equal(acceptsResolved(task({ resolved: true }), true), true)
    assert.equal(acceptsResolved(task(), false), true)
  })

  it('reads the todo filters of the settings and drops a bad entry', () => {
    assert.deepEqual(
      readFilters([
        { name: 'Mine', patterns: ['\\btodo\\b.*'] },
        { name: 3 },
        'x',
        { name: 'Two', patterns: ['a', 4] },
      ]),
      [
        { name: 'Mine', patterns: ['\\btodo\\b.*'] },
        { name: 'Two', patterns: ['a'] },
      ],
    )
    assert.deepEqual(readFilters(undefined), [])
  })
})
