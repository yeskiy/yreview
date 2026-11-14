import { strict as assert } from 'node:assert'

import { ID_REASON, PATH_REASON, TEXT_REASON } from '../../../src/bridge/batchBuilder'
import { type SendReport, sendNotice } from '../../../src/bridge/sendReport'
import { sendReason } from '../../../src/session/agentRows'
import { AGENTS, agentOf, isProduct } from '../../../src/session/catalog'

const report = (fields: Partial<SendReport>): SendReport => ({
  tasks: 0,
  batches: 0,
  streams: 0,
  ...fields,
})

describe('send notice (SendMessagesTest.kt)', () => {
  it('names the tasks and the sessions', () => {
    const notice = sendNotice(report({ tasks: 3, batches: 1, streams: 2 }))
    assert.equal(notice.text, 'Yreview sent 3 tasks to 2 sessions.')
    assert.equal(notice.warning, false)
  })

  it('names one task and one session in the singular', () =>
    assert.equal(
      sendNotice(report({ tasks: 1, batches: 1, streams: 1 })).text,
      'Yreview sent 1 task to 1 session.',
    ))

  it('warns when no session reads the bridge', () => {
    const notice = sendNotice(report({ tasks: 2, batches: 1, streams: 0 }))
    assert.equal(notice.warning, true)
    assert.ok(notice.text.includes('No session reads this project.'), notice.text)
  })

  it('says that the repository holds no open task', () => {
    const notice = sendNotice(report({ tasks: 0, batches: 0, streams: 1 }))
    assert.equal(notice.text, 'This repository has no open task.')
    assert.equal(notice.warning, false)
  })

  it('gives the problem back', () => {
    const notice = sendNotice(report({ problem: 'The repository app has no commit yet.' }))
    assert.equal(notice.text, 'The repository app has no commit yet.')
    assert.equal(notice.warning, true)
  })

  it('reports the problem before the empty repository', () => {
    const notice = sendNotice(report({ problem: 'The review bridge is not running.' }))
    assert.equal(notice.warning, true)
    assert.equal(notice.text, 'The review bridge is not running.')
  })

  it('names the count and the reason of every dropped task', () => {
    const notice = sendNotice(
      report({ tasks: 12, batches: 1, streams: 1, dropped: 2, dropReason: ID_REASON }),
    )
    assert.equal(
      notice.text,
      'Yreview sent 12 tasks to 1 session. 2 tasks were dropped, because the identifier breaks the channel rule.',
    )
    assert.equal(notice.warning, true, 'a dropped task is a loss the user must see')
  })

  it('names one dropped task in the singular', () => {
    const notice = sendNotice(
      report({ tasks: 1, batches: 1, streams: 1, dropped: 1, dropReason: TEXT_REASON }),
    )
    assert.ok(
      notice.text.endsWith('1 task was dropped, because the task has no text.'),
      notice.text,
    )
  })

  it('names the missing session on the clipboard route', () => {
    const notice = sendNotice(report({ tasks: 4, route: 'noSession', folder: '.git/y-review' }))
    assert.equal(
      notice.text,
      'No session reads this project, so Yreview wrote 4 tasks to .git/y-review and copied the prompt to the clipboard.',
    )
    assert.equal(notice.warning, false)
  })

  it('names the closed switch on the clipboard route', () => {
    const notice = sendNotice(report({ tasks: 4, route: 'channelOff', folder: '.git/y-review' }))
    assert.equal(
      notice.text,
      'The review channel is off in the settings, so Yreview wrote 4 tasks to .git/y-review and copied the prompt to the clipboard.',
    )
    assert.equal(notice.warning, false)
  })

  it('names the folder store on the clipboard route', () => {
    const notice = sendNotice(report({ tasks: 2, route: 'noRepository', folder: '.y-review' }))
    assert.equal(
      notice.text,
      'The review channel carries the tasks of a git repository only, so Yreview wrote 2 tasks to .y-review and copied the prompt to the clipboard.',
    )
    assert.equal(notice.warning, false)
  })

  it('reports a drop on the clipboard route too', () => {
    const notice = sendNotice(
      report({
        tasks: 4,
        dropped: 1,
        dropReason: PATH_REASON,
        route: 'noSession',
        folder: '.git/y-review',
      }),
    )
    assert.ok(
      notice.text.endsWith('1 task was dropped, because the path breaks the channel rule.'),
      notice.text,
    )
  })

  it('speaks even when every task was dropped', () => {
    const notice = sendNotice(report({ streams: 1, dropped: 3, dropReason: ID_REASON }))
    assert.ok(notice.text.includes('3 tasks were dropped'), notice.text)
    assert.equal(notice.warning, true)
  })

  it('reports no success when the builder left out every task', () => {
    const notice = sendNotice(
      report({ dropped: 2, dropReason: TEXT_REASON, targetName: 'Claude 2' }),
    )
    assert.equal(
      notice.text,
      'Yreview sent nothing. 2 tasks were dropped, because the task has no text.',
    )
    assert.equal(notice.warning, true)
  })

  it('names the one session that took the tasks', () => {
    const notice = sendNotice(report({ tasks: 3, batches: 1, streams: 1, targetName: 'Claude 2' }))
    assert.equal(notice.text, 'Yreview sent 3 tasks to Claude 2.')
    assert.equal(notice.warning, false)
  })

  it('warns when the chosen session left before the send', () => {
    const notice = sendNotice(report({ tasks: 3, batches: 1, streams: 0, targetName: 'Claude 2' }))
    assert.equal(notice.warning, true)
    assert.equal(notice.text, 'Claude 2 no longer reads this project, so Yreview sent nothing.')
  })

  it('keeps the plural sentence when the send names no target', () =>
    assert.equal(
      sendNotice(report({ tasks: 3, batches: 1, streams: 2 })).text,
      'Yreview sent 3 tasks to 2 sessions.',
    ))

  it('an agent with no channel gets a reason that names it', () => {
    const notice = sendNotice(
      report({
        tasks: 4,
        route: 'noSession',
        folder: '.git/y-review',
        agentReason: sendReason(agentOf('antigravity')),
      }),
    )
    assert.equal(
      notice.text,
      'Antigravity CLI does not accept a message into a running session, so Yreview wrote 4 tasks to .git/y-review and copied the prompt to the clipboard.',
    )
    assert.equal(notice.warning, false)
  })

  it('an agent that can receive but runs nowhere is named too', () =>
    assert.equal(
      sendNotice(
        report({
          tasks: 1,
          route: 'noSession',
          folder: '.git/y-review',
          agentReason: sendReason(agentOf('opencode')),
        }),
      ).text,
      'No OpenCode session reads this project, so Yreview wrote 1 task to .git/y-review and copied the prompt to the clipboard.',
    ))

  it('a choice that names no product never reaches the notice as a product', () =>
    AGENTS.filter((spec) => !isProduct(spec)).forEach((spec) => {
      const notice = sendNotice(
        report({
          tasks: 6,
          route: 'noSession',
          folder: '.git/y-review',
          agentReason: sendReason(spec),
        }),
      )
      assert.ok(!notice.text.toLowerCase().includes(spec.label.toLowerCase()), notice.text)
      assert.ok(notice.text.endsWith('and copied the prompt to the clipboard.'), notice.text)
    }))

  it('the choice of no agent says that the window runs nothing', () =>
    assert.equal(
      sendNotice(
        report({
          tasks: 6,
          route: 'noSession',
          folder: '.git/y-review',
          agentReason: sendReason(agentOf('none')),
        }),
      ).text,
      'The review session runs nothing, so Yreview wrote 6 tasks to .git/y-review and copied the prompt to the clipboard.',
    ))

  it('the agent never rewrites the reason of a closed switch', () => {
    const off = sendNotice(
      report({
        tasks: 4,
        route: 'channelOff',
        folder: '.git/y-review',
        agentReason: sendReason(agentOf('opencode')),
      }),
    )
    assert.ok(off.text.startsWith('The review channel is off in the settings,'), off.text)
  })

  it('names the session that took a pushed prompt', () => {
    const notice = sendNotice(report({ tasks: 3, streams: 1, targetName: 'OpenCode 1' }))
    assert.equal(notice.text, 'Yreview sent 3 tasks to OpenCode 1.')
    assert.equal(notice.warning, false)
  })

  it('warns when the session refused a pushed prompt', () => {
    const notice = sendNotice(
      report({ tasks: 3, problem: '/tui/append-prompt answered 401.', targetName: 'OpenCode 1' }),
    )
    assert.equal(notice.warning, true)
    assert.equal(notice.text, '/tui/append-prompt answered 401.')
  })
})
