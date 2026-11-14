import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import path from 'node:path'

import { DoneWatch } from '../../../src/handoff/doneWatch'
import type { CloseReport } from '../../../src/tasks/taskCompletion'
import { removeDir, scratchDir } from '../../fixtures/scratch'

const one = 'c3f9a12aabbccddeeff00112233445566778899a'
const two = '0123456789abcdef0123456789abcdef01234567'
const log = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  record: () => undefined,
}

describe('done watch', () => {
  const dir = scratchDir()
  after(() => removeDir(dir))

  it('reads every watched file and closes the new ids once', async () => {
    const closed: string[][] = []
    const watch = new DoneWatch(
      (ids) => {
        closed.push([...ids])
        return Promise.resolve({ closed: ids.length, problems: [] })
      },
      () => undefined,
      log,
      60_000,
    )
    const first = path.join(dir, 'a.txt')
    const second = path.join(dir, 'b.txt')
    appendFileSync(first, `${one}\n`)
    appendFileSync(second, `${two}\n`)
    watch.watch(first)
    watch.watch(second)
    await watch.tick()
    await watch.tick()
    watch.dispose()
    assert.deepEqual(closed, [[one, two]])
  })

  it('stays quiet when a line closes nothing', async () => {
    const heard: CloseReport[] = []
    const watch = new DoneWatch(
      () => Promise.resolve({ closed: 0, problems: [] }),
      (report) => heard.push(report),
      log,
      60_000,
    )
    const file = path.join(dir, 'c.txt')
    appendFileSync(file, `${one}\n`)
    watch.watch(file)
    await watch.tick()
    watch.dispose()
    assert.deepEqual(heard, [])
  })

  it('runs no second read while one read runs', async () => {
    const calls = { count: 0 }
    const gate: { open?: () => void; started?: () => void } = {}
    const started = new Promise<void>((resolve) => {
      gate.started = resolve
    })
    const watch = new DoneWatch(
      () => {
        calls.count += 1
        gate.started?.()
        return new Promise<CloseReport>((resolve) => {
          gate.open = () => resolve({ closed: 1, problems: [] })
        })
      },
      () => undefined,
      log,
      60_000,
    )
    const file = path.join(dir, 'd.txt')
    appendFileSync(file, `${one}\n`)
    watch.watch(file)
    const running = watch.tick()
    await started
    appendFileSync(file, `${two}\n`)
    await watch.tick()
    gate.open?.()
    await running
    watch.dispose()
    assert.equal(calls.count, 1)
  })

  it('polls by itself after the first watch', async () => {
    const closed: string[] = []
    const watch = new DoneWatch(
      (ids) => {
        closed.push(...ids)
        return Promise.resolve({ closed: ids.length, problems: [] })
      },
      () => undefined,
      log,
      20,
    )
    const file = path.join(dir, 'e.txt')
    watch.watch(file)
    appendFileSync(file, `${one}\n`)
    await new Promise((resolve) => {
      setTimeout(resolve, 300)
    })
    watch.dispose()
    assert.deepEqual(closed, [one])
  })
})
