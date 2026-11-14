import assert from 'node:assert/strict'

import { PROJECT_MARK } from '../../../src/core/redact'
import {
  ISSUE_URL,
  MAX_URL,
  STACK_LINES,
  TITLE_LENGTH,
  failureStack,
  issueBody,
  issueLink,
  issueTitle,
} from '../../../src/diagnostic/issueForm'

const project = 'D:/Projects/client/app'
const places = { homes: ['C:/Users/alice'], projects: [project], repositories: [] }
const stack = [
  'IOError: the disk is full\n    at NotesGateway.append (dist/extension.js:1:41)\n    at CommentBook.add (dist/extension.js:1:22)',
]

describe('the issue form', () => {
  it('the title names the type and the message', () =>
    assert.equal(issueTitle('IOError', 'the disk is full', places), 'IOError: the disk is full'))
  it('the title of an empty message names the type alone', () =>
    assert.equal(issueTitle('IOError', '', places), 'IOError'))
  it('the title stays on one line', () =>
    assert.equal(issueTitle('IOError', 'first\nsecond', places), 'IOError: first'))
  it('the body carries the words of the reporter and the stack', () => {
    const body = issueBody('the send did nothing', stack, 'Yreview diagnostic report', places)
    assert.match(body, /the send did nothing/)
    assert.match(body, /NotesGateway\.append/)
    assert.match(body, /Yreview diagnostic report/)
  })
  it('the body says that the reporter wrote nothing', () =>
    assert.match(issueBody(undefined, stack, 'head', places), /The reporter wrote nothing here\./))
  it('the body cuts a long stack', () => {
    const long = Array.from({ length: 200 }, (_, i) => `\tat Frame${i}.run (frame.ts:${i})`).join(
      '\n',
    )
    assert.equal(
      issueBody(undefined, [long], 'head', places)
        .split('\n')
        .filter((line) => line.startsWith('\tat ')).length,
      STACK_LINES,
    )
  })
  it('the body carries no private value', () => {
    const body = issueBody(
      'it failed on git@github.com:alice-corp/app.git for alice@example.com',
      ['IOError: token=9f8e7d6c5b4a39281706f5e4d3c2b1a0'],
      'head',
      places,
    )
    assert.ok(!body.includes('alice'), body)
    assert.ok(!body.includes('9f8e7d6c5b4a39281706f5e4d3c2b1a0'), body)
  })
  it('a short form carries the text in the address', () => {
    const body = issueBody(undefined, stack, 'head', places)
    const link = issueLink(ISSUE_URL, 'IOError', body)
    assert.ok(link.prefilled)
    assert.ok(link.url.startsWith(`${ISSUE_URL}?title=`), link.url)
    assert.ok(link.url.length <= MAX_URL, `${link.url.length} characters`)
    assert.equal(new URL(link.url).searchParams.get('body'), body)
  })
  it('the body carries no absolute project path', () => {
    const body = issueBody(
      'the send failed',
      [`IOError: ${project}/src/main/Parser.ts is locked`],
      'head',
      places,
    )
    assert.ok(!body.includes(project), body)
    assert.ok(body.includes(`${PROJECT_MARK}/src/main/Parser.ts`), body)
  })
  it('the title carries no absolute project path', () =>
    assert.ok(!issueTitle('IOError', `${project}/build is locked`, places).includes(project)))
  it('the title cut runs after the redaction', () => {
    const home = 'C:/Users/alexandra'
    const title = issueTitle(
      'IOError',
      `${'x'.repeat(TITLE_LENGTH - 'C:/Users/alexand'.length)}${home}/AppData/state.json`,
      { homes: [home], projects: [project], repositories: [] },
    )
    assert.ok(!title.includes('alexand'), title)
    assert.ok(title.includes('x~/AppData'), title)
  })
  it('a long form gives the plain address back', () =>
    assert.deepEqual(issueLink(ISSUE_URL, 'IOError', 'x'.repeat(MAX_URL)), {
      url: ISSUE_URL,
      prefilled: false,
    }))
  it('a stack names each cause after the frames', () =>
    assert.equal(
      failureStack({
        name: 'ReadError',
        message: 'the read failed',
        frames: ['at a (x.js:1:1)'],
        cause: { name: 'IOError', frames: [] },
      }),
      'ReadError: the read failed\n    at a (x.js:1:1)\nCaused by: IOError',
    ))
})
