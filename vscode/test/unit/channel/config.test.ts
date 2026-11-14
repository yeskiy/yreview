import { strict as assert } from 'node:assert'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  ConfigError,
  FILE_VARIABLE,
  KEY_VARIABLE,
  MAX_FILE_BYTES,
  parseConfig,
} from '../../../src/channel/config'
import { removeDir, scratchDir } from '../../fixtures/scratch'

type Environment = Record<string, string | undefined>

const token = 'a-token-of-32-characters-000000000'
const sessionKey = 'aaaaaaaaaaaaaaaa'

describe('channel config (ConfigTest.kt)', () => {
  const state = { home: '', files: 0 }

  beforeEach(() => {
    state.home = scratchDir()
  })

  afterEach(() => removeDir(state.home))

  const fileWith = (text: string): Environment => {
    state.files += 1
    const file = path.join(state.home, `bridge${state.files}.json`)
    writeFileSync(file, text)
    return { [FILE_VARIABLE]: file }
  }

  const envWith = (url: string, withToken: string | null = token): Environment =>
    fileWith(
      `{${[`"url":"${url}"`, ...(withToken === null ? [] : [`"token":"${withToken}"`]), '"pid":42'].join(',')}}`,
    )

  const messageOf = async (environment: Environment): Promise<string> => {
    const failure = await parseConfig(environment).then(
      () => undefined,
      (error: unknown) => error,
    )
    assert.ok(failure instanceof ConfigError, 'the config must be refused')
    return failure.message
  }

  const refuse = async (environment: Environment, holds: string): Promise<void> => {
    const message = await messageOf(environment)
    assert.ok(message.includes(holds), message)
  }

  it('accepts a bridge on the IPv4 loopback address', async () => {
    assert.equal(
      (await parseConfig(envWith('http://127.0.0.1:64343'))).bridgeUrl,
      'http://127.0.0.1:64343',
    )
  })

  it('accepts any address inside the loopback range', async () => {
    assert.equal(
      (await parseConfig(envWith('http://127.2.3.4:64343'))).bridgeUrl,
      'http://127.2.3.4:64343',
    )
  })

  it('accepts the name localhost', async () => {
    assert.equal(
      (await parseConfig(envWith('http://localhost:64343'))).bridgeUrl,
      'http://localhost:64343',
    )
  })

  it('accepts the IPv6 loopback address', async () => {
    assert.equal((await parseConfig(envWith('http://[::1]:64343'))).bridgeUrl, 'http://[::1]:64343')
  })

  it('keeps a base path and removes the trailing slash', async () => {
    assert.equal(
      (await parseConfig(envWith('http://127.0.0.1:64343/y-review/'))).bridgeUrl,
      'http://127.0.0.1:64343/y-review',
    )
  })

  it('reads the token from the file that the variable names', async () => {
    assert.equal((await parseConfig(envWith('http://127.0.0.1:64343'))).token, token)
  })

  it('keeps every value of the file out of the environment', () => {
    const environment = envWith('http://127.0.0.1:64343')
    assert.deepEqual(Object.keys(environment), [FILE_VARIABLE])
    assert.ok(!(environment[FILE_VARIABLE] ?? '').includes(token))
  })

  it('rejects an address outside the loopback range', async () => {
    await refuse(envWith('http://192.168.1.5:64343'), 'loopback')
  })

  it('rejects a host name that is not localhost', async () => {
    await refuse(envWith('http://example.com'), 'loopback')
  })

  it('rejects a scheme other than http', async () => {
    await refuse(envWith('https://127.0.0.1:64343'), 'http')
  })

  it('rejects a file address', async () => {
    await refuse(envWith('file:///etc/passwd'), 'http')
  })

  it('rejects an address that does not parse', async () => {
    await refuse(envWith('not a url'), FILE_VARIABLE)
  })

  it('rejects a file that names no address', async () => {
    await refuse(fileWith(`{"token":"${token}"}`), FILE_VARIABLE)
  })

  it('rejects a file that holds no token', async () => {
    await refuse(envWith('http://127.0.0.1:64343', null), 'token')
  })

  it('rejects a token that is too short to guard the bridge', async () => {
    await refuse(envWith('http://127.0.0.1:64343', 'short'), 'token')
  })

  it('rejects an environment that names no file', async () => {
    await refuse({}, FILE_VARIABLE)
  })

  it('rejects a name that is blank', async () => {
    await refuse({ [FILE_VARIABLE]: '   ' }, FILE_VARIABLE)
  })

  it('rejects a name that is not a path', async () => {
    await refuse({ [FILE_VARIABLE]: `a${String.fromCharCode(0)}b` }, FILE_VARIABLE)
  })

  it('rejects a file that is not there', async () => {
    await refuse({ [FILE_VARIABLE]: path.join(state.home, 'no-such-bridge.json') }, FILE_VARIABLE)
  })

  it('rejects a file that holds no valid JSON', async () => {
    await refuse(fileWith('not json'), 'JSON')
  })

  it('rejects a file that is too large to hold a bridge', async () => {
    await refuse(fileWith('x'.repeat(MAX_FILE_BYTES + 1)), 'large')
  })

  it('a refusal never repeats the token', async () => {
    const messages = await Promise.all(
      [
        envWith('https://127.0.0.1:64343'),
        envWith('http://10.0.0.5:64343'),
        envWith('http://127.0.0.1:64343', token.slice(0, 8)),
      ].map(messageOf),
    )
    messages.forEach((message) => {
      assert.notEqual(message, '')
      assert.ok(!message.includes(token.slice(0, 8)), 'a refusal must repeat no part of the token')
    })
  })

  it('reads the session key when the environment carries one', async () => {
    const parsed = await parseConfig({
      ...envWith('http://127.0.0.1:64343'),
      [KEY_VARIABLE]: sessionKey,
    })
    assert.equal(parsed.sessionKey, sessionKey)
  })

  it('starts without a session key', async () => {
    // An agent that runs one session at a time reaches no chooser, so it needs no key.
    assert.equal((await parseConfig(envWith('http://127.0.0.1:64343'))).sessionKey, undefined)
  })

  it('drops a session key that is blank', async () => {
    const parsed = await parseConfig({
      ...envWith('http://127.0.0.1:64343'),
      [KEY_VARIABLE]: '   ',
    })
    assert.equal(parsed.sessionKey, undefined)
  })

  it('carries the same variable names as the plugin', () => {
    assert.equal(FILE_VARIABLE, 'Y_REVIEW_BRIDGE_FILE')
    assert.equal(KEY_VARIABLE, 'Y_REVIEW_SESSION_KEY')
  })
})
