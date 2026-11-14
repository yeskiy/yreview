import assert from 'node:assert/strict'
import { appendFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { DoneLog, MAX_READ } from '../../../src/handoff/doneLog'
import { removeDir, scratchDir } from '../../fixtures/scratch'

const one = 'c3f9a12aabbccddeeff00112233445566778899a'
const two = '0123456789abcdef0123456789abcdef01234567'
const three = 'todo-0123456789abcdef0123456789abcdef01234567-88'

// How many reads the tests give a log. A line of two megabytes needs three.
const READS = 8

/** A line that no read can hold takes several reads to pass, so the test reads until the end. */
const drain = (log: DoneLog): Promise<readonly string[]> =>
  Array.from({ length: READS }).reduce<Promise<readonly string[]>>(
    async (ids) => [...(await ids), ...(await log.newIds())],
    Promise.resolve([]),
  )

const tooLong = (): string => 'x'.repeat(MAX_READ * 2)

describe('done log', function doneLog() {
  this.timeout(60_000)
  const dirs: string[] = []
  const file = (): string => {
    const dir = scratchDir()
    dirs.push(dir)
    return path.join(dir, 'done.txt')
  }
  after(() => dirs.forEach(removeDir))

  const withText = (text: string): string => {
    const done = file()
    appendFileSync(done, text)
    return done
  }

  it('gives nothing when the file is missing', async () => {
    assert.deepEqual(await new DoneLog(file()).newIds(), [])
  })

  it('reads every whole line', async () => {
    assert.deepEqual(await new DoneLog(withText(`${one}\n${two}\n`)).newIds(), [one, two])
  })

  it('reads a todo identifier', async () => {
    assert.deepEqual(await new DoneLog(withText(`${three}\n`)).newIds(), [three])
  })

  it('reads a line only once', async () => {
    const log = new DoneLog(withText(`${one}\n`))
    assert.deepEqual(await log.newIds(), [one])
    assert.deepEqual(await log.newIds(), [])
  })

  it('reads the lines an agent appends after the first read', async () => {
    const done = withText(`${one}\n`)
    const log = new DoneLog(done)
    await log.newIds()
    appendFileSync(done, `${two}\n${three}\n`)
    assert.deepEqual(await log.newIds(), [two, three])
  })

  it('waits for the end of a line the agent still writes', async () => {
    const done = withText(`${one}\n${two.slice(0, -1)}`)
    const log = new DoneLog(done)
    assert.deepEqual(await log.newIds(), [one])
    appendFileSync(done, `${two.slice(-1)}\n`)
    assert.deepEqual(await log.newIds(), [two])
  })

  it('reads a file that ends with a carriage return', async () => {
    assert.deepEqual(await new DoneLog(withText(`${one}\r\n${two}\r\n`)).newIds(), [one, two])
  })

  it('passes an empty line', async () => {
    assert.deepEqual(await new DoneLog(withText(`${one}\n\n   \n${two}\n`)).newIds(), [one, two])
  })

  it('starts again when the file became shorter', async () => {
    const done = withText(`${one}\n${two}\n`)
    const log = new DoneLog(done)
    await log.newIds()
    writeFileSync(done, `${three}\n`)
    assert.deepEqual(await log.newIds(), [three])
  })

  it('refuses a line that is not an identifier of the extension', async () => {
    const log = new DoneLog(
      withText(`${one}\n../../etc/passwd\n--exec=calc.exe\nrefs/notes/x\n${two}\n`),
    )
    assert.deepEqual(await log.newIds(), [one, two])
    assert.equal(log.rejected, 3)
  })

  it('counts the read position in bytes', async () => {
    const log = new DoneLog(withText(`${one}\n`))
    await log.newIds()
    assert.equal(log.offset, 41)
  })

  it('reads the identifiers after a line that no read can hold', async () => {
    assert.deepEqual(await drain(new DoneLog(withText(`${tooLong()}\n${one}\n${two}\n`))), [
      one,
      two,
    ])
  })

  it('counts a line that no read can hold as one refused line', async () => {
    const log = new DoneLog(withText(`${tooLong()}\n${one}\n`))
    await drain(log)
    assert.equal(log.rejected, 1)
  })

  it('moves the read position past a line that no read can hold', async () => {
    const done = withText(`${tooLong()}\n`)
    const log = new DoneLog(done)
    await drain(log)
    assert.equal(
      log.offset,
      statSync(done).size,
      'a read that never moves reads the same bytes for good',
    )
  })

  it('takes no identifier out of the end of a line that no read can hold', async () => {
    assert.deepEqual(await drain(new DoneLog(withText(`${tooLong()}${one}\n${two}\n`))), [two])
  })
})
