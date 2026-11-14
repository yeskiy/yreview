import { strict as assert } from 'node:assert'

import { ID_RULE, parseResolve } from '../../../src/bridge/resolveRequest'

const hex = (seed: string): string => seed.repeat(40).slice(0, 40)
const first = hex('c3f9a12aabbccddeeff00112233445566778899a')
const second = hex('ab')
const third = hex('0123456789')
const body = (ids: readonly unknown[]): string => JSON.stringify({ ids })
const reasonOf = (text: string): string => {
  const parsed = parseResolve(text)
  return parsed.kind === 'bad' ? parsed.reason : assert.fail(`the body was read: ${text}`)
}
const idsOf = (text: string): readonly string[] => {
  const parsed = parseResolve(text)
  return parsed.kind === 'ids' ? parsed.ids : assert.fail(parsed.reason)
}

describe('resolve request (ResolveRequestTest.kt)', () => {
  it('reads a short handle', () => assert.deepEqual(idsOf(body(['yk3x9a'])), ['yk3x9a']))
  it('reads a handle beside an identifier of an older build', () =>
    assert.deepEqual(idsOf(body(['yk3x9a', first])), ['yk3x9a', first]))
  it('refuses a short value that carries no prefix', () =>
    assert.equal(reasonOf(body(['k3x9a'])), ID_RULE))
  it('names the handle form in the reason', () =>
    assert.match(reasonOf(body(['k3x9a'])), /a short handle in the form y/))
  it('reads one id', () => assert.deepEqual(idsOf(body([first])), [first]))
  it('reads several ids', () =>
    assert.deepEqual(idsOf(body([first, second, third])), [first, second, third]))
  it('keeps one copy of a repeated id', () =>
    assert.deepEqual(idsOf(body([first, first])), [first]))
  it('refuses a body that is not JSON', () =>
    assert.equal(reasonOf('{ids:'), 'The body must be a JSON object.'))
  it('refuses a body that is not an object', () =>
    assert.equal(reasonOf('[]'), 'The body must be a JSON object.'))
  it('refuses a body without the ids field', () =>
    assert.equal(reasonOf('{}'), 'The body must hold the field ids and no other field.'))
  it('refuses a field the contract does not name', () =>
    assert.equal(
      reasonOf('{"ids":["y12"],"x":1}'),
      'The body must hold the field ids and no other field.',
    ))
  it('refuses an empty list', () =>
    assert.equal(reasonOf(body([])), 'The field ids must hold one id or more.'))
  it('refuses more ids than the contract allows', () =>
    assert.equal(
      reasonOf(body(Array.from({ length: 201 }, (_, at) => `y${at}aa`))),
      'The field ids must hold 200 ids or fewer.',
    ))
  it('refuses an id that is not a string', () =>
    assert.equal(reasonOf(body([1])), 'Every id must be a string.'))
  it('refuses an id that is too short', () => assert.equal(reasonOf(body(['c3f9'])), ID_RULE))
  it('refuses an id that holds a character outside hexadecimal', () =>
    assert.equal(reasonOf(body([`${first.slice(0, 39)}g`])), ID_RULE))
  it('refuses an id in upper case', () =>
    assert.equal(reasonOf(body([first.toUpperCase()])), ID_RULE))
  it('reads the identifier of a todo task', () =>
    assert.deepEqual(idsOf(body([`todo-${first}-3`])), [`todo-${first}-3`]))
  it('refuses a todo identifier without a line number', () =>
    assert.equal(reasonOf(body([`todo-${first}`])), ID_RULE))
  it('refuses an id that starts with a hyphen', () => assert.equal(reasonOf(body(['-x'])), ID_RULE))
  it('refuses an id that holds a git argument', () =>
    assert.equal(reasonOf(body(['--upload-pack=x'])), ID_RULE))
  it('refuses an id that holds a path', () => assert.equal(reasonOf(body(['../a'])), ID_RULE))
})
