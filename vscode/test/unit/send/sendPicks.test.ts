import { strict as assert } from 'node:assert'

import {
  EVERY_NAME,
  type SendPick,
  type SessionChoice,
  buttonText,
  sendPickOf,
} from '../../../src/bridge/sendPicks'
import { type SendRoute, sendRouteOf } from '../../../src/bridge/sendReport'

const pushes = (route: SendRoute): boolean => route === 'channel'
const first: SessionChoice = { key: 'aaaaaaaaaaaaaaaa', name: 'Claude 1' }
const second: SessionChoice = { key: 'bbbbbbbbbbbbbbbb', name: 'Claude 2' }
const NONE: SendPick = { kind: 'none' }

const choicesOf = (pick: SendPick): readonly SessionChoice[] => {
  assert.equal(pick.kind, 'ask')
  return pick.kind === 'ask' ? pick.choices : []
}

describe('send pick (SendPicksTest.kt)', () => {
  it('nothing to reach means no session to pick', () =>
    assert.deepEqual(sendPickOf([], true), NONE))

  it('a send that no route can push names no session', () =>
    assert.deepEqual(sendPickOf([first, second], false), NONE))

  it('a folder store route never allows a session target', () => {
    const route = sendRouteOf(true, 2, false)
    assert.equal(route, 'noRepository')
    assert.deepEqual(sendPickOf([first, second], pushes(route)), NONE)
  })

  it('one named session needs no question', () =>
    assert.deepEqual(sendPickOf([first], true), { kind: 'one', choice: first }))

  it('a second stream on the key of one tab still leaves one target', () => {
    const route = sendRouteOf(true, 1, true)
    assert.equal(route, 'channel')
    assert.deepEqual(sendPickOf([first], pushes(route)), { kind: 'one', choice: first })
  })

  it('a stream with no key sends the tasks to the clipboard', () => {
    const route = sendRouteOf(true, 0, true)
    assert.equal(route, 'noSession')
    assert.deepEqual(sendPickOf([], pushes(route)), NONE)
  })

  it('two tabs raise a question that ends with the row for every session', () => {
    const route = sendRouteOf(true, 2, true)
    const choices = choicesOf(sendPickOf([first, second], pushes(route)))
    assert.deepEqual(
      choices.map((choice) => choice.name),
      ['Claude 1', 'Claude 2', EVERY_NAME],
    )
    assert.deepEqual(
      choices.map((choice) => choice.key),
      ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb', undefined],
    )
    assert.equal(choices.at(-1)?.name, EVERY_NAME)
  })

  it('the row that holds every session promises the channel and nothing more', () =>
    assert.equal(EVERY_NAME, 'Every session that reads the channel'))

  it('the button names one session', () =>
    assert.equal(
      buttonText('Send Checked (3)', { kind: 'one', choice: first }, true),
      'Send Checked (3) to Claude 1',
    ))

  it('the button shows three dots when a choice follows', () =>
    assert.equal(
      buttonText('Send Checked (3)', sendPickOf([first, second], true), true),
      'Send Checked (3) to a Session...',
    ))

  it('the button keeps its plain words when nothing can take a send', () => {
    assert.deepEqual(sendPickOf([], true), NONE)
    assert.equal(buttonText('Send All (2)', NONE, true), 'Send All (2)')
  })

  it('the button keeps its plain words with no task', () =>
    assert.equal(
      buttonText('Send to the Agent', { kind: 'one', choice: first }, false),
      'Send to the Agent',
    ))

  it('two tabs of one name give two rows a user can tell apart', () => {
    const choices = choicesOf(
      sendPickOf(
        [
          { ...first, name: 'fix the parser' },
          { ...second, name: 'fix the parser' },
        ],
        true,
      ),
    )
    assert.deepEqual(
      choices.map((choice) => choice.name),
      ['fix the parser (1)', 'fix the parser (2)', EVERY_NAME],
    )
    assert.deepEqual(
      choices.map((choice) => choice.key),
      [first.key, second.key, undefined],
    )
  })

  it('a tab named after the row for every session still gives two rows apart', () =>
    assert.deepEqual(
      choicesOf(sendPickOf([{ ...first, name: EVERY_NAME }, second], true)).map(
        (choice) => choice.name,
      ),
      [`${EVERY_NAME} (1)`, 'Claude 2', `${EVERY_NAME} (2)`],
    ))

  it('the button keeps the plain name of a single session', () =>
    assert.equal(
      buttonText('Send Checked (3)', sendPickOf([first], true), true),
      'Send Checked (3) to Claude 1',
    ))
})
