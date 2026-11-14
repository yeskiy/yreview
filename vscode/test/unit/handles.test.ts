import assert from 'node:assert/strict'

import Sqids from 'sqids'

import { handleOf, keyOf, matchKey, namesTodo } from '../../src/core/handles'
import { isHandle, isLong, isSafe } from '../../src/core/taskIds'

describe('handles', () => {
  const one = 'c3f9a12aabbccddeeff00112233445566778899a'
  const two = '0123456789abcdef0123456789abcdef01234567'
  const todo = 'todo-0123456789abcdef0123456789abcdef01234567-88'
  const otherLine = 'todo-0123456789abcdef0123456789abcdef01234567-91'
  const counted = (step: number): string => `${step.toString(16).padStart(8, '0')}${'0'.repeat(32)}`
  const steps = Array.from({ length: 10_000 }, (_, step) => step)
  const keyOfHandle = (id: string) => keyOf(handleOf(id)) ?? assert.fail(`no key for ${id}`)

  it('a handle is the same for the same identifier every time', () => {
    const first = handleOf(one)
    handleOf(two)
    handleOf(todo)
    assert.equal(handleOf(one), first)
  })

  it('ten thousand identifiers with different keys give ten thousand handles', () => {
    assert.equal(new Set(steps.map((step) => handleOf(counted(step)))).size, 10_000)
  })

  it('every handle of ten thousand identifiers passes the rules', () => {
    steps.forEach((step) => {
      const handle = handleOf(counted(step))
      assert.ok(isHandle(handle), handle)
      assert.ok(isSafe(handle), handle)
      assert.equal(isLong(handle), false, handle)
    })
  })

  it('two identifiers that share the first eight characters share a handle', () => {
    assert.equal(handleOf(`c3f9a12a${'0'.repeat(32)}`), handleOf(`c3f9a12a${'f'.repeat(32)}`))
  })

  it('a comment handle reads back as the key of that comment', () => {
    assert.deepEqual(keyOf(handleOf(one)), { kind: 'comment', prefix: 'c3f9a12a' })
  })

  it('a todo handle carries its line back', () => {
    assert.deepEqual(keyOf(handleOf(todo)), { kind: 'todo', prefix: '01234567', order: 88 })
  })

  it('a todo of another line gives another handle', () => {
    assert.notEqual(handleOf(todo), handleOf(otherLine))
  })

  it('a todo handle is never as short as a comment handle of the same key', () => {
    assert.ok(handleOf(todo).length > handleOf(two).length)
  })

  it('a handle of the longest line still fits the rule', () => {
    const handle = handleOf(`todo-${'f'.repeat(40)}-9999999`)
    assert.ok(isHandle(handle), handle)
    assert.ok(handle.length <= 15, `the longest handle held ${handle.length} characters: ${handle}`)
  })

  it('a long identifier reads back as itself', () => {
    assert.deepEqual(keyOf(one), { kind: 'exact', id: one })
    assert.deepEqual(keyOf(todo), { kind: 'exact', id: todo })
  })

  it('a value that is neither gives no key', () => {
    assert.equal(keyOf('../../etc/passwd'), undefined)
    assert.equal(keyOf('--exec=calc.exe'), undefined)
    assert.equal(keyOf(''), undefined)
  })

  it('a handle finds the identifier it stands for', () => {
    assert.deepEqual(matchKey(keyOfHandle(one), [two, one]), { kind: 'one', id: one })
  })

  it('a long identifier finds itself', () => {
    assert.deepEqual(matchKey({ kind: 'exact', id: one }, [two, one]), { kind: 'one', id: one })
  })

  it('a handle that names no task finds nothing', () => {
    assert.deepEqual(matchKey(keyOfHandle(one), [two]), { kind: 'none' })
  })

  it('a handle that names two tasks reports the count', () => {
    const first = `c3f9a12a${'0'.repeat(32)}`
    const second = `c3f9a12a${'f'.repeat(32)}`
    assert.deepEqual(matchKey(keyOfHandle(first), [first, second, two]), {
      kind: 'many',
      count: 2,
    })
  })

  it('a todo handle finds only the line it names', () => {
    assert.deepEqual(matchKey(keyOfHandle(todo), [otherLine, todo]), { kind: 'one', id: todo })
  })

  it('a todo handle never finds a comment', () => {
    assert.deepEqual(matchKey(keyOfHandle(todo), [two]), { kind: 'none' })
  })

  it('a comment handle never finds a todo', () => {
    assert.deepEqual(matchKey(keyOfHandle(two), [todo]), { kind: 'none' })
  })

  it('tells a todo value from a comment value in both forms', () => {
    assert.ok(namesTodo(todo))
    assert.ok(namesTodo(handleOf(todo)))
    assert.equal(namesTodo(one), false)
    assert.equal(namesTodo(handleOf(one)), false)
    assert.equal(namesTodo('../../etc/passwd'), false)
  })

  it('a second pass over the same list changes nothing', () => {
    const once = [one, todo].map(handleOf)
    assert.deepEqual(once.map(handleOf), once)
  })

  it('reads a handle of a key over 32 bits as nothing', () => {
    const sqids = new Sqids({
      alphabet: 'abcdefghijklmnopqrstuvwxyz0123456789',
      blocklist: new Set(),
    })
    assert.equal(keyOf(`y${sqids.encode([2 ** 32])}`), undefined)
  })

  it('finds no todo whose order is no number', () => {
    const key = keyOfHandle('todo-0123456789abcdef0123456789abcdef01234567-0')
    assert.deepEqual(matchKey(key, ['todo-01234567-']), { kind: 'none' })
  })
})
