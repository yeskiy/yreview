import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { type HandleKey, handleOf, keyOf, matchKey } from '../../src/core/handles'
import { discoveryFileName, windowFolderName } from '../../src/core/paths'
import { decodeRecord, encodeRecord, recordId } from '../../src/core/record'
import {
  assignTodoIds,
  legacyTodoId,
  normalTodoText,
  repositoryOf,
  todoId,
} from '../../src/core/taskIds'

const vectors = (name: string): unknown =>
  JSON.parse(readFileSync(path.resolve(__dirname, '../../../spec/vectors', name), 'utf8'))

interface RecordCase {
  name: string
  line: string
  canonical: string | null
  id: string | null
}
interface TodoFile {
  repositoryOf: { basePath: string | null; rootPath: string; repository: string }[]
  normal: { text: string; normal: string }[]
  forTodo: { repository: string; path: string; text: string; order: number; id: string }[]
  assign: { repository: string; path: string; texts: string[]; ids: string[] }[]
  legacy: { path: string; line: number; id: string }[]
}
interface HandleFile {
  of: { id: string; handle: string }[]
  keyOf: { text: string; key: HandleKey | null }[]
}
interface MatchCase {
  name: string
  text: string
  ids: string[]
  result: unknown
}
interface NoteCase {
  name: string
  lines: string[]
  ids: (string | null)[]
}
interface NameFile {
  discovery: { path: string; name: string }[]
  window: { path: string; name: string }[]
}

describe('spec vectors', () => {
  ;(vectors('records.json') as RecordCase[]).forEach((c) =>
    it(`record ${c.name}`, () => {
      const record = decodeRecord(c.line)
      assert.equal(record === undefined ? null : encodeRecord(record), c.canonical)
      assert.equal(record === undefined ? null : recordId(record), c.id)
    }),
  )

  const todo = vectors('todo-ids.json') as TodoFile
  todo.repositoryOf.forEach((c) =>
    it(`repository of ${c.rootPath} in ${String(c.basePath)}`, () =>
      assert.equal(repositoryOf(c.basePath ?? undefined, c.rootPath), c.repository)),
  )
  todo.normal.forEach((c) =>
    it(`normal text of ${JSON.stringify(c.text)}`, () =>
      assert.equal(normalTodoText(c.text), c.normal)),
  )
  todo.forTodo.forEach((c) =>
    it(`todo id of ${c.repository}:${c.path} ${JSON.stringify(c.text)} ${c.order}`, () =>
      assert.equal(todoId(c.repository, c.path, c.text, c.order), c.id)),
  )
  todo.assign.forEach((c) =>
    it(`assigned ids of ${c.texts.length} items in ${JSON.stringify(c.repository)}`, () =>
      assert.deepEqual(
        assignTodoIds(
          c.repository,
          c.texts.map((text) => ({ path: c.path, text })),
        ).map((t) => t.id),
        c.ids,
      )),
  )
  todo.legacy.forEach((c) =>
    it(`older todo id of ${c.path}:${c.line}`, () =>
      assert.equal(legacyTodoId(c.path, c.line), c.id)),
  )

  const handles = vectors('handles.json') as HandleFile
  handles.of.forEach((c, index) =>
    it(`handle ${index} of ${JSON.stringify(c.id)}`, () => assert.equal(handleOf(c.id), c.handle)),
  )
  handles.keyOf.forEach((c, index) =>
    it(`key ${index} of ${JSON.stringify(c.text)}`, () =>
      assert.deepEqual(keyOf(c.text) ?? null, c.key)),
  )

  ;(vectors('match.json') as MatchCase[]).forEach((c) =>
    it(`match ${c.name}`, () => {
      const key = keyOf(c.text)
      assert.deepEqual(key === undefined ? null : matchKey(key, c.ids), c.result)
    }),
  )

  ;(vectors('notes.json') as NoteCase[]).forEach((c) =>
    it(`record ids of note ${c.name}`, () =>
      assert.deepEqual(
        c.lines.map((line) => {
          const record = decodeRecord(line)
          return record === undefined ? null : recordId(record)
        }),
        c.ids,
      )),
  )

  const names = vectors('names.json') as NameFile
  names.discovery.forEach((c) =>
    it(`discovery file name of ${JSON.stringify(c.path)}`, () =>
      assert.equal(discoveryFileName(c.path), c.name)),
  )
  names.window.forEach((c) =>
    it(`window folder name of ${JSON.stringify(c.path)}`, () =>
      assert.equal(windowFolderName(c.path), c.name)),
  )
})
