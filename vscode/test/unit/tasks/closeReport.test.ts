import assert from 'node:assert/strict'

import { closeSentence } from '../../../src/tasks/taskCompletion'

const done = 'The extension resolved 200 comments.'

describe('CloseReport', () => {
  it('a report with no problem reads as the count alone', () => {
    assert.equal(closeSentence({ closed: 200, problems: [] }, done), done)
  })

  it('a report with a problem still names the count', () => {
    const text = closeSentence({ closed: 200, problems: ['It left 50 out.'] }, done)
    assert.ok(text.startsWith(done), `the count comes first: ${text}`)
    assert.ok(text.includes('It left 50 out.'), text)
  })

  it('a report with no words about the count reads as the problem alone', () => {
    assert.equal(closeSentence({ closed: 0, problems: ['It left 50 out.'] }, ''), 'It left 50 out.')
  })
})
