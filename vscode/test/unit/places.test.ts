import assert from 'node:assert/strict'
import { mkdirSync, symlinkSync } from 'node:fs'
import path from 'node:path'

import { redactingLog } from '../../src/log'
import { withLongForms } from '../../src/places'
import { removeDir, scratchDir, shortForm } from '../fixtures/scratch'

describe('the places of the log', () => {
  it('adds the long form of a folder', () =>
    assert.deepEqual(
      withLongForms(['C:/PROGRA~1/demo'], () => 'C:/Program Files/demo'),
      ['C:/PROGRA~1/demo', 'C:/Program Files/demo'],
    ))

  it('keeps a folder once when it is already real', () =>
    assert.deepEqual(
      withLongForms(['E:/work/demo'], (folder) => folder),
      ['E:/work/demo'],
    ))

  it('keeps a folder that does not resolve', () =>
    assert.deepEqual(
      withLongForms(['E:/gone'], () => {
        throw new Error('ENOENT')
      }),
      ['E:/gone'],
    ))

  it('keeps every open folder', () =>
    assert.deepEqual(
      withLongForms(['E:/one', 'F:/two'], (folder) => folder),
      ['E:/one', 'F:/two'],
    ))

  describe('on the disk', () => {
    const dir = scratchDir()
    const lines: string[] = []
    const sink = {
      info: (m: string) => lines.push(m),
      warn: (m: string) => lines.push(m),
      error: (m: string) => lines.push(m),
    }
    beforeEach(() => lines.splice(0))
    after(() => removeDir(dir))

    it('removes the long form of a folder opened through an 8.3 short path', function shortPath() {
      const short = shortForm(dir)
      // 8.3 names exist only on Windows volumes that make them.
      if (short === undefined) this.skip()
      redactingLog(sink, () => ({
        homes: [],
        projects: withLongForms([short]),
        repositories: [],
      })).info(`read ${path.join(dir, 'a.md')}`)
      assert.deepEqual(lines, ['read <project>/a.md'])
    })

    it('removes the target of a folder opened through a link', function link() {
      // A plain Windows user cannot make a symbolic link.
      if (process.platform === 'win32') this.skip()
      const target = path.join(dir, 'real')
      const alias = path.join(dir, 'alias')
      mkdirSync(target)
      symlinkSync(target, alias)
      redactingLog(sink, () => ({
        homes: [],
        projects: withLongForms([alias]),
        repositories: [],
      })).info(`read ${target}/a.md`)
      assert.deepEqual(lines, ['read <project>/a.md'])
    })
  })
})
