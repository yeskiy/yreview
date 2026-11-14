import assert from 'node:assert/strict'

import {
  NOTHING_FOUND,
  NO_AGENT,
  SEARCHING,
  noPush,
  place,
  row,
  sendReason,
} from '../../../src/session/agentRows'
import { type AgentAnswer, NOT_YET } from '../../../src/session/agentScan'
import { NOTHING } from '../../../src/session/agentSearch'
import {
  AGENTS,
  type AgentId,
  type AgentSpec,
  agentOf,
  defaultCommand,
  isProduct,
} from '../../../src/session/catalog'

const claude = agentOf('claude')
const opencode = agentOf('opencode')

const answer = (...found: AgentId[]): AgentAnswer => ({
  installs: new Map(
    AGENTS.map((spec) => [
      spec.id,
      found.includes(spec.id)
        ? { path: `/usr/bin/${defaultCommand(spec)}`, source: 'path' as const }
        : NOTHING,
    ]),
  ),
  scanned: true,
})

/** Every sentence that stands where the name of a product stands. */
const sentences = (spec: AgentSpec): readonly string[] => [
  sendReason(spec),
  noPush(spec),
  place(spec, answer()),
  place(spec, answer(spec.id)),
]

describe('agent rows', () => {
  it('both agents that take a send say so', () => {
    assert.equal(row(claude, true), 'Claude Code, found on this machine. Send and Copy both work.')
    assert.equal(row(opencode, true), 'OpenCode, found on this machine. Send and Copy both work.')
  })

  it('an agent that takes no send says copy only', () => {
    assert.equal(
      row(agentOf('gemini'), true),
      'Gemini CLI, found on this machine. Copy only, because it takes no message into a running session.',
    )
  })

  it('a row of an agent the scan missed never says that it is absent', () => {
    const text = row(claude, false)
    assert.ok(text.includes('not found'), text)
    assert.ok(text.includes('Claude Code'), text)
    assert.equal(text.includes('not installed'), false)
  })

  it('no row of any agent ever says that it is not installed', () => {
    AGENTS.forEach((spec) => {
      assert.equal(row(spec, false).includes('not installed'), false, spec.label)
      assert.equal(row(spec, true).includes('not installed'), false, spec.label)
    })
  })

  it('a missing tool names the desktop application of the same brand', () => {
    const text = row(agentOf('codex'), false)
    assert.ok(text.includes('ChatGPT desktop application'), text)
    assert.ok(text.includes('A terminal cannot run it.'), text)
  })

  it('no sentence about a search that found nothing states a fact about the machine', () => {
    ;[
      ...AGENTS.filter(isProduct).flatMap((spec) => [row(spec, false), place(spec, answer())]),
      NOTHING_FOUND,
    ].forEach((text) => assert.equal(text.includes('this machine'), false, text))
  })

  it('the sentence of an empty search points at the command field', () => {
    assert.ok(NOTHING_FOUND.includes('full path'), NOTHING_FOUND)
    assert.ok(NOTHING_FOUND.includes('Another agent'), NOTHING_FOUND)
  })

  it('a found tool says nothing about the desktop application', () => {
    assert.equal(row(agentOf('codex'), true).includes('ChatGPT'), false)
  })

  it('the no agent row says what to do instead', () => {
    const text = row(agentOf('none'), false)
    assert.ok(text.startsWith('No agent.'), text)
    assert.equal(text.includes('not found'), false)
    assert.ok(NO_AGENT.includes('Copy Review Tasks'), NO_AGENT)
  })

  it('two choices of the list name no product', () => {
    assert.deepEqual(
      AGENTS.filter((spec) => !isProduct(spec)).map((spec) => spec.id),
      ['custom', 'none'],
    )
  })

  it('no sentence about a choice that names no product ever names that choice', () => {
    AGENTS.filter((spec) => !isProduct(spec)).forEach((spec) =>
      sentences(spec).forEach((text) =>
        assert.equal(
          text.toLowerCase().includes(spec.label.toLowerCase()),
          false,
          `${spec.id}: ${text}`,
        ),
      ),
    )
  })

  it('every sentence about a product names that product', () => {
    AGENTS.filter(isProduct).forEach((spec) =>
      sentences(spec).forEach((text) =>
        assert.ok(text.includes(spec.label), `${spec.id}: ${text}`),
      ),
    )
  })

  it('the send of a choice that names no product says what the plugin did', () => {
    assert.equal(sendReason(agentOf('none')), 'The review session runs nothing')
    assert.equal(
      sendReason(agentOf('custom')),
      'The extension puts no message into a command of your own',
    )
  })

  it('the send of a product names the product and the reason', () => {
    assert.equal(sendReason(claude), 'No Claude Code session reads this project')
    assert.equal(
      sendReason(agentOf('antigravity')),
      'Antigravity CLI does not accept a message into a running session',
    )
  })

  it('the settings line of a choice that names no product carries the hint alone', () => {
    assert.equal(place(agentOf('none'), answer()), agentOf('none').hint)
    assert.equal(place(agentOf('custom'), answer()), agentOf('custom').hint)
  })

  it('the settings line of a product names the find, or the search that missed it', () => {
    assert.equal(
      place(claude, answer('claude')),
      'This machine holds Claude Code at /usr/bin/claude.',
    )
    assert.equal(
      place(claude, answer()),
      `The extension did not find Claude Code on the search path of this editor. ${claude.hint}`,
    )
    assert.equal(place(claude, NOT_YET), SEARCHING)
  })

  it('the another agent row never says that a search missed it', () => {
    const text = row(agentOf('custom'), false)
    assert.ok(text.startsWith('Another agent.'), text)
    assert.equal(text.includes('not found'), false)
    assert.equal(text.includes('Copy only'), false)
  })
})
