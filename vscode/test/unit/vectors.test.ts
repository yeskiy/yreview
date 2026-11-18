import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { planAnchor } from '../../src/core/anchor'
import { type HandleKey, handleOf, keyOf, matchKey } from '../../src/core/handles'
import { type Carry, type FileDiff, carryOf, parseDiff, splitLines } from '../../src/core/lineMap'
import { discoveryFileName, windowFolderName } from '../../src/core/paths'
import { type RecordRange, decodeRecord, encodeRecord, recordId } from '../../src/core/record'
import {
  assignTodoIds,
  legacyTodoId,
  normalTodoText,
  repositoryOf,
  todoId,
} from '../../src/core/taskIds'
import { parentOf, rootLabel, storeWalk } from '../../src/core/storeRules'
import { prefixOf, rewriteRecords } from '../../src/store/migration'

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
interface CarryFile {
  parse: { name: string; diff: string; files: FileDiff[] }[]
  lines: { text: string; lines: string[] }[]
  carry: {
    name: string
    diff: string
    path: string
    range: RecordRange | null
    current: string[]
    text?: string
    head?: boolean
    refused?: boolean
    carry: unknown
  }[]
}

const carryJson = (carry: Carry): unknown => {
  if (carry.kind === 'same') return { kind: 'same', range: carry.range ?? null }
  return carry.kind === 'outdated'
    ? { kind: 'outdated', range: carry.range, original: carry.original }
    : { kind: carry.kind }
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

  const carryFile = vectors('carry.json') as CarryFile
  carryFile.parse.forEach((c) =>
    it(`diff parse ${c.name}`, () => assert.deepEqual([...parseDiff(c.diff).values()], c.files)),
  )
  carryFile.lines.forEach((c) =>
    it(`line split of ${JSON.stringify(c.text)}`, () =>
      assert.deepEqual(splitLines(c.text), c.lines)),
  )
  carryFile.carry.forEach((c) =>
    it(`carry ${c.name}`, () =>
      assert.deepEqual(
        carryJson(
          carryOf(
            parseDiff(c.diff).get(c.path),
            c.range ?? undefined,
            c.current,
            c.text,
            c.head,
            c.refused,
          ),
        ),
        c.carry,
      )),
  )
})

interface StoreFile {
  parent: { path: string; parent: string | null }[]
  walk: {
    name: string
    dir: string
    workspaceRoot: string | null
    home: string | null
    walk: string[]
  }[]
  locate: {
    name: string
    file: string
    repository: { root: string; head: string | null } | null
    workspaceRoot: string | null
    home: string | null
    stores: string[]
    plan: Record<string, unknown>
  }[]
  label: { root: string; home: string | null; label: string }[]
  prefix: { repository: string; folder: string; prefix: string | null }[]
  rewrite: {
    name: string
    prefix: string
    lines: string[]
    out: string[]
    renames: Record<string, string>
  }[]
}

describe('stores.json', () => {
  const file = vectors('stores.json') as StoreFile
  const orUndefined = (value: string | null): string | undefined => value ?? undefined
  it('gives every parent', () =>
    file.parent.forEach((c) => assert.equal(parentOf(c.path) ?? null, c.parent, c.path)))
  it('gives every walk', () =>
    file.walk.forEach((c) =>
      assert.deepEqual(
        storeWalk(c.dir, orUndefined(c.workspaceRoot), orUndefined(c.home)),
        c.walk,
        c.name,
      ),
    ))
  it('gives every plan', () =>
    file.locate.forEach((c) =>
      assert.deepEqual(
        planAnchor(
          c.file,
          c.repository?.root,
          orUndefined(c.repository?.head ?? null),
          () => orUndefined(c.workspaceRoot),
          orUndefined(c.home),
          (dir) => c.stores.includes(dir),
        ),
        c.plan,
        c.name,
      ),
    ))
  it('gives every label', () =>
    file.label.forEach((c) =>
      assert.equal(rootLabel(c.root, orUndefined(c.home)), c.label, c.root),
    ))
  it('gives every prefix', () =>
    file.prefix.forEach((c) =>
      assert.equal(prefixOf(c.repository, c.folder) ?? null, c.prefix, c.folder),
    ))
  it('gives every rewrite', () =>
    file.rewrite.forEach((c) => {
      const result = rewriteRecords(c.lines, c.prefix)
      assert.deepEqual(result.lines, c.out, c.name)
      assert.deepEqual(Object.fromEntries(result.renames), c.renames, c.name)
    }))
})
