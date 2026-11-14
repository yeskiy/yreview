import assert from 'node:assert/strict'

import { KEY_OFFER_TEXT, type OfferHost, runKeyOffer } from '../../src/keyOfferCore'

const fake = (choice: string | undefined, stored?: string) => {
  const calls = { asked: 0, enabled: 0, saved: [] as string[] }
  const host: OfferHost = {
    answer: () => stored ?? calls.saved.slice(-1)[0],
    saveAnswer: (value) => {
      calls.saved.push(value)
      return Promise.resolve()
    },
    ask: (message) => {
      calls.asked += 1
      assert.equal(message, KEY_OFFER_TEXT)
      return Promise.resolve(choice)
    },
    enableKey: () => {
      calls.enabled += 1
      return Promise.resolve()
    },
  }
  return { host, calls }
}

describe('IntelliJ key offer', () => {
  it('Yes sets the setting and keeps the answer', async () => {
    const { host, calls } = fake('Yes')
    await runKeyOffer(host)
    assert.deepEqual(calls, { asked: 1, enabled: 1, saved: ['yes'] })
  })

  it('No sets nothing and keeps the answer', async () => {
    const { host, calls } = fake('No')
    await runKeyOffer(host)
    assert.deepEqual(calls, { asked: 1, enabled: 0, saved: ['no'] })
  })

  it('a second activation shows nothing', async () => {
    const { host, calls } = fake('Yes')
    await runKeyOffer(host)
    await runKeyOffer(host)
    assert.equal(calls.asked, 1)
  })

  it('a stored answer shows nothing', async () => {
    const { host, calls } = fake('Yes', 'no')
    await runKeyOffer(host)
    assert.deepEqual(calls, { asked: 0, enabled: 0, saved: [] })
  })

  it('a closed message keeps no answer, so the next activation asks again', async () => {
    const { host, calls } = fake(undefined)
    await runKeyOffer(host)
    assert.deepEqual(calls, { asked: 1, enabled: 0, saved: [] })
  })
})
