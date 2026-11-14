import assert from 'node:assert/strict'

import { RULES, TITLE } from '../../../src/handoff/agentGuide'
import { EMPTY, type PromptFolder, closing, copyPrompt } from '../../../src/handoff/copyPrompt'
import type { ReviewTask } from '../../../src/tasks/reviewTask'
import { task } from '../tasks/fixtures'

const API_COMMIT = '44787c6a1b2c3d4e5f60718293a4b5c6d7e8f900'
const WEB_COMMIT = '9f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b706'
const API_DONE = 'E:/work/api/.git/y-review/done.txt'
const WEB_DONE = 'E:/work/web/.git/y-review/done.txt'
const NO_FILE = 'Name every finished identifier in your answer instead.'
const RULE_HEAD = '## What an identifier looks like'

const comment = task({
  id: 'a1b2c3',
  path: 'src/Parser.kt',
  startLine: 88,
  endLine: 94,
  text: 'This reload reads git on the user interface thread.',
})

const todo = task({
  id: 'todo-0f1e2d3c-12',
  kind: 'todo',
  path: 'src/Cache.kt',
  startLine: 12,
  endLine: 12,
  text: 'TODO: drop the second lookup.',
})

const api = (tasks: readonly ReviewTask[] = [comment], written = true): PromptFolder => ({
  store: 'git',
  name: 'api',
  root: 'E:/work/api',
  done: written ? API_DONE : '',
  commit: API_COMMIT,
  tasks,
  written,
})

const web = (tasks: readonly ReviewTask[] = [todo]): PromptFolder => ({
  store: 'git',
  name: 'web',
  root: 'E:/work/web',
  done: WEB_DONE,
  commit: WEB_COMMIT,
  tasks,
  written: true,
})

const notes = (tasks: readonly ReviewTask[] = [comment]): PromptFolder => ({
  store: 'folder',
  name: 'site',
  root: 'E:/work/site',
  done: 'E:/work/site/.y-review/done.txt',
  commit: 'worktree',
  tasks,
  written: true,
})

const count = (text: string, part: string): number => text.split(part).length - 1

const has = (text: string, part: string): void => assert.ok(text.includes(part), text)

const before = (text: string, first: string, second: string): void =>
  assert.ok(text.indexOf(first) < text.indexOf(second), text)

describe('copy prompt', () => {
  // --- One folder ---

  it('opens with the title of the rules', () => {
    assert.equal(copyPrompt([api()]).split('\n')[0], TITLE)
  })

  it('counts the tasks and the folders of one group', () => {
    has(copyPrompt([api()]), 'You work through 1 open review task in 1 folder.')
  })

  it('carries the rules of the agent whole', () => {
    has(copyPrompt([api()]), RULES)
  })

  it('names the repository the file paths start from', () => {
    has(copyPrompt([api()]), '- The repository is `E:/work/api`.')
  })

  it('names the whole path of the done file', () => {
    has(copyPrompt([api()]), `- Report a finished task in \`${API_DONE}\`.`)
  })

  it('names the short commit of the folder', () => {
    has(copyPrompt([api()]), '- The tasks belong to the git commit 44787c6.')
  })

  it('numbers the only folder as one of one', () => {
    has(copyPrompt([api()]), '## Folder 1 of 1: api')
  })

  // --- Several folders ---

  it('names every folder of a project of two repositories', () => {
    const text = copyPrompt([api(), web()])
    has(text, '## Folder 1 of 2: api')
    has(text, '## Folder 2 of 2: web')
  })

  it('gives each folder the done file of that folder', () => {
    const text = copyPrompt([api(), web()])
    has(text, `\`${API_DONE}\``)
    has(text, `\`${WEB_DONE}\``)
  })

  it('reads the rules once for two folders', () => {
    assert.equal(count(copyPrompt([api(), web()]), RULE_HEAD), 1)
  })

  it('counts the tasks of every folder together', () => {
    has(copyPrompt([api(), web()]), 'You work through 2 open review tasks in 2 folders.')
  })

  it('puts the done file of a folder in front of the tasks of that folder', () => {
    const text = copyPrompt([api(), web()])
    before(text, API_DONE, 'a1b2c3 comment')
    before(text, 'a1b2c3 comment', WEB_DONE)
  })

  // --- The order of the groups ---

  it('keeps the folders in the order the caller gives', () => {
    const text = copyPrompt([web(), api()])
    has(text, '## Folder 1 of 2: web')
    has(text, '## Folder 2 of 2: api')
    before(text, 'todo-0f1e2d3c-12', 'a1b2c3')
  })

  it('keeps the tasks of one folder together and in order', () => {
    const text = copyPrompt([api([comment, todo]), web([{ ...comment, id: 'ff00aa' }])])
    before(text, 'a1b2c3', 'todo-0f1e2d3c-12')
    before(text, 'todo-0f1e2d3c-12', 'ff00aa')
  })

  // --- An empty selection ---

  it('says that no task is selected when the list is empty', () => {
    assert.equal(copyPrompt([]), EMPTY)
  })

  it('says that no task is selected when every folder is empty', () => {
    assert.equal(copyPrompt([api([])]), EMPTY)
  })

  it('leaves a folder without a task out of the prompt', () => {
    const text = copyPrompt([api([]), web()])
    has(text, '## Folder 1 of 1: web')
    assert.ok(!text.includes('E:/work/api'), text)
  })

  // --- A folder the extension could not write ---

  it('names no done file when the write failed', () => {
    assert.ok(!copyPrompt([api([comment], false)]).includes('Report a finished task in'))
  })

  it('asks for the answer when the write failed', () => {
    has(copyPrompt([api([comment], false)]), NO_FILE)
  })

  it('keeps the tasks of a folder the write failed for', () => {
    has(copyPrompt([api([comment], false)]), 'a1b2c3 comment src/Parser.kt:88-94')
  })

  it('leaves the other folders whole when one write failed', () => {
    const text = copyPrompt([api([comment], false), web()])
    has(text, `- Report a finished task in \`${WEB_DONE}\`.`)
    assert.equal(count(text, NO_FILE), 1)
  })

  it('names no commit when the repository is gone', () => {
    assert.equal(
      closing({ ...api([comment], false), commit: '' }),
      [
        '- The repository is `E:/work/api`.',
        '- Every file path below starts from that folder.',
        `- Yreview writes no file for this folder, and it reads no report file here. ${NO_FILE}`,
      ].join('\n'),
    )
  })

  // --- The identifiers ---

  it('carries the identifier of every task unchanged', () => {
    const text = copyPrompt([api([comment]), web([todo])])
    has(text, 'a1b2c3 comment src/Parser.kt:88-94')
    has(text, 'todo-0f1e2d3c-12 todo src/Cache.kt:12')
  })

  it('carries the text of every task', () => {
    const text = copyPrompt([api(), web()])
    has(text, 'This reload reads git on the user interface thread.')
    has(text, 'TODO: drop the second lookup.')
  })

  // --- A folder store ---

  it('a folder store names the folder and never a repository', () => {
    const text = copyPrompt([notes()])
    has(text, '- The folder is `E:/work/site`.')
    assert.ok(!text.includes('- The repository is'), text)
  })

  it('a folder store names no commit', () => {
    assert.ok(!copyPrompt([notes()]).includes('belong to the git commit'))
  })

  it('a folder store names its own done file', () => {
    has(copyPrompt([notes()]), '- Report a finished task in `E:/work/site/.y-review/done.txt`.')
  })

  it('a git folder and a folder store reach one prompt together', () => {
    const text = copyPrompt([api(), notes()])
    has(text, '- The repository is `E:/work/api`.')
    has(text, '- The folder is `E:/work/site`.')
    assert.equal(count(text, RULE_HEAD), 1)
  })

  it('answers the closing instructions of a folder store', () => {
    assert.equal(
      closing(notes()),
      [
        '- The folder is `E:/work/site`.',
        '- Every file path below starts from that folder.',
        '- No git repository holds this folder, so the comments live in the `.y-review` folder and no commit belongs to them.',
        '- Report a finished task in `E:/work/site/.y-review/done.txt`.',
      ].join('\n'),
    )
  })

  // --- The closing instructions of one store ---

  it('answers the closing instructions of a git folder', () => {
    assert.equal(
      closing(api()),
      [
        '- The repository is `E:/work/api`.',
        '- Every file path below starts from that folder.',
        '- The tasks belong to the git commit 44787c6.',
        `- Report a finished task in \`${API_DONE}\`.`,
      ].join('\n'),
    )
  })
})
