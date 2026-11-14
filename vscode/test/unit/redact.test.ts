import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { PROJECT_MARK, REPOSITORY_MARK, redactText, windowsPath } from '../../src/core/redact'

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
