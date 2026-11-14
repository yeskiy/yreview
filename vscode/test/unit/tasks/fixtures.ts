import type { ReviewTask } from '../../../src/tasks/reviewTask'

/** A task with plain values. Each test names only the fields it reads. */
export const task = (change: Partial<ReviewTask> = {}): ReviewTask => ({
  id: 'a'.repeat(40),
  kind: 'comment',
  path: 'src/Main.kt',
  startLine: 1,
  endLine: 1,
  text: 'Check this.',
  filePath: 'E:/repo/src/Main.kt',
  rootPath: 'E:/repo',
  revision: 'c1',
  state: 'local',
  folder: '',
  patternRule: '',
  resolved: false,
  ...change,
})

export const todo = (change: Partial<ReviewTask> = {}): ReviewTask =>
  task({
    id: `todo-${'b'.repeat(40)}-0`,
    kind: 'todo',
    text: 'TODO: drop this',
    pattern: 'TODO',
    state: '',
    patternRule: '\\btodo\\b.*',
    ...change,
  })
