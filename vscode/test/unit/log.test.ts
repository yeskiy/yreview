import assert from 'node:assert/strict'

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
