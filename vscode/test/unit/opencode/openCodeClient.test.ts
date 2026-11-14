import { strict as assert } from 'node:assert'

import {
  APPEND_PATH,
  LIST_PATH,
  SUBMIT_PATH,
  appendBody,
  authorization,
  callProblem,
  listSessions,
  pushPrompt,
} from '../../../src/bridge/openCodeClient'
import { SECRET_MARK } from '../../../src/core/redact'
import { type FakeOpenCode, deadPort, startOpenCode } from './fakeOpenCode'

const textOf = (body: string): string => (JSON.parse(body) as { text: string }).text

describe('OpenCode client (OpenCodeClientTest.kt)', () => {
  const held: { fake: FakeOpenCode | undefined } = { fake: undefined }
  const start = async (status = 200, sessions = '[]'): Promise<FakeOpenCode> => {
    held.fake = await startOpenCode(status, sessions)
    return held.fake
  }
  afterEach(async () => {
    await held.fake?.stop()
    held.fake = undefined
  })

  it('the body carries the text as json', () =>
    assert.equal(textOf(appendBody('line one\nline two `x` "y"')), 'line one\nline two `x` "y"'))

  it('the header carries the fixed user name and the password', () => {
    const header = authorization('s3cret')
    assert.ok(header.startsWith('Basic '), header)
    assert.equal(
      Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8'),
      'opencode:s3cret',
    )
  })

  it('a push calls append and then submit', async () => {
    const server = await start()
    assert.equal(await pushPrompt(server.port, 's3cret', 'do the work'), undefined)
    assert.deepEqual(server.paths, [APPEND_PATH, SUBMIT_PATH])
  })

  it('a push sends no directory parameter', async () => {
    const server = await start()
    await pushPrompt(server.port, 's3cret', 'do the work')
    assert.ok(
      server.paths.every((at) => !at.includes('?') && !at.includes('directory')),
      server.paths.join(),
    )
  })

  it('a push never clears the input box', async () => {
    const server = await start()
    await pushPrompt(server.port, 's3cret', 'do the work')
    assert.ok(
      server.paths.every((at) => !at.includes('clear')),
      server.paths.join(),
    )
  })

  it('a push carries the text and the credentials on the first call', async () => {
    const server = await start()
    await pushPrompt(server.port, 's3cret', 'do the work')
    assert.ok(textOf(server.bodies[0] ?? '{}').endsWith('do the work'), server.bodies[0])
    assert.equal(server.authorizations[0], authorization('s3cret'))
  })

  it('a refused call reports the status and calls nothing more', async () => {
    const server = await start(401)
    const problem = await pushPrompt(server.port, 'wrong', 'do the work')
    assert.ok(problem?.includes('401'), problem)
    assert.deepEqual(server.paths, [APPEND_PATH])
  })

  it('a refused call never holds the password', async () => {
    const server = await start(401)
    const problem = await pushPrompt(server.port, 'the-secret-value', 'do the work')
    assert.ok(problem !== undefined && !problem.includes('the-secret-value'), problem)
  })

  it('a port that nothing listens on reports a problem', async () => {
    const problem = await pushPrompt(await deadPort(), 's3cret', 'do the work')
    assert.ok(problem !== undefined && problem !== '', problem)
  })

  it('a problem never holds the password', async () => {
    const problem = await pushPrompt(await deadPort(), 'the-secret-value', 'do the work')
    assert.ok(problem !== undefined && !problem.includes('the-secret-value'), problem)
  })

  it('the session list comes back parsed', async () => {
    const server = await start(
      200,
      '[{"id":"ses_a","title":"the live talk","directory":"C:/work/app","time":{"created":1,"updated":2}}]',
    )
    const rows = await listSessions(server.port, 's3cret')
    assert.deepEqual(
      rows?.map((row) => row.title),
      ['the live talk'],
    )
    assert.deepEqual(server.paths, [LIST_PATH])
  })

  it('the session list carries the credentials', async () => {
    const server = await start()
    await listSessions(server.port, 's3cret')
    assert.deepEqual(server.authorizations, [authorization('s3cret')])
  })

  it('an answer of a shape this build does not know holds no session', async () => {
    const server = await start(200, '{"sessions":[{"title":"a talk"}]}')
    assert.deepEqual(await listSessions(server.port, 's3cret'), [])
  })

  it('a refused session list answers undefined', async () => {
    const server = await start(401)
    assert.equal(await listSessions(server.port, 'wrong'), undefined)
  })

  it('a port that nothing listens on answers undefined and throws nothing', async () =>
    assert.equal(await listSessions(await deadPort(), 's3cret'), undefined))

  it('a call that got no answer names the cause', async () => {
    const problem = (await pushPrompt(await deadPort(), 's3cret', 'do the work')) ?? ''
    assert.ok(problem.startsWith(`The OpenCode session did not answer at ${APPEND_PATH}.`), problem)
    assert.match(problem, /The cause is \w+Error/)
  })

  it('the text of a failed call names the path and the cause', () =>
    assert.equal(
      callProblem(APPEND_PATH, 's3cret', new Error('the pipe broke')),
      `The OpenCode session did not answer at ${APPEND_PATH}. The cause is Error: the pipe broke.`,
    ))

  it('a failure that carries no message names the class alone', () =>
    assert.equal(
      callProblem(SUBMIT_PATH, 's3cret', new TypeError()),
      `The OpenCode session did not answer at ${SUBMIT_PATH}. The cause is TypeError.`,
    ))

  it('a cause that repeats the password loses it', () => {
    const problem = callProblem(
      APPEND_PATH,
      'the-secret-value',
      new Error('the header Basic the-secret-value failed'),
    )
    assert.ok(!problem.includes('the-secret-value'), problem)
    assert.ok(problem.includes(SECRET_MARK), problem)
  })

  it('a half typed line and the prompt never run together', async () => {
    const server = await start()
    const typed = 'please also check the '
    await pushPrompt(server.port, 's3cret', 'Read AGENT.md, then work through tasks.json.')
    const box = typed + textOf(server.bodies[0] ?? '{}')
    assert.ok(!box.includes('please also check the Read'), box)
    assert.equal(box.split('\n')[0], typed)
  })

  it('a push puts a blank line in front of the prompt', async () => {
    const server = await start()
    await pushPrompt(server.port, 's3cret', 'do the work')
    assert.equal(textOf(server.bodies[0] ?? '{}'), '\n\ndo the work')
  })
})
