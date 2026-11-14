import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  type GitResult,
  type GitRunner,
  ProcessGitRunner,
  TOO_MUCH_OUTPUT,
} from '../../../src/git/runner'
import { type GrepLine, grepTodos } from '../../../src/tasks/todoScan'
import { git, makeRepo, removeDir } from '../../fixtures/scratch'

const answering = (result: GitResult): GitRunner & { readonly runs: () => number } => {
  const calls: (readonly string[])[] = []
  return {
    run: (args) => {
      calls.push(args)
      return Promise.resolve(result)
    },
    runs: () => calls.length,
  }
}

describe('grepTodos', function todoGrep() {
  this.timeout(120_000)
  const dir = makeRepo()
  const lines: { value: readonly GrepLine[] | undefined } = { value: undefined }
  const write = (name: string, content: string | Buffer): void => {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true })
    writeFileSync(path.join(dir, name), content)
  }

  before(async () => {
    git(dir, 'config', 'core.autocrlf', 'false')
    write('src/tracked.ts', '// TODO: tracked one\nconst a = 1\n')
    write('src/crlf.py', '# FIXME: crlf\r\n')
    write('.gitignore', 'build/\n')
    write('build/out.js', '// TODO: ignored\n')
    write('src/bin.dat', Buffer.from([0x54, 0x4f, 0x44, 0x4f, 0, 0x78]))
    mkdirSync(path.join(dir, 'inner'))
    makeRepo(path.join(dir, 'inner'))
    writeFileSync(path.join(dir, 'inner', 'x.ts'), '// TODO: inner\n')
    git(path.join(dir, 'inner'), 'add', 'x.ts')
    git(path.join(dir, 'inner'), 'commit', '-q', '-m', 'files')
    git(dir, 'add', '.gitignore', 'src/tracked.ts', 'src/crlf.py', 'src/bin.dat')
    git(dir, 'commit', '-q', '-m', 'files')
    write('src/new.md', '<!-- TODO: untracked -->\n')
    lines.value = await grepTodos(new ProcessGitRunner(dir), ['todo', 'fixme'])
  })
  after(() => removeDir(dir))

  const paths = (): readonly string[] => [...new Set((lines.value ?? []).map((line) => line.path))]

  it('reads tracked and untracked files', () => {
    assert.deepEqual([...paths()].sort(), ['src/crlf.py', 'src/new.md', 'src/tracked.ts'])
  })

  it('skips ignored files, binary files and nested repositories', () => {
    assert.ok(!paths().includes('build/out.js'))
    assert.ok(!paths().includes('src/bin.dat'))
    assert.ok(!paths().some((name) => name.startsWith('inner/')))
  })

  it('keeps the carriage return at the end of a CRLF line', () => {
    const line = lines.value?.find((grep) => grep.path === 'src/crlf.py')
    assert.equal(line?.line, 1)
    assert.equal(line?.content, '# FIXME: crlf\r')
  })

  it('gives the line number and the content of a tracked line', () => {
    assert.deepEqual(
      lines.value?.find((grep) => grep.path === 'src/tracked.ts'),
      { path: 'src/tracked.ts', line: 1, content: '// TODO: tracked one' },
    )
  })

  it('an empty word list runs no git', async () => {
    const runner = answering({ exitCode: 0, stdout: '', stderr: '' })
    assert.deepEqual(await grepTodos(runner, []), [])
    assert.equal(runner.runs(), 0)
  })

  it('no match gives an empty list', async () => {
    assert.deepEqual(
      await grepTodos(answering({ exitCode: 1, stdout: '', stderr: '' }), ['todo']),
      [],
    )
  })

  it('an answer of the runner gives nothing', async () => {
    assert.equal(
      await grepTodos(answering({ exitCode: TOO_MUCH_OUTPUT, stdout: '', stderr: 'x' }), ['todo']),
      undefined,
    )
  })
})
