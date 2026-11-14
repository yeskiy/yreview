import { strict as assert } from 'node:assert'

import { pushFallback } from '../../../src/bridge/pushFallback'
import { type SendReport, sendNotice } from '../../../src/bridge/sendReport'

const PROMPT = 'Read AGENT.md in .git/y-review and work through tasks.json.'
const good: SendReport = { tasks: 4, batches: 0, streams: 1, targetName: 'Claude 1' }
const refused: SendReport = {
  tasks: 0,
  batches: 0,
  streams: 0,
  problem: '/tui/append-prompt answered 401.',
  targetName: 'Claude 1',
}

describe('push fallback (PushFallbackTest.kt)', () => {
  it('a good push copies nothing', () => {
    const result = pushFallback(good, PROMPT)
    assert.equal(result.clipboard, undefined)
    assert.notEqual(result.report.copied, true)
    assert.deepEqual(result.report, good)
  })

  it('a refused push hands the prompt to the clipboard', () => {
    const result = pushFallback(refused, PROMPT)
    assert.equal(result.clipboard, PROMPT)
    assert.equal(result.report.copied, true)
  })

  it('a refused push keeps the problem, so the warning stays', () => {
    const result = pushFallback(refused, PROMPT)
    assert.equal(result.report.problem, '/tui/append-prompt answered 401.')
    assert.equal(sendNotice(result.report).warning, true)
  })

  it('the notice of a refused push names the problem and the clipboard', () =>
    assert.equal(
      sendNotice(pushFallback(refused, PROMPT).report).text,
      '/tui/append-prompt answered 401. Yreview copied the prompt to the clipboard, so you can paste it.',
    ))

  it('a problem that copied nothing keeps the plain text', () =>
    assert.equal(sendNotice(refused).text, '/tui/append-prompt answered 401.'))
})
