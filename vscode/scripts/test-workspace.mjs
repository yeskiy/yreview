import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { plainFolder } from './plain-folder.mjs'

const root = path.resolve('.vscode-test', 'workspace')
const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'ignore' })

rmSync(root, { recursive: true, force: true })
mkdirSync(path.join(root, 'src'), { recursive: true })
writeFileSync(path.join(root, 'src', 'a.txt'), 'one\ntwo\nthree\n')
git('init', '-q', '-b', 'main')
git('config', 'user.email', 'reviewer@example.com')
git('config', 'user.name', 'Reviewer')
git('config', 'commit.gpgsign', 'false')
git('add', '.')
git('commit', '-q', '-m', 'init')
console.log(`The test workspace is ${root}.`)

const plain = plainFolder()
rmSync(plain, { recursive: true, force: true })
mkdirSync(path.join(plain, 'notes'), { recursive: true })
writeFileSync(path.join(plain, 'notes', 'one.md'), '# One\n\nA note.\n')
const inside = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: plain, encoding: 'utf8' })
if (inside.status === 0) {
  throw new Error(
    `The plain test folder ${plain} is inside the git repository ${inside.stdout.trim()}.`,
  )
}
console.log(`The plain test folder is ${plain}.`)
