import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

export const scratchDir = (): string =>
  realpathSync(mkdtempSync(path.join(tmpdir(), 'yreview-test-')))

const configure = (dir: string): void => {
  git(dir, 'config', 'user.email', 'reviewer@example.com')
  git(dir, 'config', 'user.name', 'Reviewer')
  git(dir, 'config', 'commit.gpgsign', 'false')
}

export const makeRepo = (dir: string = scratchDir()): string => {
  git(dir, 'init', '-q', '-b', 'main')
  configure(dir)
  mkdirSync(path.join(dir, 'src'), { recursive: true })
  writeFileSync(path.join(dir, 'src', 'a.txt'), 'one\ntwo\nthree\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'init')
  return dir
}

export const removeDir = (dir: string): void => rmSync(dir, { recursive: true, force: true })

export const makeRemote = (): { readonly bare: string; readonly clone: () => string } => {
  const bare = scratchDir()
  git(bare, 'init', '-q', '--bare', '-b', 'main')
  const seed = makeRepo()
  git(seed, 'remote', 'add', 'origin', bare)
  git(seed, 'push', '-q', 'origin', 'main')
  removeDir(seed)
  return {
    bare,
    clone: () => {
      const dir = scratchDir()
      git(dir, 'clone', '-q', bare, '.')
      configure(dir)
      return dir
    },
  }
}
