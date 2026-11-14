import assert from 'node:assert/strict'

import { WORKTREE } from '../../../src/core/anchor'
import { handoffPrompt } from '../../../src/handoff/handoffPrompt'
import type { ReviewTask } from '../../../src/tasks/reviewTask'
import { task as base } from '../tasks/fixtures'

const COMMIT = '44787c6a1b2c3d4e5f60718293a4b5c6d7e8f900'

const task = (id: string, path: string, line: number): ReviewTask =>
  base({ id, kind: 'todo', path, startLine: line, endLine: line, text: `TODO: work on ${id}` })

const comment = base({
  id: 'a1b2c3',
  path: 'src/Parser.kt',
  startLine: 88,
  endLine: 94,
  text: 'This reload reads git on the user interface thread.',
})

const line = (text: string, index: number): string | undefined => text.split('\n')[index]

describe('handoff prompt', () => {
  it('names the two files in the first line', () => {
    assert.equal(
      line(handoffPrompt('.git/y-review', COMMIT, [comment]), 0),
      'Read .git/y-review/AGENT.md, then work through .git/y-review/tasks.json.',
    )
  })

  it('counts the tasks and the files in the second line', () => {
    assert.equal(
      line(handoffPrompt('.git/y-review', COMMIT, [comment, task('t1', 'src/A.kt', 4)]), 1),
      '2 open tasks in 2 files at commit 44787c6.',
    )
  })

  it('counts one task and one file in the singular', () => {
    assert.equal(
      line(handoffPrompt('.git/y-review', COMMIT, [comment]), 1),
      '1 open task in 1 file at commit 44787c6.',
    )
  })

  it('counts one file for two tasks of that file', () => {
    assert.equal(
      line(
        handoffPrompt('.git/y-review', COMMIT, [
          task('t1', 'src/A.kt', 4),
          task('t2', 'src/A.kt', 9),
        ]),
        1,
      ),
      '2 open tasks in 1 file at commit 44787c6.',
    )
  })

  it('carries the whole identifier of every task', () => {
    const text = handoffPrompt('.git/y-review', COMMIT, [comment, task('t1', 'src/A.kt', 4)])
    assert.ok(text.includes('a1b2c3 comment src/Parser.kt:88-94'), text)
    assert.ok(text.includes('t1 todo src/A.kt:4'), text)
  })

  it('carries the text of every task', () => {
    const text = handoffPrompt('.git/y-review', COMMIT, [comment])
    assert.ok(text.includes('This reload reads git on the user interface thread.'), text)
  })

  it('a folder store names the counts without a commit', () => {
    assert.equal(line(handoffPrompt('.y-review', WORKTREE, [comment]), 1), '1 open task in 1 file.')
  })

  it('a folder store still names the two files and the tasks', () => {
    const text = handoffPrompt('.y-review', WORKTREE, [comment])
    assert.equal(line(text, 0), 'Read .y-review/AGENT.md, then work through .y-review/tasks.json.')
    assert.ok(text.includes('a1b2c3 comment src/Parser.kt:88-94'), text)
  })

  it('an empty commit names no commit', () => {
    assert.equal(line(handoffPrompt('.y-review', '', [comment]), 1), '1 open task in 1 file.')
  })

  it('names the folder of a worktree in the whole path', () => {
    const text = handoffPrompt('E:/main/.git/worktrees/tree/y-review', COMMIT, [comment])
    assert.ok(text.startsWith('Read E:/main/.git/worktrees/tree/y-review/AGENT.md,'), text)
  })
})
