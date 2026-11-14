import assert from 'node:assert/strict'

import { newToken } from '../../src/bridge/token'
import { reportText } from '../../src/diagnostic/report'
import { SessionLog } from '../../src/diagnostic/sessionLog'
import { sendRecord } from '../../src/diagnostic/sessionRecord'
import { redactingLog } from '../../src/log'

describe('redacting log', () => {
  const lines: string[] = []
  const sink = {
    debug: (m: string) => lines.push(m),
    info: (m: string) => lines.push(m),
    warn: (m: string) => lines.push(m),
    error: (m: string) => lines.push(m),
  }
  const log = redactingLog(sink, () => ({
    homes: ['C:/Users/alice'],
    projects: ['E:/work/demo'],
    repositories: ['D:/repos/lib'],
  }))

  beforeEach(() => lines.splice(0))

  it('removes the folders of the user from a message', () => {
    log.info('read C:\\Users\\alice\\x and E:/work/demo/a.kt and D:/repos/lib/b.kt')
    assert.deepEqual(lines, ['read ~/x and <project>/a.kt and <repository>/b.kt'])
  })

  it('removes a secret value and an address from a failure', () => {
    log.error('Push failed.', new Error(`token=${'ab'.repeat(20)} to git@example.com:o/r.git`))
    assert.equal(lines.length, 1)
    assert.doesNotMatch(lines[0] ?? '', /abab|example\.com/)
  })

  it('removes the folders of the user from a debug line', () => {
    log.debug('Save Local took 5 ms in E:/work/demo')
    assert.deepEqual(lines, ['Save Local took 5 ms in <project>'])
  })

  it('removes a remote URL and a mail address from a warning', () => {
    log.warn('fetch https://github.com/o/r.git as bob@example.org')
    assert.deepEqual(lines, ['fetch <remote> as <email>'])
  })
})

describe('records in the log', () => {
  const lines: string[] = []
  const sink = {
    debug: (m: string) => lines.push(m),
    info: (m: string) => lines.push(m),
    warn: (m: string) => lines.push(m),
    error: (m: string) => lines.push(m),
  }
  const places = { homes: ['C:/Users/alice'], projects: ['E:/work/demo'], repositories: [] }
  const ring = new SessionLog()
  const log = redactingLog(sink, () => places, { ring, ownRoot: 'E:/no-such-root' })
  const send = (problem: string) =>
    sendRecord({
      route: 'channel',
      store: 'git',
      readers: 1,
      tasks: 2,
      batches: 1,
      dropped: 0,
      problem,
    })

  beforeEach(() => lines.splice(0))

  it('keeps a record in the ring and writes its clean text to the log', () => {
    log.record(send('E:/work/demo/x is locked'))
    assert.equal(ring.recent()[0]?.label, 'send')
    assert.equal(lines.length, 1)
    assert.match(lines[0] ?? '', /^Yreview made a record\.\n\[/)
    assert.match(lines[0] ?? '', /<project>\/x is locked/)
  })

  it('keeps a failure record for each logged failure', () => {
    log.error('Push failed.', new Error('C:/Users/alice/x is gone'))
    assert.equal(ring.recent()[0]?.label, 'failure')
    assert.equal(lines.length, 1)
    assert.match(lines[0] ?? '', /~\/x is gone/)
  })

  it('keeps no failure record for an error without a failure', () => {
    const before = ring.recent().length
    log.error('Git is missing.')
    assert.equal(ring.recent().length, before)
  })

  it('writes no secret value of a record to the log', () => {
    log.record(send(`token=${'ab'.repeat(20)}`))
    assert.doesNotMatch(lines[0] ?? '', /abab/)
  })

  describe('a report from the ring', () => {
    // Each probe is a private value that a failure or a record can carry into the ring.
    const probes = {
      'bridge token': newToken(),
      password: newToken(),
      'project path': 'E:/work/demo/src/Secret.kt',
      'home path': 'C:/Users/alice/AppData/Local/Temp/opencode.secret',
      'remote URL': 'https://github.com/alice-corp/probe-app.git',
      'scp remote': 'git@github.com:alice-corp/probe-app.git',
      'mail address': 'probe.user@example.org',
    }
    const report = (): string => {
      const own = new SessionLog()
      const probing = redactingLog(sink, () => places, { ring: own })
      Object.entries(probes).forEach(([name, value]) => {
        probing.error(`${name} ${value}`, new Error(`failed with ${value}`))
        probing.record(send(`${name} ${value}`))
      })
      probing.error('Bridge failed.', new Error(`X-Y-Review-Token: ${probes['bridge token']}`))
      probing.error('OpenCode failed.', `OPENCODE_SERVER_PASSWORD=${probes.password}`)
      const facts = {
        machine: {
          extension: '1.0.0',
          editor: 'Visual Studio Code 1.146.0',
          host: 'local',
          os: 'Windows_NT',
          node: '24',
          git: '2.55.0',
          languageModelTools: true,
          mcpProvider: true,
        },
        channel: true,
        sharing: 'local',
        sessionLocation: 'panel',
        agent: 'claude',
        agentCommand: 'default',
      }
      return reportText(facts, own.recent(), places)
    }

    Object.entries(probes).forEach(([name, value]) =>
      it(`never carries the ${name}`, () => {
        const text = report()
        assert.ok(text.includes('failure'), text)
        assert.ok(!text.toLowerCase().includes(value.toLowerCase()), text)
      }),
    )

    it('never carries a long part of the bridge token or the password', () => {
      const text = report()
      ;[probes['bridge token'], probes.password].forEach((secret) =>
        assert.ok(!text.includes(secret.slice(0, 16)), text),
      )
    })
  })
})
