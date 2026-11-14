import assert from 'node:assert/strict'

import {
  LINK_PATH,
  MAX_LINE,
  commentLink,
  parseCommentLink,
} from '../../../src/preview/commentLink'

const parse = (link: string) => {
  const url = new URL(link)
  return parseCommentLink(url.pathname, url.search.slice(1))
}

describe('the comment link', () => {
  ;['E:\\work\\demo\\notes.md', '/home/a b/c+d&e%20f.md', '/srv/caf\u00e9/\u6587\u4ef6.md'].forEach(
    (file) =>
      it(`keeps the path ${JSON.stringify(file)} through a round trip`, () =>
        assert.deepEqual(parse(commentLink('vscode', file, 12)), { file, line: 12 })),
  )

  it('uses the scheme and the authority of the extension', () =>
    assert.ok(
      commentLink('cursor', '/a.md', 1).startsWith('cursor://yeskiy.yreview/comment?file='),
    ))

  it('refuses another path', () =>
    assert.equal(parseCommentLink('/delete', 'file=L2EubWQ&line=1'), undefined))
  it('refuses a missing file', () => assert.equal(parseCommentLink(LINK_PATH, 'line=1'), undefined))
  it('refuses a missing line', () =>
    assert.equal(parseCommentLink(LINK_PATH, 'file=L2EubWQ'), undefined))
  ;['0', '01', '-1', '1.5', 'x', String(MAX_LINE + 1), '123456789'].forEach((line) =>
    it(`refuses the line ${line}`, () =>
      assert.equal(parseCommentLink(LINK_PATH, `file=L2EubWQ&line=${line}`), undefined)),
  )
  it('refuses a file that is no base64url', () =>
    assert.equal(parseCommentLink(LINK_PATH, 'file=L2Eu+bWQ=&line=1'), undefined))
  it('refuses a file with a NUL character', () =>
    assert.equal(
      parseCommentLink(
        LINK_PATH,
        `file=${Buffer.from('/a\u0000.md').toString('base64url')}&line=1`,
      ),
      undefined,
    ))
  it('refuses bytes that are no UTF-8', () =>
    assert.equal(
      parseCommentLink(LINK_PATH, `file=${Buffer.from([0xff, 0xfe]).toString('base64url')}&line=1`),
      undefined,
    ))
})
