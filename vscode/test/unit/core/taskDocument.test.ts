import assert from 'node:assert/strict'

import {
  TASKS_VERSION,
  type TaskDocument,
  decodeTaskDocument,
  encodeTaskDocument,
} from '../../../src/core/taskDocument'

const document: TaskDocument = {
  version: TASKS_VERSION,
  repository: 'E:/repo',
  commit: '44787c6a1b2c3d4e5f60718293a4b5c6d7e8f900',
  generated: '2026-11-14T10:00:00Z',
  tasks: [
    {
      id: 'yabc',
      kind: 'comment',
      path: 'src/a.ts',
      startLine: 2,
      startColumn: 0,
      endLine: 2,
      endColumn: 4,
      text: 'Fix it.',
      author: 'r@example.com',
    },
    {
      id: 'ydef',
      kind: 'todo',
      path: 'src/b.ts',
      startLine: 9,
      endLine: 9,
      text: 'TODO: drop',
      pattern: 'TODO',
    },
  ],
}

describe('task document', () => {
  it('writes indented JSON with 4 spaces and leaves out an absent field', () => {
    const text = encodeTaskDocument(document)
    assert.ok(text.startsWith('{\n    "version": 2,\n    "repository": "E:/repo",'))
    assert.ok(!text.includes('"pattern": null'))
    assert.ok(text.includes('"startColumn": 0'))
  })

  it('reads what it writes', () => {
    assert.deepEqual(decodeTaskDocument(encodeTaskDocument(document)), document)
  })

  it('writes no field that is not part of the format', () => {
    const extra = {
      ...document,
      tasks: [{ ...(document.tasks[0] ?? assert.fail()), rootPath: 'E:/repo' }],
    }
    assert.ok(!encodeTaskDocument(extra).includes('rootPath'))
  })

  it('reads a file with no version as version 2', () => {
    const text = encodeTaskDocument(document).replace('"version": 2,', '')
    assert.equal(decodeTaskDocument(text)?.version, 2)
  })

  it('keeps version 1 of an older file', () => {
    const text = encodeTaskDocument(document).replace('"version": 2', '"version": 1')
    assert.equal(decodeTaskDocument(text)?.version, 1)
  })

  it('drops an unknown key', () => {
    assert.ok(
      decodeTaskDocument(encodeTaskDocument(document).replace('{', '{"next": [1, {"a": 2}],')),
    )
  })

  it('refuses a file that the Kotlin decoder refuses', () => {
    ;[
      '',
      '[]',
      '{"repository": "r", "commit": "c", "generated": "g"}',
      encodeTaskDocument(document).replace('"comment"', '"note"'),
      encodeTaskDocument(document).replace('"startLine": 2', '"startLine": 2.5'),
      encodeTaskDocument(document).replace('"startLine": 2', '"startLine": 2147483648'),
      encodeTaskDocument(document).replace(/\n}$/, ',\n}x'),
      '{"version": 2, "repository": "r", "commit": "c", "generated": "g", "tasks": [1,]}',
    ].forEach((text) => assert.equal(decodeTaskDocument(text), undefined, text))
  })
})
