import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

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
