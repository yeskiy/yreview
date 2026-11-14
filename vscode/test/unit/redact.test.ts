import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  CAUSES,
  type CleanFailure,
  PROJECT_MARK,
  REPOSITORY_MARK,
  failureText,
  redactFailure,
  redactText,
  windowsPath,
} from '../../src/core/redact'

interface RedactCase {
  name: string
  input: string
  homes: string[]
  projects: string[]
  repositories: string[]
  output: string
}

const home = 'C:/Users/alice'

describe('redaction', () => {
  describe('shared vectors', () =>
    (
      JSON.parse(
        readFileSync(path.resolve(__dirname, '../../../spec/vectors/redact.json'), 'utf8'),
      ) as RedactCase[]
    ).forEach((c) =>
      it(c.name, () =>
        assert.equal(redactText(c.input, c.homes, c.projects, c.repositories), c.output),
      ),
    ))

  it('turns a WSL path into a Windows path', () => {
    assert.equal(windowsPath('/mnt/e/work/demo/'), 'E:/work/demo')
    assert.equal(windowsPath('/mnt/c'), 'C:/')
    assert.equal(windowsPath('C:\\a\\b'), 'C:/a/b')
  })

  it('removes a repository root outside the project', () =>
    assert.equal(
      redactText(
        'git failed in D:/repos/shared-lib/.git',
        [home],
        ['E:/work/demo-repo'],
        ['D:/repos/shared-lib'],
      ),
      `git failed in ${REPOSITORY_MARK}/.git`,
    ))

  it('keeps the longer match for a repository inside the home folder', () =>
    assert.equal(
      redactText('C:/Users/alice/code/lib/a.kt', [home], [], ['C:/Users/alice/code/lib']),
      `${REPOSITORY_MARK}/a.kt`,
    ))

  it('keeps the longer match for a project inside a repository', () =>
    assert.equal(
      redactText(
        'E:/mono/apps/web/a.kt and E:/mono/b.kt',
        [home],
        ['E:/mono/apps/web'],
        ['E:/mono'],
      ),
      `${PROJECT_MARK}/a.kt and ${REPOSITORY_MARK}/b.kt`,
    ))

  it('removes every open folder', () =>
    assert.equal(
      redactText('E:/one/a.kt and F:/two/b.kt', [home], ['E:/one', 'F:/two'], []),
      `${PROJECT_MARK}/a.kt and ${PROJECT_MARK}/b.kt`,
    ))
})

describe('a failure', () => {
  const clean = (text: string): string =>
    redactText(text, [home], ['E:/work/demo-repo'], ['D:/repos/lib'])
  const named = (name: string, message: string, cause?: unknown): Error =>
    Object.assign(new Error(message, { cause }), { name })

  it('follows the rules of a text in its message', () =>
    assert.equal(
      failureText(
        redactFailure(
          named('AccessDeniedError', 'E:/work/demo-repo/.git/yreview/tasks.json'),
          clean,
        ),
      ),
      'AccessDeniedError: <project>/.git/yreview/tasks.json',
    ))

  // A JavaScript frame names a file, so each frame goes through the same rules.
  it('keeps each frame without the folders of the user', () => {
    const kept = redactFailure(
      Object.assign(new Error('no store at C:/Users/alice/store'), {
        stack:
          'Error: no store\n    at load (C:\\Users\\alice\\ext\\dist\\extension.js:1:200)\n    at run (node:internal/x:2:3)',
      }),
      clean,
    )
    assert.deepEqual(kept.frames, [
      'at load (~/ext/dist/extension.js:1:200)',
      'at run (node:internal/x:2:3)',
    ])
    assert.equal(failureText(kept), 'Error: no store at ~/store')
  })

  it('cleans the cause as well', () =>
    assert.equal(
      failureText(
        redactFailure(
          named('ReadError', 'the read failed', named('IOError', 'E:/work/demo-repo/notes')),
          clean,
        ).cause ?? assert.fail('no cause'),
      ),
      'IOError: <project>/notes',
    ))

  it('keeps the name of a failure without a message', () =>
    assert.equal(failureText(redactFailure(new TypeError(), clean)), 'TypeError'))

  it('ends a ring of causes', () => {
    const first = new Error('first')
    Object.assign(first, { cause: new Error('second', { cause: first }) })
    const depth = (failure: CleanFailure | undefined): number =>
      failure?.cause === undefined ? 0 : 1 + depth(failure.cause)
    assert.equal(depth(redactFailure(first, clean)), CAUSES)
  })

  it('loses the repository root', () =>
    assert.equal(
      failureText(redactFailure(named('IOError', 'D:/repos/lib is locked'), clean)),
      `IOError: ${REPOSITORY_MARK} is locked`,
    ))

  it('names a thrown value that is no Error by its type', () =>
    assert.equal(
      failureText(redactFailure('E:/work/demo-repo is gone', clean)),
      `string: ${PROJECT_MARK} is gone`,
    ))
})
