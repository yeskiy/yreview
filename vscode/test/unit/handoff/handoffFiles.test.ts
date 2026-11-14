import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import type { TaskDocument, TaskEntry } from '../../../src/core/taskDocument'
import { HandoffFiles } from '../../../src/handoff/handoffFiles'
import { removeDir, scratchDir } from '../../fixtures/scratch'

const ESCAPE = '\u001b'

const task: TaskEntry = {
  id: 'firstTask',
  kind: 'comment',
  path: 'src/Parser.kt',
  startLine: 88,
  endLine: 94,
  text: 'Add the guard before the loop.',
}

const document = (tasks: readonly TaskEntry[] = [task]): TaskDocument => ({
  version: 2,
  repository: 'E:/repo',
  commit: '44787c6a1b2c3d4e5f60718293a4b5c6d7e8f900',
  generated: '2026-08-21T02:40:00Z',
  tasks,
})

const read = (file: string): string => readFileSync(file, 'utf8')

describe('handoff files', () => {
  const dirs: string[] = []
  const folder = (): string => {
    const dir = scratchDir()
    dirs.push(dir)
    return path.join(dir, 'y-review')
  }
  after(() => dirs.forEach(removeDir))

  it('makes the folder and writes the two files', async () => {
    const files = new HandoffFiles(folder())
    await files.write(document())
    assert.ok(statSync(files.guide).isFile())
    assert.ok(statSync(files.tasks).isFile())
  })

  it('writes the rules of the agent', async () => {
    const files = new HandoffFiles(folder())
    await files.write(document())
    assert.ok(read(files.guide).startsWith('# How to work through the review tasks'))
  })

  it('writes the tasks of this send only', async () => {
    const files = new HandoffFiles(folder())
    await files.write(document())
    await files.write(document([{ ...task, id: 'secondTask' }]))
    assert.ok(read(files.tasks).includes('secondTask'))
    assert.ok(!read(files.tasks).includes('firstTask'))
  })

  it('leaves no temporary file behind', async () => {
    const files = new HandoffFiles(folder())
    await files.write(document())
    assert.equal(readdirSync(files.folder).length, 3)
  })

  it('names the done file inside the same folder', () => {
    const place = folder()
    assert.equal(new HandoffFiles(place).done, path.join(place, 'done.txt'))
  })

  it('makes an empty done file', async () => {
    const files = new HandoffFiles(folder())
    await files.write(document())
    assert.ok(statSync(files.done).isFile())
    assert.equal(read(files.done), '')
  })

  it('keeps every line an agent already wrote', async () => {
    const files = new HandoffFiles(folder())
    await files.write(document())
    writeFileSync(files.done, 'firstTask\n')
    await files.write(document())
    assert.equal(read(files.done), 'firstTask\n')
  })

  it('the task file carries no escape sequence', async () => {
    const files = new HandoffFiles(folder())
    await files.write(document([{ ...task, text: `red${ESCAPE}[31m alert` }]))
    const written = readFileSync(files.tasks)
    assert.ok(!written.includes(0x1b), written.toString('utf8'))
    assert.ok(written.toString('utf8').includes('red[31m alert'), written.toString('utf8'))
  })
})
