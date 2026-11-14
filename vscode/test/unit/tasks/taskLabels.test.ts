import assert from 'node:assert/strict'

import {
  MORE,
  ROW_LIMIT,
  TOOLTIP_LIMIT,
  TOOLTIP_LINES,
  fileCount,
  fileTitle,
  firstLine,
  folderCount,
  folderTitle,
  linesOf,
  plainText,
  rowText,
  taskState,
  taskTitle,
  tooltipLines,
  tooltipPlace,
} from '../../../src/tasks/taskLabels'
import type { TaskGroup } from '../../../src/tasks/taskTree'
import { task, todo as todoTask } from './fixtures'

const escape = String.fromCharCode(27)

const comment = task({
  id: 'a1b2c3',
  path: 'src/main/kotlin/Parser.kt',
  startLine: 88,
  endLine: 94,
  text: 'first line\nsecond line',
  state: 'local',
})

const todo = todoTask({
  id: 'todo-abc-12',
  path: 'src/main/kotlin/Parser.kt',
  startLine: 12,
  endLine: 12,
  text: 'TODO: drop this',
  pattern: 'TODO',
})

const part = { ...comment, startColumn: 4, endColumn: 9 }

const group = (path: string, tasks: TaskGroup['tasks'], name = path): TaskGroup => ({
  path,
  tasks,
  name,
})

describe('task labels', () => {
  it('shows the characters when the task names a part of a line', () => {
    assert.equal(linesOf(part), '88:4-94:9')
  })

  it('shows the characters in the tooltip of a part of a line', () => {
    assert.equal(tooltipPlace(part), 'src/main/kotlin/Parser.kt:88:4-94:9')
  })

  it('writes the characters in the plain text of a part of a line', () => {
    assert.equal(
      plainText(part),
      'a1b2c3 comment src/main/kotlin/Parser.kt:88:4-94:9\nfirst line\nsecond line',
    )
  })

  it('shows one line number when the task holds one line', () => {
    assert.equal(linesOf(todo), '12')
  })

  it('shows the range when the task holds several lines', () => {
    assert.equal(linesOf(comment), '88-94')
  })

  it('shows the first line of the text after the line number', () => {
    assert.equal(taskTitle(comment), '88-94: first line...')
  })

  it('shows how a comment is stored', () => {
    assert.equal(taskState(comment), 'local')
  })

  it('shows the word of a todo', () => {
    assert.equal(taskState(todo), 'TODO')
  })

  it('names the file and the count of a group', () => {
    const both = group('src/main/kotlin/Parser.kt', [comment, todo])
    assert.equal(fileTitle(both), 'src/main/kotlin/Parser.kt')
    assert.equal(fileCount(both), '2 tasks')
  })

  it('names one task in the singular', () => {
    assert.equal(fileCount(group('a', [todo])), '1 task')
  })

  it('names one row of a directory tree by its file name', () => {
    assert.equal(fileTitle(group('src/main/kotlin/Parser.kt', [comment], 'Parser.kt')), 'Parser.kt')
  })

  it('names a folder and counts every task under it', () => {
    const folder = {
      name: 'core',
      kind: 'folder' as const,
      folders: [],
      files: [group('src/main/kotlin/Parser.kt', [comment, todo])],
    }
    assert.equal(folderTitle(folder), 'core')
    assert.equal(folderCount(folder), '2 tasks')
  })

  it('keeps a short line of one line whole', () => {
    assert.equal(taskTitle(todo), '12: TODO: drop this')
    assert.equal(rowText(todo.text), 'TODO: drop this')
  })

  it('keeps the first line only when the text holds several lines', () => {
    const long = {
      ...todo,
      text: ['TODO: drop this', 'after the release', 'of the parser'].join('\n'),
    }
    assert.equal(taskTitle(long), '12: TODO: drop this...')
  })

  it('cuts a line that is longer than the row limit', () => {
    const row = rowText('x'.repeat(ROW_LIMIT + 40))
    assert.equal(row, `${'x'.repeat(ROW_LIMIT)}${MORE}`)
    assert.equal(row.length, ROW_LIMIT + MORE.length)
  })

  it('a cut of the row keeps every character whole', () => {
    const wide = String.fromCodePoint(0x1f680)
    assert.equal(
      rowText(`${'x'.repeat(ROW_LIMIT - 1)}${wide}tail`),
      `${'x'.repeat(ROW_LIMIT - 1)}${MORE}`,
    )
  })

  it('keeps a line of the length of the row limit whole', () => {
    const edge = 'y'.repeat(ROW_LIMIT)
    assert.equal(rowText(edge), edge)
  })

  it('puts no line break in a row', () => {
    const row = rowText('first line\nsecond line')
    assert.equal(row, 'first line...')
    assert.equal(row.includes('\n'), false)
  })

  it('drops the blank lines in front of the text', () => {
    assert.equal(rowText('\n   \nfirst line\nsecond line'), 'first line...')
    assert.equal(firstLine('\n   \n  first line  \n'), 'first line')
    assert.equal(firstLine('   '), '')
  })

  it('the clipboard keeps the whole text of a long comment', () => {
    const long = { ...comment, text: `${'z'.repeat(ROW_LIMIT + 40)}\nsecond line` }
    assert.equal(plainText(long).includes('z'.repeat(ROW_LIMIT + 40)), true)
    assert.equal(plainText(long).includes('second line'), true)
  })

  it('the tooltip names the place and holds every line', () => {
    assert.equal(tooltipPlace(comment), 'src/main/kotlin/Parser.kt:88-94')
    assert.deepEqual(tooltipLines(comment.text), ['first line', 'second line'])
  })

  it('a very long text ends in the tooltip', () => {
    const lines = tooltipLines('z'.repeat(1_000_000))
    assert.ok(lines.join('\n').length < TOOLTIP_LIMIT * 2, `${lines.join('\n').length} characters`)
    assert.equal(lines.at(-1), MORE)
  })

  it('a text of many lines ends in the tooltip', () => {
    const lines = tooltipLines(
      Array.from({ length: 5_000 }, (_, index) => `line ${index + 1}`).join('\n'),
    )
    assert.equal(lines[0], 'line 1')
    assert.equal(lines.includes(`line ${TOOLTIP_LINES + 1}`), false)
    assert.equal(lines.at(-1), MORE)
  })

  it('the tooltip still shows more than the row', () => {
    assert.equal(tooltipLines('z'.repeat(ROW_LIMIT * 4)).includes('z'.repeat(ROW_LIMIT * 4)), true)
  })

  it('writes the whole identifier in the plain text', () => {
    assert.equal(
      plainText(comment),
      'a1b2c3 comment src/main/kotlin/Parser.kt:88-94\nfirst line\nsecond line',
    )
  })

  it('names the kind of a todo in the plain text', () => {
    assert.equal(plainText(todo), 'todo-abc-12 todo src/main/kotlin/Parser.kt:12\nTODO: drop this')
  })

  it('the clipboard text carries no escape sequence', () => {
    const text = plainText({ ...comment, text: `red${escape}[31m alert` })
    assert.equal(text.includes(escape), false)
    assert.equal(text.includes('red[31m alert'), true)
  })

  it('the clipboard text keeps the lines of the comment', () => {
    assert.equal(plainText(comment).includes('first line\nsecond line'), true)
  })

  it('the clipboard text carries no control character in the path', () => {
    const text = plainText({ ...comment, path: `src/Parser.kt${escape}[31m\r\nrm -rf /` })
    assert.equal(text.includes(escape), false)
    assert.equal(text, 'a1b2c3 comment src/Parser.kt[31mrm -rf /:88-94\nfirst line\nsecond line')
  })
})
