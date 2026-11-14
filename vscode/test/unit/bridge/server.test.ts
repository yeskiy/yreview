import { strict as assert } from 'node:assert'
import { type IncomingHttpHeaders, request } from 'node:http'

import { encodeBatch } from '../../../src/bridge/batch'
import { ID_RULE } from '../../../src/bridge/resolveRequest'
import {
  BridgeServer,
  MAX_STREAMS,
  type BridgeAddress,
  type Route,
} from '../../../src/bridge/server'
import { TOKEN_HEADER } from '../../../src/bridge/token'
import { SESSION_HEADER } from '../../../src/session/sessionKey'

const batch = {
  batchId: 'b7f2a91',
  branch: 'main',
  commit: '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6',
  comments: [
    { id: 'yabc12', path: 'src/a.ts', startLine: 1, endLine: 2, revision: 'HEAD', text: 'Fix it.' },
  ],
}
const KEY_A = 'aaaaaaaa11111111'
const KEY_B = 'bbbbbbbb22222222'
const LONG_ID = 'c3f9a12aabbccddeeff00112233445566778899a'
const WRONG_TOKEN = 'f'.repeat(64)

interface Answer {
  readonly status: number
  readonly text: string
  readonly headers: IncomingHttpHeaders
}

const call = (
  address: BridgeAddress,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<Answer> =>
  new Promise((resolve, reject) => {
    const sent = request(`${address.url}${path}`, {
      method: options.method ?? 'GET',
      headers: options.headers,
    })
    sent.on('response', (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () =>
        resolve({
          status: response.statusCode ?? 0,
          text: Buffer.concat(chunks).toString('utf8'),
          headers: response.headers,
        }),
      )
    })
    sent.on('error', reject)
    sent.end(options.body)
  })

/** Opens /events and collects each text chunk until close() runs. */
const openStream = (address: BridgeAddress, headers: Record<string, string>) => {
  const seen: string[] = []
  const state = { ended: false }
  const sent = request(`${address.url}/events`, { headers })
  const opened = new Promise<{ status: number; headers: IncomingHttpHeaders }>((resolve) => {
    sent.on('response', (response) => {
      response.setEncoding('utf8')
      response.on('data', (chunk: string) => seen.push(chunk))
      response.on('close', () => {
        state.ended = true
      })
      resolve({ status: response.statusCode ?? 0, headers: response.headers })
    })
  })
  sent.on('error', () => {
    state.ended = true
  })
  sent.end()
  return { opened, seen, state, text: () => seen.join(''), close: () => sent.destroy() }
}

const until = async (check: () => boolean, ms = 5000): Promise<void> => {
  const deadline = Date.now() + ms
  const step = async (): Promise<void> => {
    if (check()) return undefined
    if (Date.now() > deadline) throw new Error('the condition never held')
    await new Promise((resolve) => {
      setTimeout(resolve, 20)
    })
    return step()
  }
  return step()
}

const routes = new Map<string, Route>([
  ['/x', { GET: async () => ({ status: 200, body: { a: 1 } }) }],
])

describe('bridge server (BridgeServerTest.kt)', () => {
  const reports: { ids: readonly string[]; session: string | undefined }[] = []
  const answers = { next: undefined as string | undefined, failure: undefined as Error | undefined }
  const server = new BridgeServer(
    async (ids, session) => {
      if (answers.failure !== undefined) throw answers.failure
      reports.push({ ids, session })
      return answers.next
    },
    routes,
    200,
  )
  const held = { address: undefined as BridgeAddress | undefined }
  const address = (): BridgeAddress => held.address ?? assert.fail('the server did not start')
  const auth = (): Record<string, string> => ({ [TOKEN_HEADER]: address().token })
  const resolveWith = (body: string, headers: Record<string, string> = auth()) =>
    call(address(), '/resolve', { method: 'POST', headers, body })

  beforeEach(async () => {
    reports.splice(0)
    answers.next = undefined
    answers.failure = undefined
    held.address = await server.start()
  })
  afterEach(() => server.stop())

  it('listens on the loopback address only', () =>
    assert.match(address().url, /^http:\/\/127\.0\.0\.1:\d+$/))

  it('makes a token the channel accepts', () => assert.match(address().token, /^[0-9a-f]{64}$/))

  it('refuses the event stream without a token', async () => {
    assert.equal((await call(address(), '/events')).status, 401)
  })

  it('refuses the event stream with a wrong token', async () => {
    const answer = await call(address(), '/events', { headers: { [TOKEN_HEADER]: WRONG_TOKEN } })
    assert.equal(answer.status, 401)
    assert.equal(answer.text.includes(address().token), false)
  })

  it('refuses a request with a Host header that is not the loopback address', async () => {
    const answer = await call(address(), '/events', {
      headers: { ...auth(), Host: 'evil.example:80' },
    })
    assert.equal(answer.status, 403)
  })

  it('refuses a Host header that names another port', async () => {
    const answer = await call(address(), '/events', {
      headers: { ...auth(), Host: '127.0.0.1:1' },
    })
    assert.equal(answer.status, 403)
  })

  it('opens the event stream for the right token', async () => {
    const stream = openStream(address(), auth())
    const opened = await stream.opened
    assert.equal(opened.status, 200)
    assert.equal(opened.headers['content-type'], 'text/event-stream')
    assert.equal(opened.headers['cache-control'], 'no-store')
    await until(() => stream.text().length > 0)
    assert.ok(stream.text().startsWith(': open\n\n'))
    stream.close()
  })

  it('sends a batch to the open stream', async () => {
    const stream = openStream(address(), auth())
    await until(() => server.streamCount() === 1)
    assert.equal(server.send(batch), 1)
    await until(() => stream.text().includes(`data: ${encodeBatch(batch)}\n\n`))
    stream.close()
  })

  it('sends a batch to every open stream', async () => {
    const first = openStream(address(), auth())
    const second = openStream(address(), auth())
    await until(() => server.streamCount() === 2)
    assert.equal(server.send(batch), 2)
    await until(() => first.text().includes('"b7f2a91"') && second.text().includes('"b7f2a91"'))
    first.close()
    second.close()
  })

  it('reports that no session is connected', () => assert.equal(server.send(batch), 0))

  it('a stream whose client reads keeps every event', async () => {
    const stream = openStream(address(), auth())
    await until(() => server.streamCount() === 1)
    server.send(batch)
    await until(() => stream.text().includes('"b7f2a91"'))
    assert.equal(stream.text().includes('dropped'), false)
    stream.close()
  })

  it('refuses the resolve request without a token', async () => {
    assert.equal((await resolveWith(JSON.stringify({ ids: [LONG_ID] }), {})).status, 401)
    assert.deepEqual(reports, [])
  })

  it('refuses the resolve request with a wrong token', async () => {
    const answer = await resolveWith(JSON.stringify({ ids: [LONG_ID] }), {
      [TOKEN_HEADER]: WRONG_TOKEN,
    })
    assert.equal(answer.status, 401)
    assert.deepEqual(reports, [])
  })

  it('hands the ids of a good resolve request to the plugin', async () => {
    const answer = await resolveWith(JSON.stringify({ ids: [LONG_ID] }))
    assert.deepEqual([answer.status, answer.text], [200, 'ok'])
    assert.deepEqual(reports, [{ ids: [LONG_ID], session: undefined }])
  })

  it('refuses an id that is not a comment id', async () => {
    const answer = await resolveWith(JSON.stringify({ ids: ['--upload-pack=x'] }))
    assert.deepEqual([answer.status, answer.text], [400, ID_RULE])
    assert.deepEqual(reports, [])
  })

  it('refuses a body that is too large', async () => {
    const answer = await resolveWith('x'.repeat(1_000_001))
    assert.equal(answer.status, 413)
  })

  it('gives the reason back when the plugin refuses the report', async () => {
    answers.next = 'No open task has the id yabc12.'
    const answer = await resolveWith(JSON.stringify({ ids: ['yabc12'] }))
    assert.deepEqual([answer.status, answer.text], [409, 'No open task has the id yabc12.'])
  })

  it('answers 500 when the handler throws', async () => {
    answers.failure = new Error('disk full')
    const answer = await resolveWith(JSON.stringify({ ids: ['yabc12'] }))
    assert.deepEqual([answer.status, answer.text], [500, 'disk full'])
  })

  it('answers a path it does not serve', async () => {
    assert.equal((await call(address(), '/nothing', { headers: auth() })).status, 404)
  })

  it('answers a method the path does not serve', async () => {
    assert.equal(
      (await call(address(), '/events', { method: 'POST', headers: auth() })).status,
      405,
    )
    assert.equal((await call(address(), '/resolve', { headers: auth() })).status, 405)
  })

  it('refuses the seventeenth stream', async () => {
    const open = Array.from({ length: MAX_STREAMS }, () => openStream(address(), auth()))
    await until(() => server.streamCount() === MAX_STREAMS)
    assert.equal((await call(address(), '/events', { headers: auth() })).status, 503)
    open.forEach((stream) => stream.close())
  })

  it('sends a batch to the named session only', async () => {
    const first = openStream(address(), { ...auth(), [SESSION_HEADER]: KEY_A })
    const second = openStream(address(), { ...auth(), [SESSION_HEADER]: KEY_B })
    await until(() => server.streamCount() === 2)
    assert.equal(server.send(batch, KEY_A), 1)
    await until(() => first.text().includes('"b7f2a91"'))
    assert.equal(second.text().includes('b7f2a91'), false)
    first.close()
    second.close()
  })

  it('a send to a session that left reaches nobody', async () => {
    const stream = openStream(address(), { ...auth(), [SESSION_HEADER]: KEY_A })
    await until(() => server.streamCount() === 1)
    stream.close()
    await until(() => server.streamCount() === 0)
    assert.equal(server.send(batch, KEY_A), 0)
  })

  it('a send without a target still reaches every stream', async () => {
    const keyed = openStream(address(), { ...auth(), [SESSION_HEADER]: KEY_A })
    const plain = openStream(address(), auth())
    await until(() => server.streamCount() === 2)
    assert.equal(server.send(batch), 2)
    await until(() => keyed.text().includes('"b7f2a91"') && plain.text().includes('"b7f2a91"'))
    keyed.close()
    plain.close()
  })

  it('the open keys name the sessions that read', async () => {
    const streams = [
      openStream(address(), { ...auth(), [SESSION_HEADER]: KEY_A }),
      openStream(address(), { ...auth(), [SESSION_HEADER]: KEY_A }),
      openStream(address(), { ...auth(), [SESSION_HEADER]: KEY_B }),
      openStream(address(), auth()),
    ]
    await until(() => server.streamCount() === 4)
    assert.deepEqual([...server.openKeys()].sort(), [KEY_A, KEY_B])
    streams.forEach((stream) => stream.close())
  })

  it('a key of the wrong shape names no session and still reads a broadcast', async () => {
    const stream = openStream(address(), { ...auth(), [SESSION_HEADER]: 'bad key!' })
    await until(() => server.streamCount() === 1)
    assert.deepEqual(server.openKeys(), [])
    assert.equal(server.send(batch), 1)
    await until(() => stream.text().includes('"b7f2a91"'))
    stream.close()
  })

  it('the resolve report names the session that sent it', async () => {
    await resolveWith(JSON.stringify({ ids: ['yabc12'] }), { ...auth(), [SESSION_HEADER]: KEY_A })
    assert.deepEqual(reports, [{ ids: ['yabc12'], session: KEY_A }])
  })

  it('the resolve report of a session with no key still reaches the plugin', async () => {
    await resolveWith(JSON.stringify({ ids: ['yabc12'] }))
    assert.deepEqual(reports, [{ ids: ['yabc12'], session: undefined }])
  })

  it('a stop ends every stream', async () => {
    const first = openStream(address(), auth())
    const second = openStream(address(), auth())
    await until(() => server.streamCount() === 2)
    await server.stop()
    await until(() => first.state.ended && second.state.ended)
    assert.equal(server.streamCount(), 0)
  })

  it('writes a keep-alive line after the wait with no batch', async () => {
    const stream = openStream(address(), auth())
    await until(() => stream.text().includes(': keep-alive\n\n'))
    stream.close()
  })

  it('a route answers its JSON', async () => {
    const answer = await call(address(), '/x', { headers: auth() })
    assert.equal(answer.status, 200)
    assert.equal(answer.headers['content-type'], 'application/json; charset=utf-8')
    assert.equal(answer.text, '{"a":1}')
  })

  it('a route checks the token first', async () => {
    assert.equal((await call(address(), '/x')).status, 401)
  })

  it('a route answers the method it does not serve', async () => {
    assert.equal((await call(address(), '/x', { method: 'POST', headers: auth() })).status, 405)
  })

  it('a second start of a running server fails', async () => {
    await assert.rejects(server.start(), /already runs/)
  })
})
