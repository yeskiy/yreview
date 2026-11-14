import assert from 'node:assert/strict'

import {
  assignTodoIds,
  isHandle,
  isKnown,
  isLong,
  isSafe,
  isTodo,
  legacyTodoId,
  repositoryOf,
  todoId,
} from '../../src/core/taskIds'

describe('taskIds', () => {
  const comment = '9f1c2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b'
  const todo = todoId(
    '',
    'src/main/kotlin/Parser.kt',
    'TODO: drop this once the anchor repair lands',
    0,
  )

  it('makes an identifier the channel accepts', () => {
    assert.ok(isSafe(todo), todo)
  })

  it('gives the same identifier for the same item', () => {
    assert.equal(todoId('', 'a/B.kt', 'TODO: x', 0), todoId('', 'a/B.kt', 'TODO: x', 0))
  })

  it('gives a new identifier when the file changes', () => {
    assert.notEqual(todoId('', 'a/B.kt', 'TODO: x', 0), todoId('', 'a/C.kt', 'TODO: x', 0))
  })

  it('gives a new identifier when the repository changes', () => {
    assert.notEqual(todoId('lib', 'a/B.kt', 'TODO: x', 0), todoId('app', 'a/B.kt', 'TODO: x', 0))
  })

  it('gives a new identifier when the text or the order changes', () => {
    const first = todoId('', 'a/B.kt', 'TODO: x', 0)
    assert.notEqual(first, todoId('', 'a/B.kt', 'TODO: y', 0))
    assert.notEqual(first, todoId('', 'a/B.kt', 'TODO: x', 1))
  })

  it('reads each run of white space in the text as one space', () => {
    assert.equal(todoId('', 'a/B.kt', 'TODO:  x\n  y ', 0), todoId('', 'a/B.kt', 'TODO: x y', 0))
  })

  it('keeps the form of an older identifier', () => {
    const legacy = legacyTodoId('a/B.kt', 12)
    assert.ok(isKnown(legacy), legacy)
    assert.ok(legacy.endsWith('-12'), legacy)
  })

  it('knows an identifier the plugin made', () => {
    assert.ok(isKnown(todo), todo)
    assert.ok(isKnown(comment), comment)
  })

  it('refuses an identifier the plugin never made', () => {
    assert.equal(isKnown('--upload-pack'), false)
    assert.equal(isKnown('../../etc/passwd'), false)
    assert.equal(isKnown('todo-0123456789abcdef0123456789abcdef01234567'), false)
    assert.equal(isKnown(comment.toUpperCase()), false)
  })

  it('knows a todo identifier', () => {
    assert.ok(isTodo(todo))
    assert.equal(isTodo(comment), false)
  })

  it('refuses an identifier that holds a character the channel bans', () => {
    assert.equal(isSafe('todo:src%2FA.kt:88'), false)
    assert.equal(isSafe(''), false)
    assert.equal(isSafe('a b'), false)
    assert.equal(isSafe('a'.repeat(201)), false)
  })

  it('knows a handle', () => {
    assert.ok(isHandle('yd8pmsq91'))
    assert.ok(isKnown('yd8pmsq91'))
  })

  it('a handle is never a value of the store', () => {
    assert.equal(isLong('yd8pmsq91'), false)
    assert.equal(isTodo('yd8pmsq91'), false)
  })

  it('a value of the store is never a handle', () => {
    assert.equal(isHandle(comment), false)
    assert.equal(isHandle(todo), false)
    assert.ok(isLong(comment))
    assert.ok(isLong(todo))
  })

  it('refuses a short value that carries no prefix', () => {
    assert.equal(isHandle('d8pmsq91'), false)
    assert.equal(isKnown('d8pmsq91'), false)
  })

  it('refuses a handle that holds a character the rule bans', () => {
    assert.equal(isHandle('yD8PMSQ91'), false)
    assert.equal(isHandle('y-d8pmsq91'), false)
    assert.equal(isHandle('y'), false)
    assert.equal(isHandle(`y${'a'.repeat(33)}`), false)
  })

  it('a handle the channel refuses is never made', () => {
    assert.ok(isSafe('yd8pmsq91'))
  })
})

describe('todo ids', () => {
  const item = (text: string, line: number, path = 'src/Main.kt') => ({ path, text, line })

  it('two todo items on one line get two identifiers', () => {
    const ids = assignTodoIds('', [item('TODO: a', 4), item('TODO: b', 4)]).map((t) => t.id)
    assert.equal(new Set(ids).size, 2, ids.join())
  })

  it('two equal todo items on one line get two identifiers', () => {
    const ids = assignTodoIds('', [item('TODO: a', 4), item('TODO: a', 4)]).map((t) => t.id)
    assert.deepEqual(ids, [
      todoId('', 'src/Main.kt', 'TODO: a', 0),
      todoId('', 'src/Main.kt', 'TODO: a', 1),
    ])
  })

  it('the same path in two repositories gets two identifiers', () => {
    const [lib] = assignTodoIds(repositoryOf('E:/work', 'E:/work/lib'), [item('TODO: a', 4)])
    const [app] = assignTodoIds(repositoryOf('E:/work', 'E:/work/app'), [item('TODO: a', 4)])
    assert.notEqual(lib?.id, app?.id)
  })

  it('new lines above a todo item keep its identifier', () => {
    const before = assignTodoIds('', [item('TODO: a', 4), item('TODO: b', 9)])
    const after = assignTodoIds('', [item('TODO: a', 7), item('TODO: b', 12)])
    assert.deepEqual(
      after.map((t) => t.id),
      before.map((t) => t.id),
    )
  })

  it('the repository of a root names its place inside the project', () => {
    assert.equal(repositoryOf('E:/work', 'E:/work'), '')
    assert.equal(repositoryOf('E:/work', 'E:/work/lib'), 'lib')
    assert.equal(repositoryOf('E:/work', 'E:/workshop'), 'E:/workshop')
    assert.equal(repositoryOf(undefined, 'E:/work'), 'E:/work')
  })
})
