import { strict as assert } from 'node:assert'

import {
  type OpenCodeSession,
  parseSessions,
  pickTitle,
  sameDirectory,
} from '../../../src/bridge/openCodeTitle'
import { LONGEST_TITLE, MORE } from '../../../src/tasks/taskLabels'

const session = (
  id: string,
  title: string,
  directory: string,
  updated: number,
): OpenCodeSession => ({
  id,
  title,
  directory,
  updated,
})

describe('OpenCode title (OpenCodeTitleTest.kt)', () => {
  it('the newest session of the directory names the tab', () => {
    const rows = [
      session('ses_a', 'an old talk', 'C:\\work\\app', 100),
      session('ses_b', 'the live talk', 'C:\\work\\app', 300),
      session('ses_c', 'a middle talk', 'C:\\work\\app', 200),
    ]
    assert.equal(pickTitle(rows, 'C:/work/app'), 'the live talk')
  })

  it('a session of another directory never names the tab', () => {
    const rows = [
      session('ses_a', 'another project', 'C:\\work\\other', 900),
      session('ses_b', 'this project', 'C:\\work\\app', 100),
    ]
    assert.equal(pickTitle(rows, 'C:/work/app'), 'this project')
  })

  it('one directory in two spellings is one directory', () => {
    assert.ok(sameDirectory('C:\\work\\app', 'C:/work/app'))
    assert.ok(sameDirectory('C:/work/app/', 'C:/work/app'))
    assert.ok(sameDirectory('c:/work/app', 'C:/work/app'))
    assert.ok(sameDirectory('c:\\work\\demo\\', 'C:/work/demo'))
    assert.ok(!sameDirectory('C:/work/app', 'C:/work/app2'))
  })

  it('two folders that differ by case are two folders', () => {
    assert.ok(!sameDirectory('/home/dev/Project', '/home/dev/project'))
    assert.ok(!sameDirectory('C:/work/App', 'C:/work/app'))
  })

  it('a session of a folder that differs by case never names the tab', () =>
    assert.equal(
      pickTitle(
        [session('ses_a', 'the other project', '/home/dev/Project', 900)],
        '/home/dev/project',
      ),
      undefined,
    ))

  it('an empty title is no name', () =>
    assert.equal(
      pickTitle([session('ses_a', '   ', 'C:/work/app', 100)], 'C:/work/app'),
      undefined,
    ))

  it('an empty answer is no name', () => assert.equal(pickTitle([], 'C:/work/app'), undefined))

  it('an answer with no row of this directory is no name', () =>
    assert.equal(
      pickTitle([session('ses_a', 'another project', 'C:/work/other', 100)], 'C:/work/app'),
      undefined,
    ))

  it('an answer of the real server parses', () => {
    const body = String.raw`[{"id":"ses_03adedcc9ffeOzIOhxpkTDNIR5","slug":"misty-orchid","projectID":"global",
      "directory":"C:\\Users\\dev","path":"Users/dev","cost":0,
      "tokens":{"input":13455,"output":10,"reasoning":0,"cache":{"read":128,"write":0}},
      "title":"Quick check-in","agent":"build",
      "model":{"id":"z-ai/glm-5.2","providerID":"nvidia"},"version":"1.18.4",
      "time":{"created":1785718711094,"updated":1785718727742}}]`
    assert.equal(pickTitle(parseSessions(body), 'C:/Users/dev'), 'Quick check-in')
  })

  it('a broken answer names nothing and throws nothing', () => {
    assert.deepEqual(parseSessions('not json at all'), [])
    assert.deepEqual(parseSessions(''), [])
  })

  it('an answer of a shape this build does not know names nothing', () => {
    assert.deepEqual(parseSessions('{"sessions":[{"title":"a talk"}]}'), [])
    assert.deepEqual(parseSessions('[1,2,3]'), [])
    assert.deepEqual(parseSessions('[null]'), [])
    assert.equal(pickTitle(parseSessions('{"title":"a talk"}'), 'C:/work/app'), undefined)
  })

  it('a row that carries no title names nothing', () => {
    const rows = parseSessions('[{"id":"ses_a","directory":"C:/work/app"}]')
    assert.equal(rows.length, 1)
    assert.equal(pickTitle(rows, 'C:/work/app'), undefined)
  })

  it('a blank title of the newest session drops the name of the tab', () => {
    const rows = [
      session('ses_a', 'an old talk', 'C:/work/app', 100),
      session('ses_b', '  ', 'C:/work/app', 300),
    ]
    assert.equal(pickTitle(rows, 'C:/work/app'), undefined)
  })

  it('a title that starts with the markup tag names nothing', () =>
    assert.equal(
      pickTitle([session('ses_a', '<html><b>owned</b>', 'C:/work/app', 100)], 'C:/work/app'),
      undefined,
    ))

  it('two tabs of one directory read one name', () => {
    const rows = [
      session('ses_a', 'the first talk', 'C:/work/app', 100),
      session('ses_b', 'the second talk', 'C:/work/app', 300),
    ]
    const first = pickTitle(rows, 'C:/work/app')
    assert.equal(first, 'the second talk')
    assert.equal(pickTitle(rows, 'C:/work/app'), first)
  })

  it('a long title is cut', () =>
    assert.equal(
      pickTitle([session('ses_a', 'z'.repeat(250), 'C:/work/app', 100)], 'C:/work/app'),
      `${'z'.repeat(LONGEST_TITLE)}${MORE}`,
    ))
})
